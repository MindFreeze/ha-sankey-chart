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
import { styleMap } from 'lit-html/directives/style-map';
import { customElement, property, state } from "lit/decorators";
import {
  HomeAssistant,
  hasAction,
  ActionHandlerEvent,
  LovelaceCardEditor,
  getLovelace,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers


import './editor';

import type { SankeyChartConfig, SectionState, EntityConfig } from './types';
import { actionHandler } from './action-handler-directive';
import { CARD_VERSION, MIN_BOX_HEIGHT, MIN_SPACER_HEIGHT } from './const';
import { localize } from './localize/localize';
import styles from './styles';

/* eslint no-console: 0 */
console.info(
  `%c sankey-chart %c ${localize('common.version')} ${CARD_VERSION} `,
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
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('sankey-chart-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // TODO Add any properities that should cause your element to re-render here
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) private entities: string[] = [];
  
  @state() private config!: SankeyChartConfig;
  @state() public height = 200;
  @state() private sections: SectionState[] = [];
  @state() private maxSectionTotal = 0;

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: SankeyChartConfig): void {
    // TODO Check for required fields and that they are of the proper format
    if (!config || !Array.isArray(config.sections)) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }

    if (config.height) {
      this.height = config.height;
    }

    this.config = {
      // name: 'Sankey Chart',
      ...config,
    };

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
      return this._showError(localize('common.entity_not_found'));
    }

    this._calcElements();

    return html`
      <ha-card
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(this.config.hold_action),
          hasDoubleClick: hasAction(this.config.double_tap_action),
        })}
        tabindex="0"
        .label=${`Boilerplate: ${this.config.entity || 'No Entity Defined'}`}
      >
      <div class="container" style="min-height:${this.height}px">
        ${this.sections.map((s, i) => this.renderSection(i))}
      </div>
      </ha-card>
    `;
  }

  protected renderSection(index: number): TemplateResult {
    const section = this.sections[index];
    const {boxes} = section;
    const hasChildren = index < this.sections.length - 1 && boxes.some(b => b.children.length > 0);
    
    return html`
        <div class="section">
          ${hasChildren ?
            html`<svg class="connectors" viewBox="0 0 100 ${this.height}" preserveAspectRatio="none">
              ${this.renderBranchConnectors(index)}
            </svg>` :
            null
          }
          ${boxes.map((box, i) => html`
            ${i > 0 ? html`<div class="spacerv" style="height:${section.spacerH}px"></div>` : null}
            <div class="box" style=${styleMap({height: box.size+'px'})}>
              <div style=${styleMap({backgroundColor: box.color})}></div>
              <span>${Math.round(box.state)}${box.unit_of_measurement} <span>${box.entity.attributes.friendly_name}</span></span>
            </div>
          `)}
        </div>
    `;
  }

  protected renderBranchConnectors(index: number): SVGTemplateResult[] {
    const section = this.sections[index];
    const {boxes} = section;
    return boxes.filter(b => b.children.length > 0).map(b => {
      const children = this.sections[index + 1].boxes.filter(child => b.children.includes(child.entity_id));
      let startYOffset = 0;
      const connections = children.map(c => {
        const endYOffset = c.connections.parents.reduce((sum, c) => sum + c.endSize, 0);
        const startY = b.top + startYOffset;
        const startSize = Math.min(c.size - endYOffset, b.size - startYOffset);
        startYOffset += startSize;
        const endY = c.top + endYOffset;
        const endSize = startSize;

        const connection = {
          startY, 
          startSize, 
          startColor: b.color,
          endY, 
          endSize,
          endColor: c.color,
        };
        c.connections.parents.push(connection);
        return connection;
      }).filter(c => c.endSize);
      return svg`
        <defs>
          ${connections.map((c, i) => svg`
            <linearGradient id="gradient${b.entity_id + i}">
              <stop offset="0%" stop-color="${c.startColor}"/>
              <stop offset="100%" stop-color="${c.endColor}"/>
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
    this.maxSectionTotal = 0;
    this.sections = this.config.sections.map(section => {
      let total = 0;
      const boxes = section.entities
        .filter(entity => {
          const state = Number(this._getEntityState(entity).state);
          return !isNaN(state) && state !== 0;
        })
        .map(entityConf => {
          const entity = this._getEntityState(entityConf);
          let state = Number(entity.state);
          let {unit_of_measurement} = entity.attributes;
          if (unit_of_measurement && unit_of_measurement.indexOf('k') === 0) {
            state *= 1000;
            unit_of_measurement = unit_of_measurement.substring(1);
          }
          total += state;
          return {
            entity,
            entity_id: this._getEntityId(entityConf),
            state,
            unit_of_measurement,
            color: typeof entityConf !== 'string' && entityConf.color || 'var(--primary-color)',
            children: typeof entityConf !== 'string' && entityConf.children ? entityConf.children : [],
            connections: {parents: []},
            top: 0,
            size: 0,
          };
        });
      // const total = boxes.reduce((sum, box) => sum + box.state, 0);
      if (total > this.maxSectionTotal) {
        this.maxSectionTotal = total;
      }
      return {
        boxes,
        total,
      };
    });
    this.sections = this.sections.map(section => {
      let totalSize = 0;
      let boxes = section.boxes.map(box => {
        const totalHeight = section.boxes.length > 1 && section.total === this.maxSectionTotal
          ? this.height - ((section.boxes.length - 1) * MIN_SPACER_HEIGHT) // leave room for margin
          : this.height;
        const size = Math.max(MIN_BOX_HEIGHT, box.state/this.maxSectionTotal*totalHeight);
        totalSize += size;
        return {
          ...box,
          size,
        };
      })
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
      })
      return {
        ...section,
        boxes,
        spacerH,
      };
    });
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    console.log('@TODO');
    if (this.hass && this.config && ev.detail.action) {
      // handleAction(this, this.hass, this.config, ev.detail.action);
    }
  }

  // private _showWarning(warning: string): TemplateResult {
  //   return html`
  //     <hui-warning>${warning}</hui-warning>
  //   `;
  // }

  private _showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card');
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config,
    });

    return html`
      ${errorCard}
    `;
  }

  private _getEntityId(entity: EntityConfig): string {
    return typeof entity === 'string' ? entity : entity.entity_id;
  }

  private _getEntityState(entity: EntityConfig) {
    return this.hass.states[this._getEntityId(entity)];
  }

  static get styles(): CSSResultGroup {
    return styles;
  }
}
