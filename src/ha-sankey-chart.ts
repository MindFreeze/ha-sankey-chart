/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, svg, TemplateResult, SVGTemplateResult, PropertyValues, CSSResultGroup } from 'lit';
import { styleMap } from 'lit/directives/style-map';
import { classMap } from 'lit/directives/class-map';
import { until } from 'lit/directives/until.js';
import { customElement, property, state } from 'lit/decorators';
import {
  HomeAssistant,
  // hasAction,
  // ActionHandlerEvent,
  // LovelaceCardEditor,
  // getLovelace,
  stateIcon,
  fireEvent,
  LovelaceCard,
  createThing,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

// import './editor';

import type {
  Config,
  SankeyChartConfig,
  SectionState,
  Box,
  ConnectionState,
  EntityConfigInternal,
  NormalizedState,
} from './types';
// import { actionHandler } from './action-handler-directive';
import { MIN_LABEL_HEIGHT } from './const';
import { version } from '../package.json';
import { localize } from './localize/localize';
import styles from './styles';
import { formatState, getChildConnections, getEntityId, normalizeConfig, normalizeStateValue } from './utils';
import { HassEntity } from 'home-assistant-js-websocket';

/* eslint no-console: 0 */
console.info(
  `%c sankey-chart %c ${localize('common.version')} ${version} `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'sankey-chart',
  name: 'Sankey Chart',
  description:
    'A card to display a sankey chart. For example for power consumptionA template custom card for you to create something awesome',
});

@customElement('sankey-chart')
export class SankeyChart extends LitElement {
  // public static async getConfigElement(): Promise<LovelaceCardEditor> {
  //   return document.createElement('sankey-chart-editor');
  // }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) private entityIds: string[] = [];

