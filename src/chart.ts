import { LitElement, html, TemplateResult, PropertyValues, CSSResultGroup, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map';
import { until } from 'lit/directives/until.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, query, state } from 'lit/decorators';
import { HomeAssistant } from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import type {
  Config,
  SectionState,
  Box,
  ChildConfigOrStr,
  ConnectionState,
  EntityConfigInternal,
  Link,
  NormalizedState,
  Section,
} from './types';
import { isCarbonNodeType } from './types';
import { localize } from './localize/localize';
import styles from './styles';
import {
  autoPassthroughId,
  collapseAutoPassthroughs,
  formatState,
  getBoxName,
  getEntityId,
  isAutoPassthrough,
  normalizeStateValue,
  renderError,
  sortBoxes,
  generateRandomRGBColor,
} from './utils';
import { selectionEquals } from './editor-bridge';
import type { PreviewAction, PreviewSelection, SankeyEditorBridge } from './editor-bridge';
import { boxAtAlong, columnForDrop, isNoopDrop, nodeDropTarget } from './preview/geometry';
import type { ColumnGeom, NodeDropTarget } from './preview/geometry';
import { linkPath, renderEditBackground, renderEditForeground } from './preview/edit-layer';
import type { EditLayerProps, GhostLink, LinkDropTarget } from './preview/edit-layer';
import type { SectionEditProps } from './section';
import { entityNamesChanged } from './entity-name';
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

const DRAG_THRESHOLD = { mouse: 4, other: 10 };
const LINK_TARGET_PAD = 8;
const POINTER_FOCUS_WINDOW = 500;
const GHOST_BOX_SIZE = 14;
const MIN_GHOST_BOX_SIZE = 4;
const EMPTY_SECTION_SIZE = 64;

type DragState = { pointerId: number; box: Box; section: number; across: number; along: number } & (
  | { type: 'move'; target?: NodeDropTarget }
  | { type: 'link'; target?: LinkDropTarget }
);

type PressState = { pointerId: number; x: number; y: number; threshold: number } & (
  | { type: 'node'; box: Box; section: number }
  | { type: 'link'; source: string; target: string }
  | { type: 'background' }
);

@customElement('sankey-chart-base')
export class Chart extends LitElement {
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public states!: HassEntities;
  @property({ attribute: false }) public forceUpdateTs?: number;
  @property({ attribute: false }) public editBridge?: SankeyEditorBridge;

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
  @state() private _editRevision = 0;
  @state() private _drag?: DragState;

  @query('svg.chart') private _svg?: SVGSVGElement;

  private randomColors = new Map<string, string>();
  // order in which _calcConnections allocates the connections
  private calcOrder: ConnectionState[] = [];

  // the along-axis size the boxes were laid out in; edit mode may grow it
  private _sectionSize = 0;

  // Preview editing (only while a visual editor bridge is active)
  private _editMode = false;
  private _editRendered = false;
  // the focus ring only shows for keyboard use; these tell a pointer or script focus apart
  private _lastPointerDown = 0;
  private _refocusing = false;
  private _connectionsEditMode = false;
  private _subscribedBridge?: SankeyEditorBridge;
  private _bridgeHighlight?: string;
  private _press?: PressState;
  private _rawLinks: Link[] = [];
  private _sectionOf = new Map<string, number>();
  private _autoTarget = new Map<string, string>();
  private _missing = new Set<string>();
  // nodes whose state is being derived from a related node, to stop resolution cycles
  private _resolving = new Set<EntityConfigInternal>();
  private _boxIndex = new Map<string, { box: Box; column: ColumnGeom }>();
  private _columns: ColumnGeom[] = [];

  private get _editing(): boolean {
    return !!this.editBridge?.active && !!this.config && !this.config.autoconfig;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._syncBridgeSubscription();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._syncBridgeSubscription();
  }

  protected updated(): void {
    this._syncBridgeSubscription();
    if (!this._editMode) return;
    this._syncBridgeHighlight();
    if (!this._editRendered) {
      this._editRendered = true;
      if (this.editBridge?.takePreviewFocus()) {
        // the new card is not laid out yet, and an element without a box cannot take focus
        requestAnimationFrame(() => {
          this._refocusing = true;
          try {
            this._svg?.focus({ preventScroll: true });
          } finally {
            this._refocusing = false;
          }
        });
      }
    }
  }

  private _syncBridgeHighlight(): void {
    const highlight = this._editing ? this.editBridge?.highlight : undefined;
    if (highlight === this._bridgeHighlight) return;
    const conf = highlight ? this._boxIndex.get(highlight)?.box.config : undefined;
    if (highlight && !conf) return;
    this._bridgeHighlight = highlight;
    this._handleMouseLeave();
    if (conf) {
      this.highlightPath(conf);
    }
    this.highlightedEntities = [...this.highlightedEntities];
  }

  private _syncBridgeSubscription(): void {
    const bridge = this.isConnected ? this.editBridge : undefined;
    if (bridge === this._subscribedBridge) return;
    this._subscribedBridge?.removeEventListener('change', this._onBridgeChange);
    bridge?.addEventListener('change', this._onBridgeChange);
    this._subscribedBridge = bridge;
  }

  private _onBridgeChange = (): void => {
    if (!this._editing) {
      this._press = undefined;
      this._drag = undefined;
    }
    this._syncBridgeHighlight();
    this._editRevision++;
  };

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }
    if (entityNamesChanged(changedProps.get('hass') as HomeAssistant | undefined, this.hass)) {
      return true;
    }
    if (
      changedProps.has('config') ||
      changedProps.has('forceUpdateTs') ||
      changedProps.has('highlightedEntities') ||
      changedProps.has('zoomEntity') ||
      changedProps.has('width') ||
      changedProps.has('editBridge') ||
      changedProps.has('_editRevision') ||
      changedProps.has('_drag')
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
    this._editMode = this._editing;
    if (!this.entityIds.length || changedProps.has('config') || this._editMode !== this._connectionsEditMode) {
      this._connectionsEditMode = this._editMode;
      this.error = undefined;
      if (this._editMode) {
        this._indexRawLinks();
      }
      this.entityIds = [];
      this.connections = [];
      this.connectionsByParent.clear();
      this.connectionsByChild.clear();
      this.reconciledStates.clear();
      // Passthroughs have unique ids in v4 and carry explicit outgoing links.
      // Follow them to the first non-passthrough node instead of matching by id
      // across sections. A passthrough may fan out to several targets (#390),
      // so every path through it becomes its own connection.
      // Each connection is ranked by the last user-declared node on its path,
      // so a passthrough competes for its target at its own position, not its
      // source's (#394). Auto-inserted passthroughs stay transparent.
      const byId = new Map<string, EntityConfigInternal>();
      const position = new Map<EntityConfigInternal, number>();
      this.config.sections.forEach(({ entities }) =>
        entities.forEach(e => {
          byId.set(e.id, e);
          position.set(e, position.size);
        }),
      );
      const rank = new Map<ConnectionState, [number, number]>();
      this.config.sections.forEach(({ entities }) => {
        entities.forEach(ent => {
          if (ent.type === 'entity') {
            this.entityIds.push(ent.entity_id || ent.id);
          } else if (ent.type === 'passthrough') {
            return;
          }
          ent.children.forEach((childConf, childIdx) => {
            const addConnection = (
              child: EntityConfigInternal,
              passthroughs: EntityConfigInternal[],
              connectionRank: [number, number],
            ) => {
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
              rank.set(connection, connectionRank);
              if (!this.connectionsByParent.has(ent)) {
                this.connectionsByParent.set(ent, []);
              }
              this.connectionsByParent.get(ent)!.push(connection);
              if (!this.connectionsByChild.has(child)) {
                this.connectionsByChild.set(child, []);
              }
              this.connectionsByChild.get(child)!.push(connection);
            };
            const follow = (
              conf: ChildConfigOrStr,
              passthroughs: EntityConfigInternal[],
              connectionRank: [number, number],
            ) => {
              const next = byId.get(getEntityId(conf));
              if (!next || (next.type === 'passthrough' && !next.children.length)) {
                // half-built graphs are normal while editing; otherwise render() shows the error
                if (!this._editMode) {
                  this.error = new Error(localize('common.missing_child') + ' ' + getEntityId(conf));
                }
                return;
              }
              if (next.type !== 'passthrough') {
                addConnection(next, passthroughs, connectionRank);
              } else if (!passthroughs.includes(next)) {
                // the includes() check guards against passthrough cycles
                next.children.forEach((onward, onwardIdx) =>
                  follow(
                    onward,
                    [...passthroughs, next],
                    isAutoPassthrough(next) ? connectionRank : [position.get(next)!, onwardIdx],
                  ),
                );
              }
            };
            follow(childConf, [], [position.get(ent)!, childIdx]);
          });
        });
      });
      // Flows are allocated greedily, so order only matters between connections
      // that share a parent or a child. Each parent keeps its links in the order
      // written; each child takes its incoming links by rank. If the two orders
      // conflict, the parent's wins. Array.prototype.sort is stable, so rank ties
      // keep their build order.
      const pending = [...this.connections].sort((a, b) => {
        const [aPos, aIdx] = rank.get(a)!;
        const [bPos, bIdx] = rank.get(b)!;
        return aPos - bPos || aIdx - bIdx;
      });
      const enqueue = (
        queues: Map<EntityConfigInternal, ConnectionState[]>,
        key: EntityConfigInternal,
        c: ConnectionState,
      ) => {
        if (!queues.has(key)) {
          queues.set(key, []);
        }
        queues.get(key)!.push(c);
      };
      const parentQueues = new Map<EntityConfigInternal, ConnectionState[]>();
      const childQueues = new Map<EntityConfigInternal, ConnectionState[]>();
      this.connections.forEach(c => enqueue(parentQueues, c.parent, c));
      pending.forEach(c => enqueue(childQueues, c.child, c));
      this.calcOrder = [];
      while (pending.length) {
        const isNextForParent = (c: ConnectionState) => parentQueues.get(c.parent)![0] === c;
        let idx = pending.findIndex(c => isNextForParent(c) && childQueues.get(c.child)![0] === c);
        if (idx === -1) {
          idx = pending.findIndex(isNextForParent);
        }
        const [next] = pending.splice(idx, 1);
        [parentQueues.get(next.parent)!, childQueues.get(next.child)!].forEach(q => q.splice(q.indexOf(next), 1));
        this.calcOrder.push(next);
      }
    }
  }

  private _calcConnections() {
    const accountedIn = new Map<EntityConfigInternal, number>();
    const accountedOut = new Map<EntityConfigInternal, number>();
    this.connections.forEach(c => {
      c.ready = false;
      c.calculating = false;
    });
    this.calcOrder.forEach(c => this._calcConnection(c, accountedIn, accountedOut));
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
    const editing = this._editMode;
    const filteredConfig = editing ? this.config : filterConfigByZoomEntity(this.config, this.zoomEntity);
    const sectionsStates: SectionState[] = [];
    // 32 is the padding of the card
    const sections = editing ? this._sectionsForEditing(filteredConfig.sections) : filteredConfig.sections;
    const sectionSize = editing ? this._editSectionSize(sections) : this.vertical ? this.width - 32 : this.config.height;
    this._sectionSize = sectionSize;
    sections.forEach(section => {
      let total = 0;
      // edit mode keeps the boxes the card would hide, as ghosts, so they can be edited
      const ghosts = new Set<EntityConfigInternal>();
      const boxes: Box[] = section.entities
        .filter(entityConf => {
          const { min_state } = this.config;
          // remove empty entity boxes
          const { state } = this._getMemoizedState(entityConf);
          if (state && state >= min_state) {
            return true;
          }
          if (editing && !isAutoPassthrough(entityConf)) {
            ghosts.add(entityConf);
            return true;
          }
          return false;
        })
        .map(entityConf => {
          const { state, unit_of_measurement } = this._getMemoizedState(entityConf);
          const ghost = ghosts.has(entityConf);
          if (!ghost) {
            total += state;
          }

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

          const box: Box = {
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
          if (ghost) {
            box.ghost = true;
          }
          if (editing && this._missing.has(this._lookupId(entityConf))) {
            box.missing = true;
          }
          return box;
        });
      if (!boxes.length) {
        if (editing) {
          sectionsStates.push({
            boxes: [],
            total: 0,
            statePerPixel: 0,
            spacerSize: 0,
            config: section,
            offset: 0,
            size: 0,
          });
        }
        return;
      }
      const ghostSize = ghosts.size ? this._ghostSize(sectionSize, boxes.length, ghosts.size) : 0;
      // leave room for margin
      let availableHeight =
        sectionSize - (boxes.length - 1) * this.config.min_box_distance - ghosts.size * ghostSize;
      if (ghosts.size) {
        // ghosts must never starve the real boxes, or the whole chart's scale breaks
        const realCount = boxes.length - ghosts.size;
        availableHeight = Math.max(availableHeight, (sectionSize - (realCount - 1) * this.config.min_box_distance) / 2, 1);
      }
      // calc sizes to determine statePerPixel ratio and find the best one
      const calcResults = this._calcBoxHeights(
        ghosts.size ? boxes.filter(b => !b.ghost) : boxes,
        availableHeight,
        total,
      );
      let sizedBoxes = calcResults.boxes;
      if (ghosts.size) {
        const sizedReal = sizedBoxes;
        let realIdx = 0;
        sizedBoxes = boxes.map(b => (b.ghost ? { ...b, size: ghostSize } : sizedReal[realIdx++]));
      }
      const parentBoxes = section.sort_group_by_parent
        ? [...sectionsStates].reverse().find(s => s.boxes.length)?.boxes || []
        : [];
      const sortBy = section.sort_by || this.config.sort_by;
      const sortDir = section.sort_dir || this.config.sort_dir;
      sectionsStates.push({
        boxes: sortBoxes(parentBoxes, sizedBoxes, sortBy, sortDir),
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
          const size = box.ghost
            ? box.size
            : Math.max(this.config.min_box_size, Math.floor(box.state / this.statePerPixel));
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

  // Every section index gets a column while editing, so empty ones can take drops.
  private _sectionsForEditing(sections: Section[]): Section[] {
    const byIndex = new Map<number, Section>();
    sections.forEach((s, i) => byIndex.set(s.index ?? i, s));
    const count = Math.max(1, ...Array.from(byIndex.keys()).map(i => i + 1));
    return Array.from({ length: count }, (_, i) => byIndex.get(i) ?? { index: i, entities: [] });
  }

  private _ghostSize(sectionSize: number, boxCount: number, ghostCount: number): number {
    const realCount = boxCount - ghostCount;
    const free = sectionSize - (boxCount - 1) * this.config.min_box_distance - realCount * this.config.min_box_size;
    const budget = realCount ? free / 2 : free;
    return Math.max(MIN_GHOST_BOX_SIZE, Math.min(GHOST_BOX_SIZE, Math.floor(budget / ghostCount)));
  }

  // Grows the chart along its boxes while editing until hidden nodes fit at full size.
  // A vertical chart that grows wider than the card is scaled down to fit (see styles).
  private _editSectionSize(sections: Section[]): number {
    const { min_state, min_box_distance, height } = this.config;
    return sections.reduce((size, section) => {
      let real = 0;
      let ghosts = 0;
      section.entities.forEach(entityConf => {
        const { state } = this._getMemoizedState(entityConf);
        if (state && state >= min_state) {
          real++;
        } else if (!isAutoPassthrough(entityConf)) {
          ghosts++;
        }
      });
      if (!ghosts) return size;
      const needed = ghosts * GHOST_BOX_SIZE + (real + ghosts - 1) * min_box_distance;
      return Math.max(size, real ? needed * 2 : needed);
    }, this.vertical ? this.width - 32 : height);
  }

  private _naturalSectionHeight(section: SectionState): number {
    if (!section.boxes.length) {
      return EMPTY_SECTION_SIZE;
    }
    const { show_states, show_names } = this.config;
    let nameLines = 0;
    if (show_names) {
      for (const box of section.boxes) {
        if (box.config.type === 'passthrough') continue;
        const name = getBoxName(this.hass, box);
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
    if (!section.boxes.length) {
      return EMPTY_SECTION_SIZE;
    }
    const { show_states, show_names, show_units, round, monetary_unit, box_thickness } = this.config;
    let maxWidth = 0;
    for (const box of section.boxes) {
      if (box.config.type === 'passthrough') continue;
      const stateText = show_states
        ? formatState(box.state, round, this.hass.locale, monetary_unit) + (show_units ? box.unit_of_measurement || '' : '')
        : '';
      const nameText = show_names ? getBoxName(this.hass, box) : '';
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
    if (this._drag) {
      return;
    }
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

  private _getUnitOfMeasurement(reported_unit_of_measurement = ''): string {
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
    if (
      entityConf.type === 'remaining_parent_state' ||
      entityConf.type === 'remaining_child_state' ||
      entityConf.type === 'passthrough'
    ) {
      // A remaining_child_state feeding a remaining_parent_state would each read the other
      if (this._resolving.has(entityConf)) {
        return this._placeholderEntity(entityConf);
      }
      this._resolving.add(entityConf);
      try {
        return this._getDerivedEntityState(entityConf);
      } finally {
        this._resolving.delete(entityConf);
      }
    }
    return this._getRealEntityState(entityConf);
  }

  // State of a node that borrows its unit and attributes from a related node
  private _getDerivedEntityState(entityConf: EntityConfigInternal) {
    if (entityConf.type === 'remaining_parent_state') {
      const connections = this.connectionsByChild.get(entityConf);
      if (!connections) {
        if (this._editMode) {
          return this._placeholderEntity(entityConf);
        }
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
        if (entityConf.children.length && !this._editMode) {
          throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
        }
        // no children means no state. simplifies autoconfig
        return this._placeholderEntity(entityConf);
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
        if (this._editMode) {
          return this._placeholderEntity(entityConf);
        }
        throw new Error('Invalid entity config ' + JSON.stringify(entityConf));
      }
      return this._getEntityState(realConnection.child);
    }
    return this._getRealEntityState(entityConf);
  }

  private _getRealEntityState(entityConf: EntityConfigInternal) {
    const lookupId = this._lookupId(entityConf);
    let entity = this.states[lookupId];
    if (!entity) {
      if (this._editMode) {
        this._missing.add(lookupId);
      }
      if (this.config.ignore_missing_entities || this._editMode) {
        // Return a fake entity with state 0 if ignoring missing entities
        return {
          entity_id: lookupId,
          state: 0,
          attributes: {
            unit_of_measurement: entityConf.unit_of_measurement || '',
            friendly_name: typeof entityConf.name === 'string' ? entityConf.name : lookupId,
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

  // name and icon helpers need an entity_id even when there is no real entity
  private _placeholderEntity(entityConf: EntityConfigInternal) {
    return { entity_id: entityConf.id, state: 0, attributes: {} };
  }

  // Carbon nodes ignore `entity_id` for the lookup — `entity_id` is the
  // source declaration; the computed value lives under the node id.
  private _lookupId(entityConf: EntityConfigInternal): string {
    return isCarbonNodeType(entityConf.type) ? getEntityId(entityConf) : entityConf.entity_id || getEntityId(entityConf);
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

  private _indexRawLinks(): void {
    const { nodes, links } = this.config;
    this._rawLinks = collapseAutoPassthroughs(nodes, links).links;
    this._sectionOf = new Map(nodes.map(n => [n.id, n.section ?? 0]));
    const auto = new Set(nodes.filter(isAutoPassthrough).map(n => n.id));
    const onward = new Map<string, string>();
    links.forEach(l => {
      if (auto.has(l.source)) onward.set(l.source, l.target);
    });
    this._autoTarget.clear();
    auto.forEach(id => {
      let target = id;
      const seen = new Set<string>();
      while (auto.has(target) && onward.has(target) && !seen.has(target)) {
        seen.add(target);
        target = onward.get(target)!;
      }
      if (!auto.has(target)) {
        this._autoTarget.set(id, target);
      }
    });
  }

  private _linkFlow(source: string, target: string): number {
    return this.connections
      .filter(
        c =>
          (c.parent.id === source || c.passthroughs.some(p => p.id === source)) &&
          (c.child.id === target || c.passthroughs.some(p => p.id === target)),
      )
      .reduce((sum, c) => sum + c.state, 0);
  }

  // A raw link is drawn by the regular connectors only if it has a flow and
  // every synthetic hop on its way is on screen.
  private _linkRendered(link: Link, sourceSection: number, targetSection: number): boolean {
    if (this._linkFlow(link.source, link.target) <= 0) return false;
    for (let i = sourceSection + 1; i < targetSection; i++) {
      if (!this._boxIndex.has(autoPassthroughId(link.target, i))) return false;
    }
    return true;
  }

  private _isLinkCandidate(source: string, target: string): boolean {
    const s = this._boxIndex.get(source);
    const t = this._boxIndex.get(target);
    if (!s || !t || isAutoPassthrough(t.box.config) || t.column.section <= s.column.section) return false;
    return !this._rawLinks.some(l => l.source === source && l.target === target);
  }

  private _rawLinkForSegment(parent: Box, child: Box): { source: string; target: string } | undefined {
    const target = this._autoTarget.get(child.id) ?? child.id;
    if (!isAutoPassthrough(parent.config)) {
      return { source: parent.id, target };
    }
    // a shared synthetic hop carries every flow into `target`; pick the biggest
    const parentSection = this._sectionOf.get(parent.id) ?? 0;
    let best: Link | undefined;
    let bestFlow = -1;
    this._rawLinks.forEach(l => {
      if (l.target !== target || (this._sectionOf.get(l.source) ?? 0) >= parentSection) return;
      const flow = this._linkFlow(l.source, l.target);
      if (flow > bestFlow) {
        best = l;
        bestFlow = flow;
      }
    });
    return best ? { source: best.source, target: best.target } : undefined;
  }

  private _prepareEdit(): { section: SectionEditProps; layer: EditLayerProps } {
    const { box_thickness } = this.config;
    const selection = this.editBridge?.selection;
    const drag = this._drag;

    this._boxIndex.clear();
    this._columns = this.sections.map((s, i) => {
      const column: ColumnGeom = {
        section: s.config.index ?? i,
        near: s.offset,
        far: s.offset + s.size,
        barNear: s.offset,
        barFar: s.offset + box_thickness,
        boxes: s.boxes.map(b => ({
          id: b.id,
          start: b.top,
          end: b.top + b.size,
          ...(isAutoPassthrough(b.config) ? { locked: true } : {}),
        })),
        sorted: (s.config.sort_by || this.config.sort_by) === 'state',
      };
      s.boxes.forEach(box => this._boxIndex.set(box.id, { box, column }));
      return column;
    });
    const lastSection = this._columns[this._columns.length - 1]?.section ?? 0;

    const selectedLink = selection?.type === 'link' ? selection : undefined;
    const isLinkSelected = (source: string, target: string) =>
      !!selectedLink && selectedLink.source === source && selectedLink.target === target;
    const center = (b: Box) => b.top + b.size / 2;

    const ghostLinks: GhostLink[] = [];
    this._rawLinks.forEach(link => {
      const s = this._boxIndex.get(link.source);
      const t = this._boxIndex.get(link.target);
      if (!s || !t || t.column.section <= s.column.section) return;
      if (!s.box.ghost && !t.box.ghost && this._linkRendered(link, s.column.section, t.column.section)) return;
      ghostLinks.push({
        source: link.source,
        target: link.target,
        d: linkPath(this.vertical, [s.column.barFar, center(s.box)], [t.column.barNear, center(t.box)]),
        selected: isLinkSelected(link.source, link.target),
      });
    });

    const linkCandidates = new Set<string>();
    if (drag?.type === 'link') {
      this._boxIndex.forEach((_, id) => {
        if (this._isLinkCandidate(drag.box.id, id)) linkCandidates.add(id);
      });
    }

    let link: EditLayerProps['link'];
    if (drag?.type === 'link') {
      const source = this._boxIndex.get(drag.box.id);
      const target = drag.target?.type === 'node' ? this._boxIndex.get(drag.target.box.id) : undefined;
      if (source) {
        link = {
          from: [source.column.barFar, center(source.box)],
          to: target ? [target.column.barNear, center(target.box)] : [drag.across, drag.along],
          target: drag.target,
        };
      }
    }

    const section: SectionEditProps = {
      selectedNode: selection?.type === 'node' ? selection.id : undefined,
      draggingNode: drag?.type === 'move' ? drag.box.id : undefined,
      linkSource: drag?.type === 'link' ? drag.box.id : undefined,
      linkCandidates,
      linkHover: drag?.type === 'link' && drag.target?.type === 'node' ? drag.target.box.id : undefined,
      hiddenTitle: localize('editor.preview.hidden_node'),
      missingTitle: localize('editor.preview.entity_not_found'),
      linkHandleTitle: localize('editor.preview.link_handle'),
      canLink: box =>
        !isAutoPassthrough(box.config) && (this._boxIndex.get(box.id)?.column.section ?? lastSection) < lastSection,
      isSegmentSelected: (parent, child) => {
        if (!selectedLink) return false;
        const { source, target } = selectedLink;
        const parentOnPath =
          parent.id === source ||
          (this._autoTarget.get(parent.id) === target &&
            (this._sectionOf.get(parent.id) ?? 0) > (this._sectionOf.get(source) ?? 0));
        return parentOnPath && (child.id === target || this._autoTarget.get(child.id) === target);
      },
      onBoxPointerDown: this._onBoxPointerDown,
      onHandlePointerDown: this._onHandlePointerDown,
      onSegmentPointerDown: this._onSegmentPointerDown,
    };

    const layer: EditLayerProps = {
      vertical: this.vertical,
      alongSize: this._sectionSize,
      columns: this._columns,
      ghostLinks,
      move:
        drag?.type === 'move'
          ? {
              box: drag.box,
              name: getBoxName(this.hass, drag.box),
              across: drag.across,
              along: drag.along,
              target: drag.target,
              thickness: box_thickness,
            }
          : undefined,
      link,
      strings: {
        dropHere: localize('editor.preview.drop_here'),
        addNode: localize('editor.preview.add_node'),
        newSection: localize('editor.preview.new_section'),
      },
      onAddNode: sectionIndex => this._dispatch({ type: 'add_node', section: sectionIndex }),
      onGhostLinkPointerDown: this._onGhostLinkPointerDown,
    };

    return { section, layer };
  }

  private _dispatch(action: PreviewAction): void {
    const bridge = this.editBridge;
    if (!bridge) return;
    if (action.type !== 'select' && action.type !== 'add_node' && this.shadowRoot?.activeElement === this._svg) {
      bridge.keepPreviewFocus();
    }
    bridge.dispatch(action);
  }

  private _select(selection?: PreviewSelection): void {
    if (!selectionEquals(selection, this.editBridge?.selection)) {
      this._dispatch({ type: 'select', selection });
    }
  }

  private _pointerAxes(ev: PointerEvent): { across: number; along: number } {
    let x = 0;
    let y = 0;
    const ctm = this._svg?.getScreenCTM?.();
    if (ctm) {
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
      x = p.x;
      y = p.y;
    }
    return this.vertical ? { across: y, along: x } : { across: x, along: y };
  }

  private _setFocusRing(show: boolean): void {
    const bridge = this.editBridge;
    if (!bridge || bridge.focusRing === show) return;
    bridge.focusRing = show;
    this._editRevision++;
  }

  private _notePointer(): void {
    this._lastPointerDown = Date.now();
    this._setFocusRing(false);
  }

  private _onFocus = (): void => {
    // a rebuilt preview keeps the ring of the one it replaces, and a focus right after a press came from the pointer
    if (this._refocusing || Date.now() - this._lastPointerDown < POINTER_FOCUS_WINDOW) return;
    this._setFocusRing(true);
  };

  private _capturePointer(ev: PointerEvent): void {
    this._notePointer();
    try {
      this._svg?.setPointerCapture(ev.pointerId);
    } catch (_err) {
      // the pointer may already be gone
    }
    this._svg?.focus({ preventScroll: true });
  }

  // a second finger must not hijack or end the gesture in progress
  private _isBusy(ev: PointerEvent): boolean {
    return ev.button !== 0 || !!this._press || !!this._drag;
  }

  private _isActivePointer(ev: PointerEvent): boolean {
    return (this._drag ?? this._press)?.pointerId === ev.pointerId;
  }

  private _pressAt(ev: PointerEvent) {
    return {
      pointerId: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      threshold: ev.pointerType === 'mouse' ? DRAG_THRESHOLD.mouse : DRAG_THRESHOLD.other,
    };
  }

  private _onBoxPointerDown = (ev: PointerEvent, box: Box): void => {
    if (this._isBusy(ev) || isAutoPassthrough(box.config)) return;
    ev.stopPropagation();
    const section = this._boxIndex.get(box.id)?.column.section ?? 0;
    this._capturePointer(ev);
    this._press = { type: 'node', box, section, ...this._pressAt(ev) };
  };

  private _onHandlePointerDown = (ev: PointerEvent, box: Box): void => {
    if (this._isBusy(ev)) return;
    ev.stopPropagation();
    ev.preventDefault();
    this._capturePointer(ev);
    this._handleMouseLeave();
    const section = this._boxIndex.get(box.id)?.column.section ?? 0;
    this._drag = { type: 'link', pointerId: ev.pointerId, box, section, ...this._pointerAxes(ev) };
  };

  private _onSegmentPointerDown = (ev: PointerEvent, parent: Box, child: Box): void => {
    if (this._isBusy(ev)) return;
    const link = this._rawLinkForSegment(parent, child);
    if (!link) return;
    ev.stopPropagation();
    this._capturePointer(ev);
    this._press = { type: 'link', ...link, ...this._pressAt(ev) };
  };

  private _onGhostLinkPointerDown = (ev: PointerEvent, link: GhostLink): void => {
    if (this._isBusy(ev)) return;
    ev.stopPropagation();
    this._capturePointer(ev);
    this._press = { type: 'link', source: link.source, target: link.target, ...this._pressAt(ev) };
  };

  private _onSvgPointerDown = (ev: PointerEvent): void => {
    this._notePointer();
    if (this._isBusy(ev)) return;
    this._capturePointer(ev);
    this._press = { type: 'background', ...this._pressAt(ev) };
  };

  // touch-action is ignored on inner SVG elements, so stop the pan that would cancel a drag
  private _onTouchStart = {
    handleEvent: (ev: TouchEvent): void => {
      if (this._drag || this._press?.type === 'node') {
        ev.preventDefault();
      }
    },
    passive: false,
  };

  private _onPointerMove = (ev: PointerEvent): void => {
    if (!this._isActivePointer(ev)) return;
    const press = this._press;
    if (press && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) >= press.threshold) {
      this._press = undefined;
      if (press.type === 'node') {
        this._handleMouseLeave();
        this._drag = {
          type: 'move',
          pointerId: press.pointerId,
          box: press.box,
          section: press.section,
          ...this._pointerAxes(ev),
        };
      }
    }
    const drag = this._drag;
    if (!drag) return;
    ev.preventDefault();
    const { across, along } = this._pointerAxes(ev);
    if (drag.type === 'move') {
      const target = nodeDropTarget(this._columns, across, along, drag.box.id);
      this._drag = {
        ...drag,
        across,
        along,
        target: target && !isNoopDrop(this._columns, drag.box.id, drag.section, target) ? target : undefined,
      };
    } else {
      this._drag = { ...drag, across, along, target: this._linkDropTarget(drag.box.id, drag.section, across, along) };
    }
  };

  private _linkDropTarget(source: string, sourceSection: number, across: number, along: number): LinkDropTarget | undefined {
    const column = columnForDrop(this._columns, across);
    if (!column || column.section <= sourceSection) return undefined;
    const hit = boxAtAlong(column, along, LINK_TARGET_PAD);
    if (!hit) {
      return { type: 'new_node', section: column.section };
    }
    const entry = this._boxIndex.get(hit.id);
    return entry && this._isLinkCandidate(source, hit.id) ? { type: 'node', box: entry.box } : undefined;
  }

  private _onPointerUp = (ev: PointerEvent): void => {
    if (!this._isActivePointer(ev)) return;
    const press = this._press;
    const drag = this._drag;
    this._press = undefined;
    this._drag = undefined;
    if (drag) {
      this._finishDrag(drag);
    } else if (press?.type === 'node') {
      this._select({ type: 'node', id: press.box.id });
    } else if (press?.type === 'link') {
      this._select({ type: 'link', source: press.source, target: press.target });
    } else if (press) {
      this._select(undefined);
    }
  };

  private _onPointerCancel = (ev: PointerEvent): void => {
    if (!this._isActivePointer(ev)) return;
    this._press = undefined;
    this._drag = undefined;
  };

  private _finishDrag(drag: DragState): void {
    if (!drag.target) return;
    if (drag.type === 'move') {
      const { target } = drag;
      this._dispatch({
        type: 'move_node',
        id: drag.box.id,
        section: target.section,
        ...(target.type === 'section' && target.before ? { before: target.before } : {}),
        ...(target.type === 'new_section' ? { new_section: true } : {}),
      });
    } else if (drag.target.type === 'node') {
      this._dispatch({ type: 'add_link', source: drag.box.id, target: drag.target.box.id });
    } else {
      this._dispatch({ type: 'add_node', section: drag.target.section, link_from: drag.box.id });
    }
  }

  private _onKeyDown = (ev: KeyboardEvent): void => {
    this._setFocusRing(true);
    const selection = this.editBridge?.selection;
    if (ev.key === 'Escape') {
      if (this._drag || this._press) {
        this._press = undefined;
        this._drag = undefined;
      } else if (selection) {
        this._select(undefined);
      } else {
        return;
      }
    } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && selection) {
      this._dispatch({ type: 'remove', selection });
    } else if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'z') {
      this._dispatch({ type: 'undo' });
    } else {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  };

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
      this._missing.clear();
      const editing = this._editMode;
      const containerClasses = classMap({
        container: true,
        'with-header': !!this.config.title,
        vertical: this.vertical,
        editing,
        'focus-ring': editing && !!this.editBridge?.focusRing,
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

      const chartW = this.vertical ? Math.max(this.width - 32, this._sectionSize) : this.width - 32;
      const lastSection = this.sections[this.sections.length - 1];
      const chartH = this.vertical
        ? (lastSection ? lastSection.offset + lastSection.size : 0)
        : this._sectionSize;
      const edit = editing ? this._prepareEdit() : undefined;

      return html`
        <ha-card label="Sankey Chart" .header=${this.config.title}>
          <div class=${containerClasses}>
            <svg
              class="chart"
              viewBox="0 0 ${chartW} ${chartH}"
              width="${chartW}"
              height="${chartH}"
              preserveAspectRatio="xMinYMin meet"
              tabindex=${editing ? '0' : nothing}
              @pointerdown=${editing ? this._onSvgPointerDown : nothing}
              @pointermove=${editing ? this._onPointerMove : nothing}
              @pointerup=${editing ? this._onPointerUp : nothing}
              @pointercancel=${editing ? this._onPointerCancel : nothing}
              @touchstart=${editing ? this._onTouchStart : nothing}
              @keydown=${editing ? this._onKeyDown : nothing}
              @focus=${editing ? this._onFocus : nothing}
            >
              ${edit ? renderEditBackground(edit.layer) : nothing}
              ${this.sections.map((s, i) =>
                renderSection({
                  hass: this.hass,
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
                  edit: edit?.section,
                }),
              )}
              ${edit ? renderEditForeground(edit.layer) : nothing}
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
