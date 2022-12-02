/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult } from 'lit';
import { customElement, property, query, state } from 'lit/decorators';
import { HomeAssistant } from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import type { Config, SankeyChartConfig, Section } from './types';
import { version } from '../package.json';
import { localize } from './localize/localize';
import { normalizeConfig, renderError } from './utils';
import { SubscribeMixin } from './subscribe-mixin';
import './chart';
import { Chart } from './chart';
import { HassEntities } from 'home-assistant-js-websocket';
import { EnergyCollection, getEnergyDataCollection, getEnergySourceColor, getStatistics } from './energy';
import { until } from 'lit/directives/until';

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

const ENERGY_DATA_TIMEOUT = 10000;

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

  @query('ha-chart-base') private _chart?: Chart;

  @state() private config!: Config;
  @state() private states: HassEntities = {};
  @state() private entityIds: string[] = [];
  @state() private lastUpdate = 0;
  @state() private error?: Error;

  public hassSubscribe() {
    if (!this.config.energy_date_selection) {
      return [];
    }
    const start = Date.now();
    const getEnergyDataCollectionPoll = resolve => {
      const energyCollection = getEnergyDataCollection(this.hass);
      if (energyCollection) {
        resolve(energyCollection);
      } else if (Date.now() - start > ENERGY_DATA_TIMEOUT) {
        this.error = new Error(
          'No energy data received. Make sure to add a `type: energy-date-selection` card to this screen.',
        );
      } else {
        setTimeout(() => getEnergyDataCollectionPoll(resolve), 100);
      }
    };
    const energyPromise = new Promise<EnergyCollection>(getEnergyDataCollectionPoll);
    return [
      energyPromise.then(collection => {
        if (typeof this.config.autoconfig === 'object') {
          this.autoconfig(collection);
        }
        return collection.subscribe(async data => {
          const stats = await getStatistics(this.hass, data, this.entityIds);
          const states: HassEntities = {};
          Object.keys(stats).forEach(id => {
            if (this.hass.states[id]) {
              states[id] = { ...this.hass.states[id], state: String(stats[id]) };
            }
          });
          this.states = states;
          // this.requestUpdate();
        });
      }),
    ];
  }

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: SankeyChartConfig): void {
    if (typeof config !== 'object') {
      throw new Error(localize('common.invalid_configuration'));
    }

    // if (config.test_gui) {
    //   getLovelace().setEditMode(true);
    // }

    this.setNormalizedConfig(normalizeConfig(config));
  }

  private setNormalizedConfig(config: Config): void {
    this.config = config;

    this.entityIds = [];
    this.config.sections.forEach(({ entities }) => {
      entities.forEach(ent => {
        if (ent.type === 'entity') {
          this.entityIds.push(ent.entity_id);
        }
        if (ent.add_entities) {
          ent.add_entities.forEach(e => this.entityIds.push(e));
        }
        if (ent.substract_entities) {
          ent.substract_entities.forEach(e => this.entityIds.push(e));
        }
      });
    });
  }

  private autoconfig(collection: EnergyCollection): void {
    const sources = (collection.prefs?.energy_sources || [])
      .filter(s => s.stat_energy_from || s.flow_from?.length)
      .sort((s1, s2) => {
        // sort to solar, battery, grid
        if (s1.type === s2.type) {
          return 0;
        }
        if (s1.type === 'solar') {
          return -1;
        }
        if (s1.type === 'battery' && s2.type !== 'solar') {
          return -1;
        }
        return 1;
      });
    const deviceIds = (collection.prefs?.device_consumption || []).map(d => d.stat_consumption);
    const sections: Section[] = [
      {
        entities: sources.map(source => {
          const substract = source.stat_energy_to
            ? [source.stat_energy_to]
            : (source.flow_to || []).map(e => e.stat_energy_to);
          return {
            entity_id: source.stat_energy_from || source.flow_from[0].stat_energy_from,
            add_entities:
              source.flow_from?.length > 1 ? source.flow_from.slice(1).map(e => e.stat_energy_from) : undefined,
            substract_entities: substract,
            type: 'entity',
            color: getEnergySourceColor(source.type),
            children: ['total'],
          };
        }),
      },
      {
        entities: [
          {
            entity_id: 'total',
            type: 'remaining_parent_state',
            name: 'Total Consumption',
            children: deviceIds,
          },
        ],
      },
      {
        entities: deviceIds.map(id => ({
          entity_id: id,
          type: 'entity',
          children: [],
        })),
      },
    ];

    const grid = sources.find(s => s.type === 'grid');
    if (grid && grid.flow_to.length) {
      // grid export
      sections[1].entities.unshift({
        entity_id: grid.flow_to[0].stat_energy_to,
        substract_entities: (grid.flow_from || []).map(e => e.stat_energy_from),
        type: 'entity',
        color: getEnergySourceColor(grid.type),
        children: [],
      });
      sections[0].entities.forEach(entity => {
        entity.children.unshift(grid.stat_energy_to!);
      });
    }

    const battery = sources.find(s => s.type === 'battery');
    if (battery && battery.stat_energy_from && battery.stat_energy_to) {
      // battery charging
      sections[1].entities.unshift({
        entity_id: battery.stat_energy_to,
        substract_entities: [battery.stat_energy_from],
        type: 'entity',
        color: getEnergySourceColor(battery.type),
        children: [],
      });
      sections[0].entities.forEach(entity => {
        entity.children.unshift(battery.stat_energy_to!);
      });
    }

    this.setNormalizedConfig({ ...this.config, sections });
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
    if (this.error) {
      return html`${until(renderError(String(this.error), this.config, this.hass))}`;
    }
    const print_yaml = this.config.autoconfig?.print_yaml;
    return html`
      <sankey-chart-base
        .hass=${this.hass}
        .states=${this.config.energy_date_selection ? this.states : this.hass.states}
        .config=${this.config}
      ></sankey-chart-base>
      ${print_yaml && this.config.sections.length
        ? html`${until(renderError('', { ...this.config, autoconfig: undefined }, this.hass))}`
        : ''}
    `;
  }
}
