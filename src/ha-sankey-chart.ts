/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, query, state } from 'lit/decorators';

import type { Config, EntityConfigInternal, SankeyChartConfig, Section } from './types';
import { version } from '../package.json';
import { localize } from './localize/localize';
import { createPassthroughs, normalizeConfig, renderError } from './utils';
import { SubscribeMixin } from './subscribe-mixin';
import './chart';
import './print-config';
import { HassEntities } from 'home-assistant-js-websocket';
import {
  Conversions,
  EnergyCollection,
  ENERGY_SOURCE_TYPES,
  getEnergyDataCollection,
  getEnergySourceColor,
  getStatistics,
  getEnergyPreferences,
  EnergyPreferences,
} from './energy';
import { until } from 'lit/directives/until';
import { fetchFloorRegistry, getEntitiesByArea, HomeAssistantReal } from './hass';
import { LovelaceCardEditor } from 'custom-card-helpers';
import './editor/index';
import { calculateTimePeriod } from './utils';

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
  description: 'A card to display a sankey chart. For example for power or energy consumption',
  documentationURL: 'https://github.com/MindFreeze/ha-sankey-chart',
  // preview: true, // requires energy data
});

const ENERGY_DATA_TIMEOUT = 10000;

type DeviceNode = { id: string; name?: string; parent?: string };

@customElement('sankey-chart')
class SankeyChart extends SubscribeMixin(LitElement) {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    // await import('./editor');
    return document.createElement('sankey-chart-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return { autoconfig: { print_yaml: false, group_by_floor: true, group_by_area: true } };
  }

  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistantReal;

  @state() private config!: Config;
  @state() private states: HassEntities = {};
  @state() private entityIds: string[] = [];
  @state() private error?: Error | unknown;
  @state() private forceUpdateTs?: number;

  public hassSubscribe() {
    const isAutoconfig = this.config.autoconfig || typeof this.config.autoconfig === 'object';
    if (this.config.energy_date_selection) {
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
          if (isAutoconfig && !this.config.sections.length) {
            try {
              await this.autoconfig(collection.prefs);
            } catch (err: any) {
              this.error = new Error(err?.message || err);
            }
          }
          return collection.subscribe(async data => {
            if (isAutoconfig && !this.config.sections.length) {
              try {
                await this.autoconfig(collection.prefs);
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
    } else if (this.config.time_period_from) {
      const getTimePeriod = async () => {
        if (isAutoconfig && !this.config.sections.length) {
          await this.autoconfig();
        }
        if (this.config.time_period_from) {
          try {
            const { start, end } = calculateTimePeriod(this.config.time_period_from, this.config.time_period_to);
            if (this.entityIds.length) {
              const conversions: Conversions = {
                convert_units_to: this.config.convert_units_to!,
                co2_intensity_entity: this.config.co2_intensity_entity!,
                gas_co2_intensity: this.config.gas_co2_intensity!,
                electricity_price: this.config.electricity_price,
                gas_price: this.config.gas_price,
              };
              const stats = await getStatistics(this.hass, { start, end }, this.entityIds, conversions);
              const states: HassEntities = {};
              Object.keys(stats).forEach(id => {
                if (this.hass.states[id]) {
                  states[id] = { ...this.hass.states[id], state: String(stats[id]) };
                }
              });
              this.states = states;
            }
          } catch (err: any) {
            this.error = err;
          }
          this.forceUpdateTs = Date.now();
        }
      };
      getTimePeriod();
      const interval = setInterval(getTimePeriod, this.config.throttle || 1000);
      return [() => clearInterval(interval)];
    }
    return [];
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
        ent.children.forEach(childConf => {
          if (typeof childConf === 'object' && childConf.connection_entity_id) {
            this.entityIds.push(childConf.connection_entity_id);
          }
        });
        if (ent.add_entities) {
          ent.add_entities.forEach(e => this.entityIds.push(e));
        }
        if (ent.subtract_entities) {
          ent.subtract_entities.forEach(e => this.entityIds.push(e));
        }
      });
    });
  }

