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
import { CARD_VERSION, MIN_BOX_HEIGHT } from './const';
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
      <div class="container" style="height:${this.height}px">
        ${this.sections.map((s, i) => this.renderSection(i))}
      </div>
      </ha-card>
    `;
  }

  protected renderSection(index: number): TemplateResult {
    const section = this.sections[index];
    const {boxes} = section;
    const hasParents = index > 0 && boxes.some(b => b.parents.length > 0);
    // const parents = {};
    
    return html`
        ${hasParents ?
          html`<svg class="connectors" height="${this.height}" viewBox="0 0 100 ${this.height}" preserveAspectRatio="none">
            ${this.renderParentConnectors(index)}
          </svg>` :
          null
        }
        <div class="section">
          ${boxes.map((box, i) => html`
            ${i > 0 ? html`<div class="spacerv" style="height:${section.spacerH}px"></div>` : null}
            <div class="box" style="height: ${box.size}px">${box.state}</div>
          `)}
        </div>
    `;
  }

  protected renderParentConnectors(index: number): SVGTemplateResult[] {
    const section = this.sections[index];
    const {boxes} = section;
    return boxes.filter(b => b.parents.length > 0).map(b => {
      const parents = this.sections[index - 1].boxes.filter(parent => b.parents.includes(parent.entity_id));
      let endYOffset = 0;
      const connections = parents.map(p => {
        const startY = p.top + p.connections.children.reduce((sum, c) => sum + c.startSize, 0);
        const startSize = Math.min(p.size, b.size || 1);
        const endY = b.top + endYOffset;
        const endSize = startSize;
        endYOffset += endSize;

        const connection = {startY, startSize, endY, endSize};
        p.connections.children.push(connection);
        return connection;
      });
      return svg`
        ${connections.map(c => svg`
          <!-- <rect y="${c.startY}" width="50" height="${c.startSize}" />
          <rect x="50" y="${c.endY}" width="50" height="${c.endSize}" /> -->
          <path d="M0,${c.startY} C50,${c.startY} 50,${c.endY} 100,${c.endY}
            L100,${c.endY+c.endSize} C50,${c.endY+c.endSize} 50,${c.startY+c.startSize} 0,${c.startY+c.startSize} Z" />
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
        .map(entity => {
          const state = Number(this._getEntityState(entity).state);
          total += state;
          return {
            entity_id: this._getEntityId(entity),
            state,
            parents: typeof entity !== 'string' && entity.parents ? entity.parents : [],
            connections: {children: []},
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
        const size = Math.max(MIN_BOX_HEIGHT, box.state/this.maxSectionTotal*this.height);
        totalSize += size;
        return {
          ...box,
          size,
        };
      })
      // const totalSize = boxes.reduce((sum, b) => sum + b.size, 0);
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
