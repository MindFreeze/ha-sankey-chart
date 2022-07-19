/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  LitElement,
  html,
  svg,
  TemplateResult,
  SVGTemplateResult,
  PropertyValues,
  CSSResultGroup,
} from 'lit';
import { styleMap } from 'lit/directives/style-map';
import { classMap } from 'lit/directives/class-map';
import { until } from 'lit/directives/until.js';
import { customElement, property, state } from "lit/decorators";
import {
  HomeAssistant,
  // hasAction,
  // ActionHandlerEvent,
  // LovelaceCardEditor,
  getLovelace,
  stateIcon,
  fireEvent,
  LovelaceCard,
  createThing,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers


// import './editor';

import type { Config, SankeyChartConfig, SectionState, EntityConfigOrStr, Box, EntityConfigInternal, Connection } from './types';
// import { actionHandler } from './action-handler-directive';
import { MIN_LABEL_HEIGHT } from './const';
import {version} from '../package.json';
import { localize } from './localize/localize';
import styles from './styles';
import { formatState, normalizeStateValue } from './utils';

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
  description: 'A card to display a sankey chart. For example for power consumptionA template custom card for you to create something awesome',
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
  @property({ attribute: false }) private entities: string[] = [];

  @state() private config!: Config;
  @state() public height = 200;
  @state() private sections: SectionState[] = [];
  @state() private statePerPixelY = 0;

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: SankeyChartConfig): void {
    if (!config || !Array.isArray(config.sections)) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }

    this.config = {
      height: 200,
      unit_prefix: '',
      round: 0,
      min_box_height: 3,
      min_box_distance: 5,
      show_states: true,
      ...config,
    };

    this.height = this.config.height;

    const entities: string[] = [];
    config.sections.forEach(section => {
      section.entities.forEach(ent => {
        entities.push(this._getEntityId(ent));
      });
    });
    this.entities = entities;
  }

  public getCardSize(): number {
    return 4;
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }
    if (changedProps.has('config')) {
      return true;
    }
    return this.entities.some(entity => {
      const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
      if (oldHass) {
        return oldHass.states[entity] !== this.hass.states[entity];
      }
      return true;
    });
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    // if (this.config.show_warning) {
    //   return this._showWarning(localize('common.show_warning'));
    // }
    const errEntityId = this.entities.find(ent => !this._getEntityState(ent));
    if (errEntityId) {
      return html`${until(this._showError(localize('common.entity_not_found') + ' ' + errEntityId))}`;
    }

    this._calcElements();

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
      <ha-card
        tabindex="0"
        label="Sankey Chart"
        .header=${this.config.title}
      >
      <div class=${containerClasses} style=${styleMap({height: this.height+'px'})}>
        ${this.sections.map((s, i) => this.renderSection(i))}
      </div>
      </ha-card>
    `;
  }

  protected renderSection(index: number): TemplateResult {
    const {show_names, show_icons, show_states} = this.config;
    const section = this.sections[index];
    const {boxes, spacerH} = section;
    const hasChildren = index < this.sections.length - 1 && boxes.some(b => b.children.length > 0);

    return html`
        <div class="section">
          ${hasChildren ?
            html`<div class="connectors">
              <svg viewBox="0 0 100 ${this.height}" preserveAspectRatio="none">
                ${this.renderBranchConnectors(index)}
              </svg>
            </div>` :
            null
          }
          ${boxes.map((box, i) => {
            const formattedState = formatState(box.state, this.config.round);
            const name = box.config.name || box.entity.attributes.friendly_name || '';
            const maxLabelH = box.size + spacerH - 1;
            const labelStyle = maxLabelH < MIN_LABEL_HEIGHT
              ? {maxHeight: maxLabelH+'px', fontSize: `${maxLabelH/MIN_LABEL_HEIGHT}em`}
              : {};
            return html`
              ${i > 0 ? html`<div class="spacerv" style=${styleMap({height: spacerH+'px'})}></div>` : null}
              <div class="box" style=${styleMap({height: box.size+'px'})}>
                <div style=${styleMap({backgroundColor: box.color})}
                  @click=${() => this._handleBoxClick(box)}
                  title=${name}
                >
                  ${show_icons ? html`<ha-icon .icon=${stateIcon(box.entity)}></ha-icon>` : null}
                </div>
                <div class="label" style=${styleMap(labelStyle)}>
                  ${show_states ? html`<span class="state">${formattedState}</span><span class="unit">${box.unit_of_measurement}</span>` : null}
                  ${show_names ? html`<span class="name">&nbsp;${name}</span>` : null}
                </div>
              </div>
            `;
          })}
        </div>
    `;
  }

  protected renderBranchConnectors(index: number): SVGTemplateResult[] {
    const section = this.sections[index];
    const {boxes} = section;
    return boxes.filter(b => b.children.length > 0).map(b => {
      const children = this.sections[index + 1].boxes.filter(child => b.children.includes(child.entity_id));
      let accountedStartState = 0;
      const connections = children.map(c => {
        const remainingStartState = b.state - accountedStartState;
        // remaining c.state could be less because of previous connections
        const accountedEndState = c.connections.parents.reduce((sum, c) => sum + c.state, 0);
        const remainingEndState = c.state - accountedEndState;
        const connectionState = Math.min(remainingStartState, remainingEndState);
        if (connectionState <= 0) {
          // only continue if this connection will be rendered
          return {state: connectionState} as Connection;
        }
        const startY = accountedStartState / b.state * b.size + b.top;
        const startSize = Math.max(connectionState / b.state * b.size, 0);
        const endY = accountedEndState / c.state * c.size + c.top;
        const endSize = Math.max(connectionState / c.state * c.size, 0);
        accountedStartState += connectionState;

        const connection = {
          startY,
          startSize,
          startColor: b.color,
          endY,
          endSize,
          endColor: c.color,
          state: connectionState,
        };
        c.connections.parents.push(connection);
        return connection;
      }).filter(c => c.state > 0);
      return svg`
        <defs>
          ${connections.map((c, i) => svg`
            <linearGradient id="gradient${b.entity_id + i}">
              <stop offset="0%" stop-color="${c.startColor}"></stop>
              <stop offset="100%" stop-color="${c.endColor}"></stop>
            </linearGradient>
          `)}
        </defs>
        ${connections.map((c, i) => svg`
          <path d="M0,${c.startY} C50,${c.startY} 50,${c.endY} 100,${c.endY} L100,${c.endY+c.endSize} C50,${c.endY+c.endSize} 50,${c.startY+c.startSize} 0,${c.startY+c.startSize} Z"
            fill="url(#gradient${b.entity_id + i})" />
        `)}
      `;
    })
  }

  private _calcElements() {
    this.statePerPixelY = 0;
    const extraEntities: EntityConfigInternal[][] = this.config.sections.map(() => []);
    this.sections = this.config.sections.map((section, sectionIndex) => {
      let total = 0;
      const allSectionEntities = section.entities.reduce((acc, conf) => {
        const entityConf: EntityConfigInternal = typeof conf === 'string' ? {entity_id: conf} : conf;
        const other = extraEntities[sectionIndex]
          .find(e => e.children![e.children!.length - 1] === entityConf.entity_id);
          // position 'remaining' boxes right after all other children of the same parent
        return other ? [...acc, entityConf, other] : [...acc, entityConf];
      }, [] as EntityConfigInternal[]);
      let boxes: Box[] = allSectionEntities
        .filter(entity => {
          const state = Number(this._getEntityState(entity).state);
          return !isNaN(state) && state > 0;
        })
        .map(entityConf => {
          const entity = this._getEntityState(entityConf);
          // eslint-disable-next-line prefer-const
          let {state, unit_of_measurement} = normalizeStateValue(
            this.config.unit_prefix,
            Number(entity.state),
            entity.attributes.unit_of_measurement
          );
          if (entityConf.accountedState) {
            state -= entityConf.accountedState
          }
          total += state;
          if (extraEntities[sectionIndex]) {
            extraEntities[sectionIndex].some(e => {
              if (e.children!.some(c => c === entityConf.entity_id)) {
                e.accountedState! += state;
              }
            });
          }

          let children = entityConf.children || [];
          if (entityConf.remaining && extraEntities[sectionIndex + 1]) {
            children = [...children, entityConf.entity_id];
            const remainingConf = typeof entityConf.remaining === 'string'
              ? {name: entityConf.remaining} : entityConf.remaining;
            extraEntities[sectionIndex + 1].push({
              ...entityConf,
              color: undefined,
              ...remainingConf,
              accountedState: 0,
            });
          }

          let finalColor = entityConf.color || 'var(--primary-color)';
          if (typeof entityConf.color_on_state != 'undefined' && entityConf.color_on_state) {
            const colorLimit = typeof entityConf.color_limit === 'undefined' ? 1 : entityConf.color_limit;
            const colorBelow = typeof entityConf.color_below === 'undefined' ? 'var(--primary-color)' : entityConf.color_below;
            const colorAbove = typeof entityConf.color_above === 'undefined' ? 'var(--paper-item-icon-color)' : entityConf.color_above;
            finalColor = state > colorLimit ? colorAbove : colorBelow;
          }

          return {
            config: entityConf,
            entity,
            entity_id: this._getEntityId(entityConf),
            state,
            unit_of_measurement,
            color: finalColor,
            children,
            connections: {parents: []},
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
      const availableHeight = this.height - ((boxes.length - 1) * this.config.min_box_distance);
      // calc sizes to determine statePerPixelY ratio and find the best one
      const calcResults = this._calcBoxHeights(boxes, availableHeight, total);
      boxes = calcResults.boxes;
      const totalSize = boxes.reduce((sum, b) => sum + b.size, 0);
      const extraSpace = this.height - totalSize;
      const spacerH = boxes.length > 1 ? extraSpace / (boxes.length - 1) : 0;
      let offset = 0;
      boxes = boxes.map(box => {
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
    .filter(s => s.boxes.length > 0)
    .map(section => {
      // calc sizes again with the best statePerPixelY
      let totalSize = 0;
      let {boxes} = section;
      if (section.statePerPixelY !== this.statePerPixelY) {
        boxes = boxes.map(box => {
          const size = Math.max(this.config.min_box_height, Math.floor(box.state/this.statePerPixelY));
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
      boxes = boxes.map(box => {
        const top = offset;
        offset += box.size + spacerH;
        return {
          ...box,
          top,
        };
      })
      return {
        ...section,
        boxes,
        spacerH,
      };
    });
  }

  private _calcBoxHeights(boxes: Box[], availableHeight: number, totalState: number)
    : {boxes: Box[], statePerPixelY: number} {
    const statePerPixelY = totalState / availableHeight;
    if (statePerPixelY > this.statePerPixelY) {
      this.statePerPixelY = statePerPixelY;
    }
    let deficitHeight = 0;
    const result = boxes.map(box => {
      if (box.size === this.config.min_box_height) {
        return box;
      }
      let size = Math.floor(box.state/this.statePerPixelY);
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
    return {boxes: result, statePerPixelY: this.statePerPixelY};
  }

  private _handleBoxClick(box: Box): void {
    fireEvent(this, "hass-more-info", { entityId: box.entity_id });
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

  private _getEntityId(entity: EntityConfigOrStr): string {
    return typeof entity === 'string' ? entity : entity.entity_id;
  }

  private _getEntityState(entity: EntityConfigOrStr) {
    return this.hass.states[this._getEntityId(entity)];
  }

  static get styles(): CSSResultGroup {
    return styles;
  }
}