  private async autoconfig(prefs?: EnergyPreferences) {
    if (!prefs) {
      prefs = await getEnergyPreferences(this.hass);
    }
    const sources: typeof prefs.energy_sources = [];
    (prefs?.energy_sources || []).forEach(s => {
      if (!ENERGY_SOURCE_TYPES.includes(s.type)) {
        return;
      }
      [s, ...(s.flow_from || [])].forEach(f => {
        if (f.stat_energy_from) {
          if (!this.hass.states[f.stat_energy_from]) {
            console.warn('Ignoring missing entity ' + f.stat_energy_from);
          } else {
            sources.push({ ...s, ...f });
          }
        }
      });
    });
    sources.sort((s1, s2) => {
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
    const deviceNodes: DeviceNode[] = [];
    const parentLinks: Record<string, string> = {};
    prefs.device_consumption.forEach((device, idx) => {
      const node = {
        id: device.stat_consumption,
        name: device.name,
        parent: device.included_in_stat,
      };
      if (node.parent) {
        parentLinks[node.id] = node.parent;
      }
      deviceNodes.push(node);
    });
    const devicesWithoutParent = deviceNodes.filter(node => !parentLinks[node.id]);

    const totalNode: EntityConfigInternal = {
      entity_id: 'total',
      type: sources.length ? 'remaining_parent_state' : 'remaining_child_state',
      name: 'Total Consumption',
      children: ['unknown'],
      children_sum: {
        should_be: 'equal_or_less',
        reconcile_to: 'max',
      },
    };

    const sections = [
      {
        entities: sources.map(source => {
          const subtract = source.stat_energy_to
            ? [source.stat_energy_to]
            : source.flow_to?.map(e => e.stat_energy_to) || undefined;
          return {
            entity_id: source.stat_energy_from,
            subtract_entities: subtract,
            type: 'entity',
            color: getEnergySourceColor(source.type),
            children: ['total'],
          };
        }),
      },
      {
        entities: [totalNode],
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

    const groupByFloor = this.config.autoconfig?.group_by_floor !== false;
    const groupByArea = this.config.autoconfig?.group_by_area !== false;

    if (groupByFloor || groupByArea) {
      const areasResult = await getEntitiesByArea(
        this.hass,
        devicesWithoutParent.map(d => d.id),
      );
      const areas = Object.values(areasResult)
        // put 'No area' last
        .sort((a, b) => (a.area.name === 'No area' ? 1 : b.area.name === 'No area' ? -1 : 0));

      const floors = await fetchFloorRegistry(this.hass);
      const orphanAreas = areas.filter(a => !a.area.floor_id);
      if (groupByFloor && orphanAreas.length !== areas.length) {
        totalNode.children = [
          ...totalNode.children,
          ...floors.map(f => f.floor_id),
          ...(groupByArea ? orphanAreas.map(a => a.area.area_id) : orphanAreas.map(a => a.entities).flat()),
        ];
        sections.push({
          entities: [
            ...floors.map(
              (f): EntityConfigInternal => ({
                entity_id: f.floor_id,
                type: 'remaining_child_state',
                name: f.name,
                children: groupByArea
                  ? areas.filter(a => a.area.floor_id === f.floor_id).map(a => a.area.area_id)
                  : areas
                      .filter(a => a.area.floor_id === f.floor_id)
                      .map(a => a.entities)
                      .flat(),
              }),
            ),
          ],
          sort_by: 'state',
        });
      } else {
        totalNode.children = [...totalNode.children, ...areas.map(a => a.area.area_id)];
      }
      if (groupByArea) {
        sections.push({
          entities: areas.map(
            ({ area, entities }): EntityConfigInternal => ({
              entity_id: area.area_id,
              type: 'remaining_child_state',
              name: area.name,
              children: entities,
            }),
          ),
          sort_by: 'state',
          sort_group_by_parent: true,
        });
      }
    } else {
      totalNode.children = [...totalNode.children, ...devicesWithoutParent.map(d => d.id)];
    }

    const deviceSections = this.getDeviceSections(parentLinks, deviceNodes);
    deviceSections.forEach((section, i) => {
      if (section.length) {
        sections.push({
          entities: section.map(d => ({
            entity_id: d.id,
            type: 'entity',
            name: d.name,
            children: deviceSections[i + 1]?.filter(c => c.parent === d.id).map(c => c.id) || [],
          })),
          sort_by: 'state',
          sort_group_by_parent: true,
        });
      }
    });

    // add unknown section after total node
    const totalIndex = sections.findIndex(s => s.entities.find(e => e.entity_id === 'total'));
    if (totalIndex !== -1 && sections[totalIndex + 1]) {
      sections[totalIndex + 1]?.entities.push({
        entity_id: 'unknown',
        type: 'remaining_parent_state',
        name: 'Unknown',
        children: [],
      });
    }

    createPassthroughs(sections);
    this.setNormalizedConfig({ ...this.config, sections });
  }

  private getDeviceSections(parentLinks: Record<string, string>, deviceNodes: DeviceNode[]): DeviceNode[][] {
    const parentSection: DeviceNode[] = [];
    const childSection: DeviceNode[] = [];
    const parentIds = Object.values(parentLinks);
    const remainingLinks: typeof parentLinks = {};
    deviceNodes.forEach(deviceNode => {
      if (parentIds.includes(deviceNode.id)) {
        parentSection.push(deviceNode);
        remainingLinks[deviceNode.id] = parentLinks[deviceNode.id];
      } else {
        childSection.push(deviceNode);
      }
    });
    if (parentSection.length > 0) {
      return [...this.getDeviceSections(remainingLinks, parentSection), childSection];
    }
    return [deviceNodes];
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
        .states=${Object.keys(this.states).length ? this.states : this.hass.states}
        .config=${this.config}
        .forceUpdateTs=${this.forceUpdateTs}
        .width=${this.clientWidth || this.offsetWidth || this.parentElement?.clientWidth || window.innerWidth}
      ></sankey-chart-base>

      ${print_yaml && this.config.sections.length
        ? html`<sankey-chart-print-config .hass=${this.hass} .config=${this.config}></sankey-chart-print-config>`
        : ''}
    `;
  }
}

export default SankeyChart;
