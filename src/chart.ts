import { LitElement, html, TemplateResult, PropertyValues, CSSResultGroup } from 'lit';
import { classMap } from 'lit/directives/class-map';
import { until } from 'lit/directives/until.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import { HomeAssistant } from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import type { Config, SectionState, Box, ConnectionState, EntityConfigInternal, NormalizedState } from './types';
import { isCarbonNodeType } from './types';
import { localize } from './localize/localize';
import styles from './styles';
import { formatState, getBoxName, getEntityId, normalizeStateValue, renderError, sortBoxes, generateRandomRGBColor } from './utils';
import {
  CHAR_WIDTH_RATIO,
  LABEL_PADDING,
  MIN_LABEL_HEIGHT,
  MIN_VERTICAL_SECTION_H,
  NAME_CHAR_WIDTH,
  SEPARATOR_WIDTH,
} from './const';
import { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { handleAction } from './handle-actions';
import { filterConfigByZoomEntity } from './zoom';
import { renderSection } from './section';
import { shouldBeVertical } from './layout';
import { reconcileEntity } from './reconcile';

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
  @state() private reconciledStates: Map<EntityConfigInternal | string, number> = new Map();
  @state() private statePerPixel = 0;
  @state() private entityStates: Map<EntityConfigInternal | string, NormalizedState> = new Map();
  @state() private highlightedEntities: EntityConfigInternal[] = [];
  @state() private lastUpdate = 0;
  @state() private vertical = false;
  @state() private width = 0; // passed from parent
  @state() public zoomEntity?: EntityConfigInternal;
  @state() public error?: Error;

  private randomColors = new Map<string, string>();

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
      this.reconciledStates.clear();
      // Passthroughs have unique ids in v4 and carry an explicit outgoing link
      // (children[0]). Follow that chain to the first non-passthrough node
      // instead of matching by id across sections.
      const byId = new Map<string, EntityConfigInternal>();
      this.config.sections.forEach(({ entities }) =>
        entities.forEach(e => byId.set(e.id, e)),
      );
      this.config.sections.forEach(({ entities }) => {
        entities.forEach(ent => {
          if (ent.type === 'entity') {
            this.entityIds.push(ent.entity_id || ent.id);
          } else if (ent.type === 'passthrough') {
            return;
          }
          ent.children.forEach(childConf => {
            const passthroughs: EntityConfigInternal[] = [];
            let next: EntityConfigInternal | undefined = byId.get(getEntityId(childConf));
            while (next?.type === 'passthrough') {
              passthroughs.push(next);
              const onward = next.children[0];
              if (!onward) {
                this.error = new Error(localize('common.missing_child') + ' ' + getEntityId(childConf));
                throw this.error;
              }
              next = byId.get(getEntityId(onward));
            }
            if (!next) {
              this.error = new Error(localize('common.missing_child') + ' ' + getEntityId(childConf));
              throw this.error;
            }
            const child: EntityConfigInternal = next;
            const connection: ConnectionState = {
              parent: ent,
              child: child,
              state: 0,
              prevParentState: 0,
              prevChildState: 0,
              ready: false,
              passthroughs,
              connection_entity_id: typeof childConf === 'object' ? childConf.connection_entity_id : undefined,
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
          this.connectionsByParent.get(ent)?.forEach(c => {
            if (!c.ready) {
              this.connectionsByChild.get(c.child)?.forEach(conn => {
                if (conn !== connection && !conn.calculating) {
                  this._calcConnection(conn, accountedIn, accountedOut);
                }
              });
            }
          });
        } else if (ent.type === 'remaining_parent_state') {
          this.connectionsByChild.get(ent)?.forEach(c => {
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
      if (connection.connection_entity_id) {
        const connectionState = this._getMemoizedState(connection.connection_entity_id).state ?? 0;
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
        typeof entityConfOrStr === 'string' ? { id: entityConfOrStr, type: 'entity' as const, children: [] } : entityConfOrStr;
      const entity = this._getEntityState(entityConf);
      const unit_of_measurement = this._getUnitOfMeasurement(
        entityConf.unit_of_measurement || entity.attributes.unit_of_measurement,
      );
      // Filters run before normalizeStateValue clamps negatives to 0, so a
      // signed sensor splits cleanly: the plain node sees max(state, 0);
      // a sibling with filters: [{ multiply: -1 }] sees max(-state, 0). See #357.
      let rawState = Number(entity.state);
      entityConf.filters?.forEach(f => {
        if ('multiply' in f) rawState *= f.multiply;
        else if ('divide' in f) rawState /= f.divide;
        else if ('offset' in f) rawState += f.offset;
      });
      const normalized = {...normalizeStateValue(this.config.unit_prefix, rawState, unit_of_measurement), last_updated: entity.last_updated};

      if (entityConf.type === 'passthrough') {
        normalized.state = this.connections
          .filter(c => c.passthroughs.includes(entityConf))
          .reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      }
      // Carbon nodes consume `add_entities` as their source declaration —
      // the carbon helper has already summed them into the synthetic state.
      if (entityConf.add_entities && !isCarbonNodeType(entityConf.type)) {
        entityConf.add_entities.forEach(subId => {
          const subEntity = this._getEntityState({ id: subId, type: 'entity' as const, children: [] });
          const { state } = normalizeStateValue(
            this.config.unit_prefix,
            Number(subEntity.state),
            this._getUnitOfMeasurement(subEntity.attributes.unit_of_measurement || unit_of_measurement)
          );
          normalized.state += state;
        });
      }
      if (entityConf.subtract_entities && !isCarbonNodeType(entityConf.type)) {
        entityConf.subtract_entities.forEach(subId => {
          const subEntity = this._getEntityState({ id: subId, type: 'entity' as const, children: [] });
          const { state } = normalizeStateValue(
            this.config.unit_prefix,
            Number(subEntity.state),
            this._getUnitOfMeasurement(subEntity.attributes.unit_of_measurement || unit_of_measurement)
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
    const state = this.entityStates.get(entityConfOrStr)!;
    if (this.reconciledStates.has(entityConfOrStr)) {
      return { ...state, state: this.reconciledStates.get(entityConfOrStr)! };
    }
    return state;
  }

  private _reconcileConnections() {
    let shouldRecalc = false;
    this.config.sections.forEach(section => {
      section.entities.forEach(entityConf => {
        if (entityConf.parents_sum) {
          const reconciliations = reconcileEntity(
            entityConf,
            'parents',
            this.connectionsByChild.get(entityConf) ?? [],
            conf => this._getMemoizedState(conf),
          );
          if (reconciliations.size) {
            shouldRecalc = true;
            reconciliations.forEach((reconciled, entity) => {
              this.reconciledStates.set(entity, reconciled);
            });
          }
        }
        if (entityConf.children_sum) {
          const reconciliations = reconcileEntity(
            entityConf,
            'children',
            this.connectionsByParent.get(entityConf) ?? [],
            conf => this._getMemoizedState(conf),
          );
          if (reconciliations.size) {
            shouldRecalc = true;
            reconciliations.forEach((reconciled, entity) => {
              this.reconciledStates.set(entity, reconciled);
            });
          }
        }
      });
    });
    if (shouldRecalc) {
      this.entityStates.clear();
      this._calcConnections();
    }
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
          if (entityConf.color === 'random') {
            const entityId = getEntityId(entityConf);
            if (!this.randomColors.has(entityId)) {
              this.randomColors.set(entityId, generateRandomRGBColor());
            }
            finalColor = this.randomColors.get(entityId)!;
          } else if (typeof entityConf.color === 'object') {
            // Handle complex color format (range-based)
            let state4color = state;
            if (entityConf.type === 'passthrough') {
              // passthrough color is based on the child state
              const childState = this._getMemoizedState(this._findRelatedRealEntity(entityConf, 'children'));
              state4color = childState.state;
            }
            const colorRanges = entityConf.color as { [color: string]: { from?: number; to?: number } };
            // Find matching color range
            for (const [color, range] of Object.entries(colorRanges)) {
              const { from, to } = range;
              if (from !== undefined && to !== undefined) {
                if (state4color >= from && state4color <= to) {
                  finalColor = color;
                  break;
                }
              } else if (from !== undefined && state4color >= from) {
                finalColor = color;
                break;
              } else if (to !== undefined && state4color <= to) {
                finalColor = color;
                break;
              }
            }
          }

          return {
            config: entityConf,
            entity: this._getEntityState(entityConf),
            id: getEntityId(entityConf),
            state,
            unit_of_measurement,
            color: finalColor as string,
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
        offset: 0,
        size: 0,
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

    this._calcSectionLayout();
  }

  private _calcSectionLayout() {
    const n = this.sections.length;
    if (!n) return;
    const last = this.sections[n - 1];

    if (this.vertical) {
      const lastH = Math.min(MIN_VERTICAL_SECTION_H, this._naturalSectionHeight(last));
      let offset = 0;
      this.sections = this.sections.map((s, i) => {
        const size = i === n - 1 ? lastH : MIN_VERTICAL_SECTION_H;
        const updated = { ...s, offset, size };
        offset += size;
        return updated;
      });
      return;
    }

    const chartW = this.width - 32;
    const lastMin = last.config.min_width || 0;
    if (n === 1) {
      this.sections = [{ ...last, offset: 0, size: Math.max(lastMin, chartW) }];
      return;
    }

    const otherMinSum = this.sections
      .slice(0, -1)
      .reduce((sum, s) => sum + (s.config.min_width || 0), 0);
    const equalW = chartW / n;
    const lastNatural = this._naturalSectionWidth(last);
    // Last section: at least its min, at most equalW or its natural width.
    // Also cap so the others can fit their own min_widths (if at all possible).
    const lastCap = Math.max(lastMin, chartW - otherMinSum);
    const lastW = Math.max(lastMin, Math.min(equalW, lastNatural, lastCap));

    // Remaining width is distributed evenly on top of each other section's min_width.
    // If the remainder is negative (mins exceed chartW), each section gets its min and the chart overflows.
    const extra = Math.max(0, chartW - lastW - otherMinSum) / (n - 1);

    let offset = 0;
    this.sections = this.sections.map((s, i) => {
      const size = i === n - 1 ? lastW : (s.config.min_width || 0) + extra;
      const updated = { ...s, offset, size };
      offset += size;
      return updated;
    });
  }

  private _naturalSectionHeight(section: SectionState): number {
    const { show_states, show_names } = this.config;
    let nameLines = 0;
    if (show_names) {
      for (const box of section.boxes) {
        if (box.config.type === 'passthrough') continue;
        const name = getBoxName(box);
        const explicit = name.split('\n').filter(Boolean).length;
        const wordCount = name.split(/\s+/).filter(Boolean).length;
        const lines = Math.max(explicit, wordCount, 1);
        nameLines = Math.max(nameLines, lines);
      }
    }
    const stateLines = show_states ? 1 : 0;
    const totalLines = stateLines + nameLines;
    const { box_thickness } = this.config;
    if (!totalLines) return box_thickness;
    return box_thickness + 5 + totalLines * MIN_LABEL_HEIGHT;
  }

  private _naturalSectionWidth(section: SectionState): number {
    const { show_states, show_names, show_units, round, monetary_unit, box_thickness } = this.config;
    let maxWidth = 0;
    for (const box of section.boxes) {
      if (box.config.type === 'passthrough') continue;
      const stateText = show_states
        ? formatState(box.state, round, this.hass.locale, monetary_unit) + (show_units ? box.unit_of_measurement || '' : '')
        : '';
      const nameText = show_names ? getBoxName(box) : '';
      const stateW = stateText.length * CHAR_WIDTH_RATIO;
      const nameW = nameText.length * NAME_CHAR_WIDTH;
      const separatorW = stateText && nameText ? SEPARATOR_WIDTH : 0;
      const labelW = stateW + separatorW + nameW + 2 * LABEL_PADDING;
      maxWidth = Math.max(maxWidth, box_thickness + labelW);
    }
    return maxWidth;
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
        if (entityConf.children.length) {
          throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
        }
        // no children means no state. simplifies autoconfig
        return { state: 0, attributes: {} };
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

    // Carbon nodes ignore `entity_id` for the lookup — `entity_id` is the
    // source declaration; the computed value lives under the node id.
    const lookupId = isCarbonNodeType(entityConf.type)
      ? getEntityId(entityConf)
      : entityConf.entity_id || getEntityId(entityConf);
    let entity = this.states[lookupId];
    if (!entity) {
      if (this.config.ignore_missing_entities) {
        // Return a fake entity with state 0 if ignoring missing entities
        return {
          state: 0,
          attributes: {
            unit_of_measurement: entityConf.unit_of_measurement || '',
            friendly_name: entityConf.name || lookupId,
          },
        };
      }
      throw new Error('Entity not found "' + lookupId + '"');
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
      this.reconciledStates.clear();
      const containerClasses = classMap({
        container: true,
        'with-header': !!this.config.title,
        vertical: this.vertical,
      });

      if (!Object.keys(this.states).length) {
        return html`
          <ha-card label="Sankey Chart" .header=${this.config.title}>
            <div class=${containerClasses}>${localize('common.loading')}</div>
          </ha-card>
        `;
      }

      this._calcConnections();
      this._reconcileConnections();
      this._calcBoxes();

      this.lastUpdate = Date.now();

      const chartW = this.width - 32;
      const lastSection = this.sections[this.sections.length - 1];
      const chartH = this.vertical
        ? (lastSection ? lastSection.offset + lastSection.size : 0)
        : this.config.height;

      return html`
        <ha-card label="Sankey Chart" .header=${this.config.title}>
          <div class=${containerClasses}>
            <svg
              class="chart"
              viewBox="0 0 ${chartW} ${chartH}"
              width="${chartW}"
              height="${chartH}"
              preserveAspectRatio="xMinYMin meet"
            >
              ${this.sections.map((s, i) =>
                renderSection({
                  locale: this.hass.locale,
                  config: this.config,
                  section: s,
                  nextSection: this.sections[i + 1],
                  sectionIndex: i,
                  highlightedEntities: this.highlightedEntities,
                  allConnections: this.connections,
                  onTap: this._handleBoxTap.bind(this),
                  onDoubleTap: this._handleBoxDoubleTap.bind(this),
                  onMouseEnter: this._handleMouseEnter.bind(this),
                  onMouseLeave: this._handleMouseLeave.bind(this),
                  vertical: this.vertical,
                }),
              )}
            </svg>
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
