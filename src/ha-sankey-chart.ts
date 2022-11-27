/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult } from 'lit';
import { customElement, property, query, state } from 'lit/decorators';
import {
  HomeAssistant,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import type {
  Config,
  SankeyChartConfig,
} from './types';
import { version } from '../package.json';
import { localize } from './localize/localize';
import { normalizeConfig } from './utils';
import { SubscribeMixin } from './subscribe-mixin';
import './chart';
import { Chart } from './chart';
import { HassEntities } from 'home-assistant-js-websocket';
import { EnergyCollection, getEnergyDataCollection, getStatistics } from './energy';

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
export class SankeyChart extends SubscribeMixin(LitElement) {
  // public static async getConfigElement(): Promise<LovelaceCardEditor> {
  //   return document.createElement('sankey-chart-editor');
  // }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;

  @query("ha-chart-base") private _chart?: Chart;

  @state() private config!: Config;
  @state() private states: HassEntities = {};
  @state() private entityIds: string[] = [];
  @state() private lastUpdate = 0;

  public hassSubscribe() {
    if (!this.config.energy_date_selection) {
      return [];
    }
    const getEnergyDataCollectionPoll = (resolve) => {
      const energyCollection = getEnergyDataCollection(this.hass);
      if (energyCollection) {
        resolve(energyCollection);
      } else {
        setTimeout(() => getEnergyDataCollectionPoll(resolve), 100);
      }
    };
    const energyPromise = new Promise<EnergyCollection>(getEnergyDataCollectionPoll);
    return [
      energyPromise.then(collection => {
        return collection.subscribe(async (data) => {
          const stats = await getStatistics(this.hass, data, this.entityIds);
          const states: HassEntities = {};
          Object.keys(stats).forEach(id => {
            if (this.hass.states[id]) {
              states[id] = {...this.hass.states[id], state: String(stats[id])};
            }
          });
          this.states = states;
          // this.requestUpdate();
        })
      }),
    ];
  }
  
  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: SankeyChartConfig): void {
    if (!config || !Array.isArray(config.sections)) {
      throw new Error(localize('common.invalid_configuration'));
    }

    // if (config.test_gui) {
    //   getLovelace().setEditMode(true);
    // }

    this.config = normalizeConfig(config);

    this.entityIds = [];
    this.config.sections.forEach(({ entities }) => {
      entities.forEach((ent) => {
        if (ent.type === 'entity') {
          this.entityIds.push(ent.entity_id);
        }
      });
    });
  }

  public getCardSize(): number {
    return 4;
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(): boolean {
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
    return true;
  }

  public willUpdate(): void {
    this.lastUpdate = Date.now();
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    return html`
      <sankey-chart-base
          .hass=${this.hass}
          .states=${this.config.energy_date_selection ? this.states : this.hass.states}
          .config=${this.config}
      ></sankey-chart-base>
    `;
  }
}
