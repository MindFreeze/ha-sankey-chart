/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, query, state } from 'lit/decorators';

import type { Config, EntityConfigInternal, SankeyChartConfig, Section } from './types';
import { version } from '../package.json';
import { localize } from './localize/localize';
import { normalizeConfig, renderError } from './utils';
import { SubscribeMixin } from './subscribe-mixin';
import './chart';
import { HassEntities } from 'home-assistant-js-websocket';
import {
  Conversions,
  EnergyCollection,
  ENERGY_SOURCE_TYPES,
  getEnergyDataCollection,
  getEnergySourceColor,
  getStatistics,
} from './energy';
import { until } from 'lit/directives/until';
import { getEntitiesByArea, HomeAssistantReal } from './hass';
import { LovelaceCardEditor } from 'custom-card-helpers';
import './editor/index';

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
class SankeyChart extends SubscribeMixin(LitElement) {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    // await import('./editor');
    return document.createElement('sankey-chart-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return { autoconfig: { print_yaml: false } };
  }

  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistantReal;

  @state() private config!: Config;
  @state() private states: HassEntities = {};
  @state() private entityIds: string[] = [];
  @state() private error?: Error | unknown;
  @state() private forceUpdateTs?: number;

  public hassSubscribe() {
    if (!this.config.energy_date_selection) {
      return [];
    }
    const start = Date.now();
    const getEnergyDataCollectionPoll = (
      resolve: (value: EnergyCollection | PromiseLike<EnergyCollection>) => void,
      reject: (reason?: any) => void,
    ) => {
      const energyCollection = getEnergyDataCollection(this.hass);
      if (energyCollection) {
        resolve(energyCollection);
      } else if (Date.now() - start > ENERGY_DATA_TIMEOUT) {
        console.debug(getEnergyDataCollection(this.hass));
        reject(
          new Error('No energy data received. Make sure to add a `type: energy-date-selection` card to this screen.'),
        );
      } else {
        setTimeout(() => getEnergyDataCollectionPoll(resolve, reject), 100);
      }
    };
    const energyPromise = new Promise<EnergyCollection>(getEnergyDataCollectionPoll);
    setTimeout(() => {
      if (!this.error && !Object.keys(this.states).length) {
        this.error = new Error('Something went wrong. No energy data received.');
        console.debug(getEnergyDataCollection(this.hass));
      }
    }, ENERGY_DATA_TIMEOUT * 2);
    energyPromise.catch(err => {
      this.error = err;
    });
    return [
      energyPromise.then(async collection => {
        const isAutoconfig = this.config.autoconfig || typeof this.config.autoconfig === 'object';
        if (isAutoconfig && !this.config.sections.length) {
          try {
            await this.autoconfig(collection);
          } catch (err: any) {
            this.error = new Error(err?.message || err);
          }
        }
        return collection.subscribe(async data => {
          if (isAutoconfig && !this.config.sections.length) {
            try {
              await this.autoconfig(collection);
            } catch (err: any) {
              this.error = new Error(err?.message || err);
              return;
            }
          }
          if (this.entityIds.length) {
            const conversions: Conversions = {
              convert_units_to: this.config.convert_units_to!,
              co2_intensity_entity: this.config.co2_intensity_entity!,
              gas_co2_intensity: this.config.gas_co2_intensity!,
              electricity_price: this.config.electricity_price,
              gas_price: this.config.gas_price,
            };
            const stats = await getStatistics(this.hass, data, this.entityIds, conversions);
            const states: HassEntities = {};
            Object.keys(stats).forEach(id => {
              if (this.hass.states[id]) {
                states[id] = { ...this.hass.states[id], state: String(stats[id]) };
              }
            });
            this.states = states;
          }
          this.forceUpdateTs = Date.now();
        });
      }),
    ];
  }

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: SankeyChartConfig, isMetric: boolean): void {
    if (typeof config !== 'object') {
      throw new Error(localize('common.invalid_configuration'));
    }

    this.setNormalizedConfig(normalizeConfig(config, isMetric));
    this.resetSubscriptions();
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
        if (ent.subtract_entities) {
          ent.subtract_entities.forEach(e => this.entityIds.push(e));
        }
      });
    });
  }

  private async autoconfig(collection: EnergyCollection) {
    if (!collection.prefs) {
      return;
    }
    const sources = (collection.prefs?.energy_sources || [])
      .map(s => ({
        ...s,
        ids: [s, ...(s.flow_from || [])]
          .map(f => f.stat_energy_from)
          .filter(id => {
            if (!id || !this.hass.states[id]) {
              if (id) {
                console.warn('Ignoring missing entity ' + id);
              }
              return false;
            }
            return true;
          }) as string[],
      }))
      .filter(s => ENERGY_SOURCE_TYPES.includes(s.type) && s.ids.length)
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
    const deviceIds = (collection.prefs?.device_consumption || [])
      .map(d => d.stat_consumption)
      .filter(id => {
        if (!this.hass.states[id]) {
          console.warn('Ignoring missing entity ' + id);
          return false;
        }
        return true;
      });
    const areasResult = await getEntitiesByArea(this.hass, deviceIds);
    const areas = Object.values(areasResult)
      // put 'No area' last
      .sort((a, b) => (a.area.name === 'No area' ? 1 : b.area.name === 'No area' ? -1 : 0));
    const orderedDeviceIds = areas.reduce((all: string[], a) => [...all, ...a.entities], []);

    const sections = [
      {
        entities: sources.map(source => {
          const subtract = source.stat_energy_to
            ? [source.stat_energy_to]
            : source.flow_to?.map(e => e.stat_energy_to) || undefined;
          return {
            entity_id: source.ids[0],
            add_entities: source.ids?.length > 1 ? source.ids.slice(1) : undefined,
            subtract_entities: subtract,
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
            type: sources.length ? 'remaining_parent_state' : 'remaining_child_state',
            name: 'Total Consumption',
            children: [...areas.map(a => a.area.area_id), 'unknown'],
          },
        ],
      },
      {
        entities: [
          ...areas.map(
            ({ area, entities }): EntityConfigInternal => ({
              entity_id: area.area_id,
              type: 'remaining_child_state',
              name: area.name,
              children: entities,
            }),
          ),
          {
            entity_id: 'unknown',
            type: 'remaining_parent_state',
            name: 'Unknown',
            children: [],
          },
        ],
      },
      {
        entities: orderedDeviceIds.map(id => ({
          entity_id: id,
          type: 'entity',
          children: [],
        })),
      },
    ].filter(s => s.entities.length > 0) as Section[];

    const grid = sources.find(s => s.type === 'grid');
    if (grid && grid?.flow_to?.length) {
      // grid export
      grid?.flow_to.forEach(({ stat_energy_to }) => {
        sections[1].entities.unshift({
          entity_id: stat_energy_to,
          subtract_entities: (grid.flow_from || []).map(e => e.stat_energy_from),
          type: 'entity',
          color: getEnergySourceColor(grid.type),
          children: [],
        });
        sections[0].entities.forEach(entity => {
          entity.children.unshift(stat_energy_to);
        });
      });
    }

    const battery = sources.find(s => s.type === 'battery');
    if (battery && battery.stat_energy_from && battery.stat_energy_to) {
      // battery charging
      sections[1].entities.unshift({
        entity_id: battery.stat_energy_to,
        subtract_entities: [battery.stat_energy_from],
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

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    if (this.error) {
      console.error(this.error);
      return html`${until(renderError(String(this.error), this.config, this.hass))}`;
    }
    const print_yaml = this.config.autoconfig?.print_yaml;
    return html`
      <sankey-chart-base
        .hass=${this.hass}
        .states=${this.config.energy_date_selection ? this.states : this.hass.states}
        .config=${this.config}
        .forceUpdateTs=${this.forceUpdateTs}
        .width=${this.clientWidth}
      ></sankey-chart-base>
      ${print_yaml && this.config.sections.length
        ? html`${until(renderError('', { ...this.config, autoconfig: undefined }, this.hass))}`
        : ''}
    `;
  }
}

export default SankeyChart;