  @state() private config!: Config;
  @state() public height = 200;
  @state() private sections: SectionState[] = [];
  @state() private connections: ConnectionState[] = [];
  @state() private connectionsByParent: Map<EntityConfigInternal, ConnectionState[]> = new Map();
  @state() private connectionsByChild: Map<EntityConfigInternal, ConnectionState[]> = new Map();
  @state() private statePerPixelY = 0;
  @state() private lastUpdate = 0;
  @state() private entityStates: Map<EntityConfigInternal, NormalizedState> = new Map();

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: SankeyChartConfig): void {
    if (!config || !Array.isArray(config.sections)) {
      throw new Error(localize('common.invalid_configuration'));
    }

    // if (config.test_gui) {
    //   getLovelace().setEditMode(true);
    // }

    this.config = normalizeConfig(config);

    this.height = this.config.height;

    this.entityIds = [];
    this.connections = [];
    this.connectionsByParent.clear();
    this.connectionsByChild.clear();
    this.config.sections.forEach(({ entities }, sectionIndex) => {
      entities.forEach((ent) => {
        if (ent.type === 'entity') {
          this.entityIds.push(ent.entity_id);
        }
        if (ent.type !== 'remaining_parent_state') {
          ent.children.forEach((childId) => {
            const child = this.config.sections[sectionIndex + 1]?.entities.find((e) => e.entity_id === childId);
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
        }
      });
    });
  }

  public getCardSize(): number {
    return 4;
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
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
    if (changedProps.has('config')) {
      return true;
    }
    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
    if (!oldHass) {
      return true;
    }
    return this.entityIds.some((id) => {
      return oldHass.states[id] !== this.hass.states[id] && oldHass.states[id].state !== this.hass.states[id].state;
    });
  }

  public willUpdate(): void {
    this.lastUpdate = Date.now();
  }

  private _calcConnections() {
    const accountedIn = new Map<EntityConfigInternal, number>();
    const accountedOut = new Map<EntityConfigInternal, number>();
    this.connections.forEach((c) => {
      c.ready = false;
    });
    this.connections.forEach((c) => this._calcConnection(c, accountedIn, accountedOut));
  }

  private _calcConnection(connection: ConnectionState, accountedIn, accountedOut) {
    const { parent, child } = connection;
    if (parent.type === 'remaining_child_state') {
      this.connectionsByParent.get(parent)!.forEach((c) => {
        if (!c.ready) {
          this.connectionsByChild.get(c.child)?.forEach((conn) => {
            if (!conn.ready && conn !== connection) {
              this._calcConnection(conn, accountedIn, accountedOut);
            }
          });
        }
      });
    }
    if (child.type === 'remaining_parent_state') {
      this.connectionsByChild.get(child)!.forEach((c) => {
        if (!c.ready) {
          this.connectionsByParent.get(c.parent)?.forEach((conn) => {
            if (!conn.ready && conn !== connection) {
              this._calcConnection(conn, accountedIn, accountedOut);
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
      const normalized = normalizeStateValue(
        this.config.unit_prefix,
        Number(entity.state),
        entity.attributes.unit_of_measurement,
      );
      if (normalized.state === Infinity) {
        // don't cache infinity
        return normalized;
      }
      this.entityStates.set(entityConf, normalized);
    }
    return this.entityStates.get(entityConf)!;
  }

  // private _getStates() {
  //   // @TODO error handling
  //   // const errEntityId = this.entityIds.find(ent => !this._getEntityState({entity_id: ent}));
  //   // if (errEntityId) {
  //   //   throw new Error(localize('common.entity_not_found') + ' ' + errEntityId);
  //   // }
  //   this.entityIds.forEach((val, entityId) => {
  //     const entity = this._getEntityState(entityId);
  //     // eslint-disable-next-line prefer-const
  //     let {state, unit_of_measurement} = normalizeStateValue(
  //       this.config.unit_prefix,
  //       Number(entity.state),
  //       entity.attributes.unit_of_measurement
  //     );
  //   });
  // }

  private _calcElements() {
    this.statePerPixelY = 0;
    // const extraEntities: EntityConfigInternal[][] = this.config.sections.map(() => []);
    this.sections = this.config.sections
      .map((section, sectionIndex) => {
        let total = 0;
        // const allSectionEntities = section.entities.reduce((acc, entityConf) => {
        //   const other = extraEntities[sectionIndex]
        //     .find(e => {
        //       if (e.children?.includes(entityConf.entity_id)) {
        //         e.foundChildren?.push(entityConf.entity_id);
        //         return e.foundChildren?.length === e.children.length;
        //       }
        //       return false;
        //     });
        //   // position 'remaining' boxes right after all other children of the same parent
        //   return other ? [...acc, entityConf, other] : [...acc, entityConf];
        // }, [] as EntityConfigInternal[]);
        let boxes: Box[] = section.entities
          .filter((entityConf) => {
            // remove empty entity boxes
            if (entityConf.type === 'remaining_parent_state') {
              return this.connectionsByChild.get(entityConf)?.some((c) => c.state);
            }
            if (entityConf.type === 'remaining_child_state') {
              return this.connectionsByParent.get(entityConf)?.some((c) => c.state);
            }
            return this._getMemoizedState(entityConf).state;
          })
          // .filter(entity => {
          //   const state = Number(this._getEntityState(entity).state);
          //   return !isNaN(state) && state > 0;
          // })
          .map((entityConf) => {
            const { state, unit_of_measurement } = this._getMemoizedState(entityConf);
            // if (entityConf.accountedState) {
            //   state = Math.max(0, state - entityConf.accountedState);
            // }
            total += state;
            // if (extraEntities[sectionIndex]) {
            //   extraEntities[sectionIndex].forEach(e => {
            //     if (e.children?.includes(entityConf.entity_id)) {
            //       e.accountedState! += state;
            //     }
            //   });
            // }

            // const children = entityConf.children || [];
            // if (entityConf.remaining && extraEntities[sectionIndex + 1]) {
            //   children = [...children, entityConf.entity_id];
            //   const remainingConf = typeof entityConf.remaining === 'string'
            //     ? {name: entityConf.remaining} : entityConf.remaining;
            //   extraEntities[sectionIndex + 1].push({
            //     ...entityConf,
            //     color: undefined,
            //     ...remainingConf,
            //     type: 'remaining_parent_state',
            //     accountedState: 0,
            //     foundChildren: [],
            //   });
            // }

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
          return {
            boxes,
            total,
            spacerH: 0,
            statePerPixelY: 0,
          };
        }
        // leave room for margin
        const availableHeight = this.height - (boxes.length - 1) * this.config.min_box_distance;
        // calc sizes to determine statePerPixelY ratio and find the best one
        const calcResults = this._calcBoxHeights(boxes, availableHeight, total);
        boxes = calcResults.boxes;
        const totalSize = boxes.reduce((sum, b) => sum + b.size, 0);
        const extraSpace = this.height - totalSize;
        const spacerH = boxes.length > 1 ? extraSpace / (boxes.length - 1) : 0;
        let offset = 0;
        boxes = boxes.map((box) => {
          const top = offset;
          offset += box.size + spacerH;
          return {
            ...box,
            top,
          };
        });
        return {
          boxes,
          total,
          spacerH,
          statePerPixelY: calcResults.statePerPixelY,
        };
      })
      .filter((s) => s.boxes.length > 0)
      .map((section) => {
        // calc sizes again with the best statePerPixelY
        let totalSize = 0;
        let { boxes } = section;
        if (section.statePerPixelY !== this.statePerPixelY) {
          boxes = boxes.map((box) => {
            const size = Math.max(this.config.min_box_height, Math.floor(box.state / this.statePerPixelY));
            totalSize += size;
            return {
              ...box,
              size,
            };
          });
        } else {
          totalSize = boxes.reduce((sum, b) => sum + b.size, 0);
        }
        // calc vertical margin size
        const extraSpace = this.height - totalSize;
        const spacerH = boxes.length > 1 ? extraSpace / (boxes.length - 1) : 0;
        let offset = 0;
        // calc y positions. needed for connectors
        boxes = boxes.map((box) => {
          const top = offset;
          offset += box.size + spacerH;
          return {
            ...box,
            top,
          };
        });
        return {
          ...section,
          boxes,
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
    const result = boxes.map((box) => {
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

  private _handleBoxClick(box: Box): void {
    fireEvent(this, 'hass-more-info', { entityId: box.entity_id });
  }

  // private _handleAction(ev: ActionHandlerEvent): void {
  //   console.log('@TODO');
  //   if (this.hass && this.config && ev.detail.action) {
  //     // handleAction(this, this.hass, this.config, ev.detail.action);
  //   }
  // }

  // private _showWarning(warning: string): TemplateResult {
  //   return html`
  //     <hui-warning>${warning}</hui-warning>
  //   `;
  // }

  private async _showError(error: string): Promise<TemplateResult> {
    const config = {
      type: 'error',
      error,
      origConfig: this.config,
    };
    let element: LovelaceCard;
    const HELPERS = (window as any).loadCardHelpers ? (window as any).loadCardHelpers() : undefined;
    if (HELPERS) {
      element = (await HELPERS).createCardElement(config);
    } else {
      element = createThing(config);
    }
    if (this.hass) {
      element.hass = this.hass;
    }

    return html` ${element} `;
  }

  private _getEntityState(entityConf: EntityConfigInternal) {
    if (entityConf.type === 'remaining_parent_state') {
      const connections = this.connectionsByChild.get(entityConf)!;
      const { parent } = connections[0];
      const state = connections.reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      return { ...this.hass.states[parent.entity_id], state };
    }
    if (entityConf.type === 'remaining_child_state') {
      const connections = this.connectionsByParent.get(entityConf)!;
      const { child } = connections[0];
      const state = connections.reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      return { ...this.hass.states[child.entity_id], state };
    }

    let entity = this.hass.states[getEntityId(entityConf)];
    
    if (entityConf.type === 'passthrough') {
      const connections = this.connectionsByChild.get(entityConf)!;
      const state = connections.reduce((sum, c) => (c.ready ? sum + c.state : Infinity), 0);
      if (state !== Infinity) {
        return { ...entity, state };
      }
    }
    if (typeof entityConf === 'object' && entityConf.attribute) {
      entity = { ...entity, state: entity.attributes[entityConf.attribute] } as HassEntity;
      if (entityConf.unit_of_measurement) {
        entity = { ...entity, attributes: { unit_of_measurement: entityConf.unit_of_measurement }};
      }
    }
    return entity;
  }

  static get styles(): CSSResultGroup {
    return styles;
  }

  protected renderSection(index: number): TemplateResult {
    const { show_names, show_icons, show_states, show_units } = this.config;
    const section = this.sections[index];
    const { boxes, spacerH } = section;
    const hasChildren = index < this.sections.length - 1 && boxes.some((b) => b.children.length > 0);

    return html`
      <div class="section">
        ${hasChildren
          ? html`<div class="connectors">
              <svg viewBox="0 0 100 ${this.height}" preserveAspectRatio="none">
                ${this.renderBranchConnectors(index)}
              </svg>
            </div>`
          : null}
        ${boxes.map((box, i) => {
          const { entity, extraSpacers } = box;
          const formattedState = formatState(box.state, this.config.round);
          const isNotPassthrough = box.config.type !== 'passthrough';
          const name = box.config.name || entity.attributes.friendly_name || '';
          const maxLabelH = box.size + spacerH - 1;
          const labelStyle =
            maxLabelH < MIN_LABEL_HEIGHT
              ? { maxHeight: maxLabelH + 'px', fontSize: `${maxLabelH / MIN_LABEL_HEIGHT}em` }
              : {};
          return html`
            ${i > 0 ? html`<div class="spacerv" style=${styleMap({ height: spacerH + 'px' })}></div>` : null}
            ${extraSpacers
              ? html`<div class="spacerv" style=${styleMap({ height: extraSpacers + 'px' })}></div>`
              : null}
            <div class=${'box type-' + box.config.type!} style=${styleMap({ height: box.size + 'px' })}>
              <div
                style=${styleMap({ backgroundColor: box.color })}
                @click=${() => this._handleBoxClick(box)}
                title=${name}
              >
                ${show_icons && isNotPassthrough ? html`<ha-icon .icon=${stateIcon(entity as HassEntity)}></ha-icon>` : null}
              </div>
              <div class="label" style=${styleMap(labelStyle)}>
                ${show_states && isNotPassthrough
                  ? html`<span class="state">${formattedState}</span>${show_units
                        ? html`<span class="unit">${box.unit_of_measurement}</span>`
                        : null}`
                  : null}
                ${show_names && isNotPassthrough ? html`<span class="name">&nbsp;${name}</span>` : null}
              </div>
            </div>
            ${extraSpacers
              ? html`<div class="spacerv" style=${styleMap({ height: extraSpacers + 'px' })}></div>`
              : null}
          `;
        })}
      </div>
    `;
  }

  protected renderBranchConnectors(index: number): SVGTemplateResult[] {
    const section = this.sections[index];
    const { boxes } = section;
    return boxes
      .filter((b) => b.children.length > 0)
      .map((b) => {
        const children = this.sections[index + 1].boxes.filter((child) => b.children.includes(child.entity_id));
        const connections = getChildConnections(b, children, this.connectionsByParent.get(b.config)).filter((c, i) => {
          if (c.state > 0) {
            children[i].connections.parents.push(c);
            if (children[i].config.type === 'passthrough' && c.state !== children[i].state) {
              // virtual entity that must only pass state to the next section
              children[i].state = c.state;
              // this could reduce the size of the box moving lower boxes up
              // so we have to add spacers and adjust some positions
              const newSize = Math.floor(c.state / this.statePerPixelY);
              children[i].extraSpacers = (children[i].size - newSize) / 2;
              c.endY += children[i].extraSpacers!;
              children[i].top += children[i].extraSpacers!;
              children[i].size = newSize;
            }
            return true;
          }
          return false;
        });
        return svg`
        <defs>
          ${connections.map(
            (c, i) => svg`
            <linearGradient id="gradient${b.entity_id + i}">
              <stop offset="0%" stop-color="${c.startColor}"></stop>
              <stop offset="100%" stop-color="${c.endColor}"></stop>
            </linearGradient>
          `,
          )}
        </defs>
        ${connections.map(
          (c, i) => svg`
          <path d="M0,${c.startY} C50,${c.startY} 50,${c.endY} 100,${c.endY} L100,${c.endY + c.endSize} C50,${
            c.endY + c.endSize
          } 50,${c.startY + c.startSize} 0,${c.startY + c.startSize} Z"
            fill="url(#gradient${b.entity_id + i})" />
        `,
        )}
      `;
      });
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    this.entityStates.clear();
    // if (this.config.show_warning) {
    //   return this._showWarning(localize('common.show_warning'));
    // }
    try {
      this._calcConnections();
      this._calcElements();
    } catch (err) {
      return html`${until(this._showError(String(err)))}`;
    }

    const containerClasses = classMap({
      container: true,
      wide: !!this.config.wide,
      'with-header': !!this.config.title,
    });
    // @action=${this._handleAction}
    // .actionHandler=${actionHandler({
    //   hasHold: hasAction(this.config.hold_action),
    //   hasDoubleClick: hasAction(this.config.double_tap_action),
    // })}
    return html`
      <ha-card tabindex="0" label="Sankey Chart" .header=${this.config.title}>
        <div class=${containerClasses} style=${styleMap({ height: this.height + 'px' })}>
          ${this.sections.map((s, i) => this.renderSection(i))}
        </div>
      </ha-card>
    `;
  }
}
