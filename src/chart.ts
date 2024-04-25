import { LitElement, html, TemplateResult, PropertyValues, CSSResultGroup } from 'lit';
import { styleMap } from 'lit/directives/style-map';
import { classMap } from 'lit/directives/class-map';
import { until } from 'lit/directives/until.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import { HomeAssistant } from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import type { Config, SectionState, Box, ConnectionState, EntityConfigInternal, NormalizedState } from './types';
import { localize } from './localize/localize';
import styles from './styles';
import { getEntityId, normalizeStateValue, renderError, sortBoxes } from './utils';
import { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { handleAction } from './handle-actions';
import { filterConfigByZoomEntity } from './zoom';
import { renderSection } from './section';
import { shouldBeVertical } from './layout';

@customElement('sankey-chart-base')
export class Chart extends LitElement {
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public states!: HassEntities;
  @property({ attribute: false }) public forceUpdateTs?: number;

  @state() private config!: Config;
  @state() private sections: SectionState[] = [];
  @state() private entityIds: string[] = [];
  @state() private connections: ConnectionState[] = [];
  @state() private connectionsByParent: Map<EntityConfigInternal, ConnectionState[]> = new Map();
  @state() private connectionsByChild: Map<EntityConfigInternal, ConnectionState[]> = new Map();
  @state() private statePerPixel = 0;
  @state() private entityStates: Map<EntityConfigInternal | string, NormalizedState> = new Map();
  @state() private highlightedEntities: EntityConfigInternal[] = [];
  @state() private lastUpdate = 0;
  @state() private vertical = false;
  @state() private width = 0; // passed from parent
  @state() public zoomEntity?: EntityConfigInternal;
  @state() public error?: Error;

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }
    if (
      changedProps.has('config') ||
      changedProps.has('forceUpdateTs') ||
      changedProps.has('highlightedEntities') ||
      changedProps.has('zoomEntity') ||
      changedProps.has('width')
    ) {
      return true;
    }
    const now = Date.now();
    if (this.config.throttle && now - this.lastUpdate < this.config.throttle) {
      // woah there
      const ts = this.lastUpdate;
      setTimeout(() => {
        if (ts === this.lastUpdate) {
          // trigger manual update if no changes since last rejected update
          this.requestUpdate();
        }
      }, now - this.lastUpdate);
      return false;
    }

    const oldStates = changedProps.get('states') as HomeAssistant | undefined;
    if (!oldStates) {
      return false;
    }
    if (!Object.keys(oldStates).length) {
      return true;
    }
    return this.entityIds.some(id => {
      return oldStates[id] !== this.states[id] && oldStates[id].state !== this.states[id].state;
    });
  }

  public willUpdate(changedProps: PropertyValues): void {
    this.vertical = shouldBeVertical(this.config, this.width);
    if (!this.entityIds.length || changedProps.has('config')) {
      this.entityIds = [];
      this.connections = [];
      this.connectionsByParent.clear();
      this.connectionsByChild.clear();
      this.config.sections.forEach(({ entities }, sectionIndex) => {
        entities.forEach(ent => {
          if (ent.type === 'entity') {
            this.entityIds.push(ent.entity_id);
          } else if (ent.type === 'passthrough') {
            return;
          }
          ent.children.forEach(childConf => {
            const passthroughs: EntityConfigInternal[] = [];
            const childId = getEntityId(childConf);
            let child: EntityConfigInternal | undefined = ent;
            for (let i = sectionIndex + 1; i < this.config.sections.length; i++) {
              child = this.config.sections[i]?.entities.find(e => e.entity_id === childId);
              if (!child) {
                this.error = new Error(localize('common.missing_child') + ' ' + getEntityId(childConf));
                throw this.error;
              }
              if (child.type !== 'passthrough') {
                break;
              }
              passthroughs.push(child);
            }
            const connection: ConnectionState = {
              parent: ent,
              child: child,
              state: 0,
              prevParentState: 0,
              prevChildState: 0,
              ready: false,
              passthroughs,
            };
            this.connections.push(connection);
            if (!this.connectionsByParent.has(ent)) {
              this.connectionsByParent.set(ent, []);
            }
            this.connectionsByParent.get(ent)!.push(connection);
            if (!this.connectionsByChild.has(child)) {
              this.connectionsByChild.set(child, []);
            }
            this.connectionsByChild.get(child)!.push(connection);
          });
        });
      });
    }
  }

  private _calcConnections() {
    const accountedIn = new Map<EntityConfigInternal, number>();
    const accountedOut = new Map<EntityConfigInternal, number>();
    this.connections.forEach(c => {
      c.ready = false;
      c.calculating = false;
    });
    this.connections.forEach(c => this._calcConnection(c, accountedIn, accountedOut));
  }

  private _calcConnection(
    connection: ConnectionState,
    accountedIn: Map<EntityConfigInternal, number>,
    accountedOut: Map<EntityConfigInternal, number>,
    force?: boolean,
  ) {
    if (connection.ready && !force) {
      return;
    }
    const { parent, child } = connection;

    if (!connection.calculating) {
      connection.calculating = true;
      [parent, child].forEach(ent => {
        if (ent.type === 'remaining_child_state') {
          this.connectionsByParent.get(ent)!.forEach(c => {
            if (!c.ready) {
              this.connectionsByChild.get(c.child)?.forEach(conn => {
                if (conn !== connection && !conn.calculating) {
                  this._calcConnection(conn, accountedIn, accountedOut);
                }
              });
            }
          });
        } else if (ent.type === 'remaining_parent_state') {
          this.connectionsByChild.get(ent)!.forEach(c => {
            if (!c.ready) {
              this.connectionsByParent.get(c.parent)?.forEach(conn => {
                if (conn !== connection && !conn.calculating) {
                  this._calcConnection(conn, accountedIn, accountedOut);
                }
              });
            }
          });
        }
      });
    }

    const parentStateNormalized = this._getMemoizedState(parent);
    const parentStateFull = parentStateNormalized.state ?? 0;
    connection.prevParentState = accountedOut.get(parent) ?? 0;
    const parentState = Math.max(0, parentStateFull - connection.prevParentState);
    const childStateNormalized = this._getMemoizedState(child);
    const childStateFull = childStateNormalized.state ?? 0;
    connection.prevChildState = accountedIn.get(child) ?? 0;
    const childState = Math.max(0, childStateFull - connection.prevChildState);

    if (!parentState || !childState) {
      connection.state = 0;
    } else {
      const connConfig = parent.children.find(c => getEntityId(c) === child.entity_id);
      if (typeof connConfig === 'object' && connConfig.connection_entity_id) {
        const connectionState = this._getMemoizedState(connConfig.connection_entity_id).state ?? 0;
        connection.state = Math.min(parentState, childState, connectionState);
      } else {
        connection.state = Math.min(parentState, childState);
      }
      accountedOut.set(parent, connection.prevParentState + connection.state);
      accountedIn.set(child, connection.prevChildState + connection.state);
    }
    connection.ready = true;
    if (
      (!force &&
        child.type === 'remaining_parent_state' &&
        (child.add_entities?.length || child.subtract_entities?.length) &&
        childState === Infinity) ||
      (parent.type === 'remaining_child_state' &&
        (parent.add_entities?.length || parent.subtract_entities?.length) &&
        parentState === Infinity)
    ) {
      // #111 remaining state with add/subtract entities
      accountedOut.set(parent, connection.prevParentState);
      accountedIn.set(child, connection.prevChildState);
      this._calcConnection(connection, accountedIn, accountedOut, true);
    }
  }

  private _getMemoizedState(entityConfOrStr: EntityConfigInternal | string) {
    if (!this.entityStates.has(entityConfOrStr)) {
      const entityConf =
        typeof entityConfOrStr === 'string' ? { entity_id: entityConfOrStr, children: [] } : entityConfOrStr;
      const entity = this._getEntityState(entityConf);
      const unit_of_measurement = this._getUnitOfMeasurement(
        entityConf.unit_of_measurement || entity.attributes.unit_of_measurement,
      );
      const normalized = normalizeStateValue(this.config.unit_prefix, Number(entity.state), unit_of_measurement);

      if (entityConf.type === 'passthrough') {
        normalized.state = this.connections
          .filter(c => c.passthroughs.includes(entityConf))
          .reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      }
      if (entityConf.add_entities) {
        entityConf.add_entities.forEach(subId => {
          const subEntity = this._getEntityState({ entity_id: subId, children: [] });
          const { state } = normalizeStateValue(
            this.config.unit_prefix,
            Number(subEntity.state),
            subEntity.attributes.unit_of_measurement || unit_of_measurement,
          );
          normalized.state += state;
        });
      }
      if (entityConf.subtract_entities) {
        entityConf.subtract_entities.forEach(subId => {
          const subEntity = this._getEntityState({ entity_id: subId, children: [] });
          const { state } = normalizeStateValue(
            this.config.unit_prefix,
            Number(subEntity.state),
            subEntity.attributes.unit_of_measurement || unit_of_measurement,
          );
          // stay positive
          normalized.state -= Math.min(state, normalized.state);
        });
      }
      if (normalized.state === Infinity) {
        // don't cache infinity
        return normalized;
      }
      this.entityStates.set(entityConfOrStr, normalized);
    }
    return this.entityStates.get(entityConfOrStr)!;
  }

  private _calcBoxes() {
    this.statePerPixel = 0;
    if (this.config.static_scale) {
      // use static scale to set a minimum statePerPixel
      this._calcBoxHeights(
        [{ state: this.config.static_scale, size: 0 } as Box],
        this.config.height,
        this.config.static_scale,
      );
    }
    const filteredConfig = filterConfigByZoomEntity(this.config, this.zoomEntity);
    const sectionsStates: SectionState[] = [];
    // 32 is the padding of the card
    const sectionSize = this.vertical ? this.width - 32 : this.config.height;
    filteredConfig.sections.forEach(section => {
      let total = 0;
      const boxes: Box[] = section.entities
        .filter(entityConf => {
          const { min_state } = this.config;
          // remove empty entity boxes
          const { state } = this._getMemoizedState(entityConf);
          return state && state >= min_state;
        })
        .map(entityConf => {
          const { state, unit_of_measurement } = this._getMemoizedState(entityConf);
          total += state;

          let finalColor = entityConf.color || 'var(--primary-color)';
          if (entityConf.color_on_state) {
            let state4color = state;
            if (entityConf.type === 'passthrough') {
              // passthrough color is based on the child state
              const childState = this._getMemoizedState(this._findRelatedRealEntity(entityConf, 'children'));
              state4color = childState.state;
            }
            const colorLimit = entityConf.color_limit ?? 1;
            const colorBelow = entityConf.color_below ?? 'var(--primary-color)';
            const colorAbove = entityConf.color_above ?? 'var(--paper-item-icon-color)';
            if (state4color > colorLimit) {
              finalColor = colorAbove;
            } else if (state4color < colorLimit) {
              finalColor = colorBelow;
            }
          }

          return {
            config: entityConf,
            entity: this._getEntityState(entityConf),
            entity_id: getEntityId(entityConf),
            state,
            unit_of_measurement,
            color: finalColor,
            children: entityConf.children,
            connections: { parents: [] },
            top: 0,
            size: 0,
            connectedParentState: 0,
          };
        });
      if (!boxes.length) {
        return;
      }
      // leave room for margin
      const availableHeight = sectionSize - (boxes.length - 1) * this.config.min_box_distance;
      // calc sizes to determine statePerPixel ratio and find the best one
      const calcResults = this._calcBoxHeights(boxes, availableHeight, total);
      const parentBoxes = section.sort_group_by_parent ? sectionsStates[sectionsStates.length - 1]?.boxes || [] : [];
      const sortBy = section.sort_by || this.config.sort_by;
      const sortDir = section.sort_dir || this.config.sort_dir;
      sectionsStates.push({
        boxes: sortBoxes(parentBoxes, calcResults.boxes, sortBy, sortDir),
        total,
        statePerPixel: calcResults.statePerPixel,
        spacerSize: 0,
        config: section,
        size: sectionSize,
      });
    });

    this.sections = sectionsStates.map(sectionState => {
      // calc sizes again with the best statePerPixel
      let totalSize = 0;
      let sizedBoxes = sectionState.boxes;
      if (sectionState.statePerPixel !== this.statePerPixel) {
        sizedBoxes = sizedBoxes.map(box => {
          const size = Math.max(this.config.min_box_size, Math.floor(box.state / this.statePerPixel));
          totalSize += size;
          return {
            ...box,
            size,
          };
        });
      } else {
        totalSize = sizedBoxes.reduce((sum, b) => sum + b.size, 0);
      }
      // calc margin betwee boxes
      const extraSpace = sectionSize - totalSize;
      const spacerSize = sizedBoxes.length > 1 ? extraSpace / (sizedBoxes.length - 1) : extraSpace / 2;
      let offset = sizedBoxes.length > 1 ? 0 : extraSpace / 2;
      // calc y positions. needed for connectors
      sizedBoxes = sizedBoxes.map(box => {
        const top = offset;
        offset += box.size + spacerSize;
        return {
          ...box,
          top,
        };
      });
      return {
        ...sectionState,
        boxes: sizedBoxes,
        spacerSize,
      };
    });
  }

  private _calcBoxHeights(
    boxes: Box[],
    availableHeight: number,
    totalState: number,
  ): { boxes: Box[]; statePerPixel: number } {
    const statePerPixel = totalState / availableHeight;
    if (statePerPixel > this.statePerPixel) {
      this.statePerPixel = statePerPixel;
    }
    let deficitHeight = 0;
    const result = boxes.map(box => {
      if (box.size === this.config.min_box_size) {
        return box;
      }
      let size = Math.floor(box.state / this.statePerPixel);
      if (size < this.config.min_box_size) {
        deficitHeight += this.config.min_box_size - size;
        size = this.config.min_box_size;
      }
      return {
        ...box,
        size,
      };
    });
    if (deficitHeight > 0) {
      return this._calcBoxHeights(result, availableHeight - deficitHeight, totalState);
    }
    return { boxes: result, statePerPixel: this.statePerPixel };
  }

  private highlightPath(entityConf: EntityConfigInternal, direction?: 'parents' | 'children') {
    this.highlightedEntities.push(entityConf);
    if (!direction || direction === 'children') {
      this.connections.forEach(c => {
        if (c.passthroughs.includes(entityConf) || c.parent === entityConf) {
          if (!c.highlighted) {
            c.passthroughs.forEach(p => this.highlightedEntities.push(p));
            c.highlighted = true;
          }
          if (!this.highlightedEntities.includes(c.child)) {
            this.highlightedEntities.push(c.child);
            this.highlightPath(c.child, 'children');
          }
        }
      });
    }
    if (!direction || direction === 'parents') {
      this.connections.forEach(c => {
        if (c.passthroughs.includes(entityConf) || c.child === entityConf) {
          if (!c.highlighted) {
            c.passthroughs.forEach(p => this.highlightedEntities.push(p));
            c.highlighted = true;
          }
          if (!this.highlightedEntities.includes(c.parent)) {
            this.highlightedEntities.push(c.parent);
            this.highlightPath(c.parent, 'parents');
          }
        }
      });
    }
  }

  private _handleBoxTap(box: Box): void {
    handleAction(this, this.hass, box.config, 'tap');
  }

  private _handleBoxDoubleTap(box: Box): void {
    handleAction(this, this.hass, box.config, 'double_tap');
  }

  private _handleMouseEnter(box: Box): void {
    this.highlightPath(box.config);
    // trigger rerender
    this.highlightedEntities = [...this.highlightedEntities];
  }

  private _handleMouseLeave(): void {
    this.highlightedEntities = [];
    this.connections.forEach(c => {
      c.highlighted = false;
    });
  }

  private _getUnitOfMeasurement(reported_unit_of_measurement: string): string {
    // If converting to money, don't actually display the word "monetary"
    if (this.config.convert_units_to == 'monetary') {
      return '';
    }

    // If converting from kWh to gCO2, attributes.unit_of_measurement remains kWh even though the number is gCO2, so we
    // override the unit to gCO2, unless normalizeStateValue() has already converted it to kgCO2.
    if (this.config.convert_units_to && !reported_unit_of_measurement.endsWith(this.config.convert_units_to)) {
      return this.config.convert_units_to;
    }

    return reported_unit_of_measurement;
  }

  private _getEntityState(entityConf: EntityConfigInternal) {
    if (entityConf.type === 'remaining_parent_state') {
      const connections = this.connectionsByChild.get(entityConf);
      if (!connections) {
        throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
      }
      const state = connections.reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      const parentEntity = this._getEntityState(this._findRelatedRealEntity(entityConf, 'parents'));
      const { unit_of_measurement } = normalizeStateValue(
        this.config.unit_prefix,
        0,
        this._getUnitOfMeasurement(parentEntity.attributes.unit_of_measurement),
      );
      return { ...parentEntity, state, attributes: { ...parentEntity.attributes, unit_of_measurement } };
    }
    if (entityConf.type === 'remaining_child_state') {
      const connections = this.connectionsByParent.get(entityConf);
      if (!connections) {
        throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
      }
      const state = connections.reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      const childEntity = this._getEntityState(this._findRelatedRealEntity(entityConf, 'children'));
      const { unit_of_measurement } = normalizeStateValue(
        this.config.unit_prefix,
        0,
        this._getUnitOfMeasurement(childEntity.attributes.unit_of_measurement),
      );
      return { ...childEntity, state, attributes: { ...childEntity.attributes, unit_of_measurement } };
    }
    if (entityConf.type === 'passthrough') {
      const realConnection = this.connections.find(c => c.passthroughs.includes(entityConf));
      if (!realConnection) {
        throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
      }
      return this._getEntityState(realConnection.child);
    }

    let entity = this.states[getEntityId(entityConf)];
    if (!entity) {
      throw new Error('Entity not found "' + getEntityId(entityConf) + '"');
    }

    if (entityConf.attribute) {
      entity = { ...entity, state: entity.attributes[entityConf.attribute] } as HassEntity;
      if (entityConf.unit_of_measurement) {
        entity = {
          ...entity,
          attributes: { ...entity.attributes, unit_of_measurement: entityConf.unit_of_measurement },
        };
      }
    }
    return entity;
  }

  // find the first parent/child that is type: entity
  private _findRelatedRealEntity(entityConf: EntityConfigInternal, direction: 'parents' | 'children') {
    let connection: ConnectionState | undefined;
    if (entityConf.type === 'passthrough') {
      connection = this.connections.find(c => c.passthroughs.includes(entityConf));
    } else {
      const connections =
        direction === 'parents' ? this.connectionsByChild.get(entityConf) : this.connectionsByParent.get(entityConf);
      if (!connections) {
        throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
      }
      connection = connections[0];
    }
    if (connection) {
      return direction === 'parents' ? connection.parent : connection.child;
    }
    return entityConf;
  }

  static get styles(): CSSResultGroup {
    return styles;
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    try {
      if (this.error) {
        throw this.error;
      }
      this.entityStates.clear();
      const containerClasses = classMap({
        container: true,
        wide: !!this.config.wide,
        'with-header': !!this.config.title,
        vertical: this.vertical,
      });

      const height = this.vertical ? 'auto' : this.config.height + 'px';

      if (!Object.keys(this.states).length) {
        return html`
          <ha-card label="Sankey Chart" .header=${this.config.title}>
            <div class=${containerClasses} style=${styleMap({ height: height })}>
              ${localize('common.loading')}
            </div>
          </ha-card>
        `;
      }

      this._calcConnections();
      this._calcBoxes();

      this.lastUpdate = Date.now();

      return html`
        <ha-card label="Sankey Chart" .header=${this.config.title}>
          <div class=${containerClasses} style=${styleMap({ height: height })}>
            ${this.sections.map((s, i) =>
              renderSection({
                locale: this.hass.locale,
                config: this.config,
                section: s,
                nextSection: this.sections[i + 1],
                sectionIndex: i,
                highlightedEntities: this.highlightedEntities,
                connectionsByParent: this.connectionsByParent,
                connectionsByChild: this.connectionsByChild,
                allConnections: this.connections,
                onTap: this._handleBoxTap.bind(this),
                onDoubleTap: this._handleBoxDoubleTap.bind(this),
                onMouseEnter: this._handleMouseEnter.bind(this),
                onMouseLeave: this._handleMouseLeave.bind(this),
                vertical: this.vertical,
              }),
            )}
          </div>
        </ha-card>
      `;
    } catch (err) {
      console.error(err);
      return html`${until(renderError(String(err), this.config, this.hass))}`;
    }
  }
}

export default Chart;
