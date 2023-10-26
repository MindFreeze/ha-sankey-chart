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
import './section';

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
  @state() private statePerPixelY = 0;
  @state() private entityStates: Map<EntityConfigInternal, NormalizedState> = new Map();
  @state() private highlightedEntities: EntityConfigInternal[] = [];
  @state() private lastUpdate = 0;
  @state() public zoomEntity?: EntityConfigInternal;

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }
    if (
      changedProps.has('config') ||
      changedProps.has('forceUpdateTs') ||
      changedProps.has('highlightedEntities') ||
      changedProps.has('zoomEntity')
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
    if (!this.entityIds.length || changedProps.has('config')) {
      this.entityIds = [];
      this.connections = [];
      this.connectionsByParent.clear();
      this.connectionsByChild.clear();
      this.config.sections.forEach(({ entities }, sectionIndex) => {
        entities.forEach(ent => {
          if (ent.type === 'entity') {
            this.entityIds.push(ent.entity_id);
          }
          ent.children.forEach(childId => {
            const child = this.config.sections[sectionIndex + 1]?.entities.find(e => e.entity_id === childId);
            if (!child) {
              throw new Error(localize('common.missing_child') + ' ' + childId);
            }
            const connection: ConnectionState = {
              parent: ent,
              child,
              state: 0,
              prevParentState: 0,
              prevChildState: 0,
              ready: false,
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
    });
    this.connections.forEach(c => this._calcConnection(c, accountedIn, accountedOut));
  }

  private _calcConnection(
    connection: ConnectionState,
    accountedIn: Map<EntityConfigInternal, number>,
    accountedOut: Map<EntityConfigInternal, number>,
  ) {
    if (connection.ready) {
      return;
    }
    const { parent, child } = connection;
    [parent, child].forEach(ent => {
      if (ent.type === 'remaining_child_state') {
        this.connectionsByParent.get(ent)!.forEach(c => {
          if (!c.ready) {
            this.connectionsByChild.get(c.child)?.forEach(conn => {
              if (conn.parent !== parent) {
                this._calcConnection(conn, accountedIn, accountedOut);
              }
            });
          }
        });
      }
      if (ent.type === 'remaining_parent_state') {
        this.connectionsByChild.get(ent)?.forEach(c => {
          if (!c.ready) {
            this.connectionsByParent.get(c.parent)?.forEach(conn => {
              if (conn.child !== child) {
                this._calcConnection(conn, accountedIn, accountedOut);
              }
            });
          }
        });
      }
    });

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
      connection.state = Math.min(parentState, childState);
      accountedOut.set(parent, connection.prevParentState + connection.state);
      accountedIn.set(child, connection.prevChildState + connection.state);
    }
    connection.ready = true;
    if (child.type === 'passthrough') {
      this.entityStates.delete(child);
    }
  }

  private _getMemoizedState(entityConf: EntityConfigInternal) {
    if (!this.entityStates.has(entityConf)) {
      const entity = this._getEntityState(entityConf);
      const unit_of_measurement = entityConf.unit_of_measurement || entity.attributes.unit_of_measurement;
      const normalized = normalizeStateValue(this.config.unit_prefix, Number(entity.state), unit_of_measurement);

      if (entityConf.type === 'passthrough') {
        const connections = this.connectionsByChild.get(entityConf);
        if (!connections) {
          throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
        }
        const state = connections.reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
        if (state !== Infinity) {
          normalized.state = state;
        }
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
      this.entityStates.set(entityConf, normalized);
    }
    return this.entityStates.get(entityConf)!;
  }

  private _calcBoxes() {
    this.statePerPixelY = 0;
    const filteredConfig = filterConfigByZoomEntity(this.config, this.zoomEntity);
    const sectionsStates: SectionState[] = [];
    filteredConfig.sections.forEach(section => {
      let total = 0;
      const boxes: Box[] = section.entities
        .filter(entityConf => {
          const { min_state } = this.config;
          // remove empty entity boxes
          if (entityConf.type === 'remaining_parent_state') {
            return this.connectionsByChild.get(entityConf)?.some(c => c.state && c.state >= min_state);
          }
          if (entityConf.type === 'remaining_child_state') {
            return this.connectionsByParent.get(entityConf)?.some(c => c.state && c.state >= min_state);
          }
          const { state } = this._getMemoizedState(entityConf);
          return state && state >= min_state;
        })
        .map(entityConf => {
          const { state, unit_of_measurement } = this._getMemoizedState(entityConf);
          total += state;

          let finalColor = entityConf.color || 'var(--primary-color)';
          if (typeof entityConf.color_on_state != 'undefined' && entityConf.color_on_state) {
            const colorLimit = typeof entityConf.color_limit === 'undefined' ? 1 : entityConf.color_limit;
            const colorBelow =
              typeof entityConf.color_below === 'undefined' ? 'var(--primary-color)' : entityConf.color_below;
            const colorAbove =
              typeof entityConf.color_above === 'undefined' ? 'var(--paper-item-icon-color)' : entityConf.color_above;
            finalColor = state > colorLimit ? colorAbove : colorBelow;
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
          };
        });
      if (!boxes.length) {
        return;
      }
      // leave room for margin
      const availableHeight = this.config.height - (boxes.length - 1) * this.config.min_box_distance;
      // calc sizes to determine statePerPixelY ratio and find the best one
      const calcResults = this._calcBoxHeights(boxes, availableHeight, total);
      const parentBoxes = section.sort_group_by_parent ? sectionsStates[sectionsStates.length - 1]?.boxes || [] : [];
      sectionsStates.push({
        boxes: sortBoxes(parentBoxes, calcResults.boxes, section.sort_by, section.sort_dir),
        total,
        statePerPixelY: calcResults.statePerPixelY,
        spacerH: 0,
        config: section,
      });
    });

    this.sections = sectionsStates.map(sectionState => {
      // calc sizes again with the best statePerPixelY
      let totalSize = 0;
      let sizedBoxes = sectionState.boxes;
      if (sectionState.statePerPixelY !== this.statePerPixelY) {
        sizedBoxes = sizedBoxes.map(box => {
          const size = Math.max(this.config.min_box_height, Math.floor(box.state / this.statePerPixelY));
          totalSize += size;
          return {
            ...box,
            size,
          };
        });
      } else {
        totalSize = sizedBoxes.reduce((sum, b) => sum + b.size, 0);
      }
      // calc vertical margin size
      const extraSpace = this.config.height - totalSize;
      const spacerH = sizedBoxes.length > 1 ? extraSpace / (sizedBoxes.length - 1) : this.config.height;
      let offset = 0;
      // calc y positions. needed for connectors
      sizedBoxes = sizedBoxes.map(box => {
        const top = offset;
        offset += box.size + spacerH;
        return {
          ...box,
          top,
        };
      });
      return {
        ...sectionState,
        boxes: sizedBoxes,
        spacerH,
      };
    });
  }

  private _calcBoxHeights(
    boxes: Box[],
    availableHeight: number,
    totalState: number,
  ): { boxes: Box[]; statePerPixelY: number } {
    const statePerPixelY = totalState / availableHeight;
    if (statePerPixelY > this.statePerPixelY) {
      this.statePerPixelY = statePerPixelY;
    }
    let deficitHeight = 0;
    const result = boxes.map(box => {
      if (box.size === this.config.min_box_height) {
        return box;
      }
      let size = Math.floor(box.state / this.statePerPixelY);
      if (size < this.config.min_box_height) {
        deficitHeight += this.config.min_box_height - size;
        size = this.config.min_box_height;
      }
      return {
        ...box,
        size,
      };
    });
    if (deficitHeight > 0) {
      return this._calcBoxHeights(result, availableHeight - deficitHeight, totalState);
    }
    return { boxes: result, statePerPixelY: this.statePerPixelY };
  }

  private highlightPath(entityConf: EntityConfigInternal, direction: 'parents' | 'children') {
    this.highlightedEntities.push(entityConf);
    if (direction === 'children') {
      this.connectionsByParent.get(entityConf)?.forEach(c => {
        c.highlighted = true;
        this.highlightPath(c.child, 'children');
      });
    } else {
      this.connectionsByChild.get(entityConf)?.forEach(c => {
        c.highlighted = true;
        this.highlightPath(c.parent, 'parents');
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
    this.highlightPath(box.config, 'children');
    this.highlightPath(box.config, 'parents');
    // trigger rerender
    this.highlightedEntities = [...this.highlightedEntities];
  }

  private _handleMouseLeave(): void {
    this.highlightedEntities = [];
    this.connections.forEach(c => {
      c.highlighted = false;
    });
  }

  private _getEntityState(entityConf: EntityConfigInternal) {
    if (entityConf.type === 'remaining_parent_state') {
      const connections = this.connectionsByChild.get(entityConf);
      if (!connections) {
        throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
      }
      const { parent } = connections[0];
      const state = connections.reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      const parentEntity = this._getEntityState(parent);
      const { unit_of_measurement } = normalizeStateValue(
        this.config.unit_prefix,
        0,
        parentEntity.attributes.unit_of_measurement,
      );
      return { ...parentEntity, state, attributes: { ...parentEntity.attributes, unit_of_measurement } };
    }
    if (entityConf.type === 'remaining_child_state') {
      const connections = this.connectionsByParent.get(entityConf);
      if (!connections) {
        throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
      }
      const { child } = connections[0];
      const state = connections.reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      const childEntity = this._getEntityState(child);
      const { unit_of_measurement } = normalizeStateValue(
        this.config.unit_prefix,
        0,
        childEntity.attributes.unit_of_measurement,
      );
      return { ...childEntity, state, attributes: { ...childEntity.attributes, unit_of_measurement } };
    }

    let entity = this.states[getEntityId(entityConf)];
    if (!entity) {
      throw new Error('Entity not found "' + getEntityId(entityConf) + '"');
    }

    if (typeof entityConf === 'object' && entityConf.attribute) {
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

  static get styles(): CSSResultGroup {
    return styles;
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    try {
      this.entityStates.clear();
      const containerClasses = classMap({
        container: true,
        wide: !!this.config.wide,
        'with-header': !!this.config.title,
      });

      if (!Object.keys(this.states).length) {
        return html`
          <ha-card label="Sankey Chart" .header=${this.config.title}>
            <div class=${containerClasses} style=${styleMap({ height: this.config.height + 'px' })}>
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
          <div class=${containerClasses} style=${styleMap({ height: this.config.height + 'px' })}>
            ${this.sections.map(
              (s, i) => html` <sankey-chart-section
                .config=${this.config}
                .section=${s}
                .nextSection=${this.sections[i + 1]}
                .highlightedEntities=${this.highlightedEntities}
                .statePerPixelY=${this.statePerPixelY}
                .connectionsByParent=${this.connectionsByParent}
                .connectionsByChild=${this.connectionsByChild}
                .onTap=${this._handleBoxTap.bind(this)}
                .onDoubleTap=${this._handleBoxDoubleTap.bind(this)}
                .onMouseEnter=${this._handleMouseEnter.bind(this)}
                .onMouseLeave=${this._handleMouseLeave.bind(this)}
              ></sankey-chart-section>`,
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
