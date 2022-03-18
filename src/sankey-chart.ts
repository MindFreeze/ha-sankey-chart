/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  LitElement,
  html,
  TemplateResult,
  css,
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
    // TODO Check for stateObj or other necessary things and render a warning if missing
    // if (this.config.show_warning) {
    //   return this._showWarning(localize('common.show_warning'));
    // }
    const errEntityId = this.entities.find(ent => !this._getEntityState(ent));
    if (errEntityId) {
      return this._showError(localize('common.entity_not_found'));
    }

    let maxSectionTotal = 0;
    const sections: SectionState[] = this.config.sections.map(section => {
      const boxes = section.entities
        .filter(entity => !isNaN(Number(this._getEntityState(entity).state)))
        .map(entity => ({
          entity_id: this._getEntityId(entity),
          state: Number(this._getEntityState(entity).state),
          parents: typeof entity !== 'string' && entity.parents ? entity.parents : [],
        }));
      const total = boxes.reduce((sum, box) => sum + box.state, 0);
      if (total > maxSectionTotal) {
        maxSectionTotal = total;
      }
      return {
        boxes,
        total,
      };
    });

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
        ${sections.map(s => this.renderSection(s, maxSectionTotal))}
      </div>
      </ha-card>
    `;
  }

  protected renderSection(section: SectionState, maxSectionTotal: number): TemplateResult | void {
    const {boxes} = section;
    const sizes = boxes.map(b => Math.max(MIN_BOX_HEIGHT, b.state/maxSectionTotal*this.height));
    const totalSize = sizes.reduce((sum, s) => sum + s, 0);
    const extraSpace = this.height - totalSize;
    const spacerH = boxes.length > 1 ? extraSpace / (boxes.length - 1) : 0;

    const hasParents = boxes.some(b => b.parents.length > 0);

    return html`
        ${hasParents ?
          html`<div class="connectors"></div>` :
          null
        }
        <div class="section">
          ${boxes.map((box, i) => html`
            ${i > 0 ? html`<div class="spacerv" style="height:${spacerH}px"></div>` : null}
            <div class="box" style="height: ${sizes[i]}px">${box.state}</div>
          `)}
        </div>
    `;
  }

  private _handleAction(ev: ActionHandlerEvent): void {
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

  // https://lit.dev/docs/components/styles/
  static get styles(): CSSResultGroup {
    return css`
      ha-card {
        padding: 5px 0;
        background-color: var(--primary-background-color);
      }
      .container {
        display: flex;
        width: 100%;
        /* height: 210px; */
      }
      .section {
        flex: 1;
        flex-direction: column;
      }
      .box {
        position: relative;
        min-height: 1px;
        /* margin: 5px 0; */
        /* background-color: var(--accent-color); */
      }
      .box::before {
          content: "";
          width: 100%;
          height: 100%;
          position: absolute;
          left: 0;
          background-color: var(--accent-color);
          opacity: 0.5;
      }
      .connectors {
        flex: 0.25;
        flex-direction: column;
      }
    `;
  }
}
