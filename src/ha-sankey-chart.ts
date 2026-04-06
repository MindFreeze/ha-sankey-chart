/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';

import type { Config, SankeyChartConfig, SectionConfig } from './types';
import { version } from '../package.json';
import { localize } from './localize/localize';
import { convertNodesToSections, normalizeConfig, renderError } from './utils';
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
          if (isAutoconfig && !this.config.nodes.length) {
            try {
              await this.autoconfig(collection.prefs);
            } catch (err: any) {
              this.error = new Error(err?.message || err);
            }
          }
          return collection.subscribe(async data => {
            if (isAutoconfig && !this.config.nodes.length) {
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

  private setNormalizedConfig(config: Config | (Omit<Config, 'sections'> & { sections?: SectionConfig[] })): void {
    // Convert SectionConfig[] to Section[] using nodes/links
    if (config.nodes && config.nodes.length) {
      const sectionConfigs = config.sections as SectionConfig[] | undefined;
      config = { ...config, sections: convertNodesToSections(config.nodes, config.links, sectionConfigs) };
    }

    this.config = config as Config;

    this.entityIds = [];
    this.config.nodes.forEach(({ id }) => {
      this.entityIds.push(id);
    });
    this.config.links.forEach(({ value }) => {
      if (value) {
        this.entityIds.push(value);
      }
    });
  }

  private async autoconfig(prefs?: EnergyPreferences) {
    if (!prefs) {
      prefs = await getEnergyPreferences(this.hass);
    }
    const netFlows = this.config.autoconfig?.net_flows !== false;
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

    const nodes: Config['nodes'] = [];
    const links: Config['links'] = [];
    const sections: SectionConfig[] = [];

    let currentSection = 0;

    // Add source nodes (section 0)
    sources.forEach(source => {
      if (!source.stat_energy_from) return;
      const subtract = (source.type === 'grid' || source.type === 'battery') && !netFlows
        ? undefined
        : source.stat_energy_to
          ? [source.stat_energy_to]
          : source.flow_to?.map(e => e.stat_energy_to).filter(Boolean) as string[] | undefined;
      nodes.push({
        id: source.stat_energy_from,
        section: currentSection,
        type: 'entity',
        name: '',
        subtract_entities: subtract,
        color: getEnergySourceColor(source.type),
      });
      links.push({ source: source.stat_energy_from, target: 'total' });
    });
    sections.push({}); // section 0 config

    currentSection++;

    // Add total node (section 1)
    nodes.push({
      id: 'total',
      section: currentSection,
      type: sources.length ? 'remaining_parent_state' : 'remaining_child_state',
      name: 'Total Consumption',
      children_sum: {
        should_be: 'equal_or_less',
        reconcile_to: 'max',
      },
    });
    links.push({ source: 'total', target: 'unknown' });

    // Handle grid export
    const gridSources = sources.filter(s => s.type === 'grid');
    const seenFlowTo = new Set<string>();
    gridSources.forEach(grid => {
      const exportEntities = grid.flow_to?.map(e => e.stat_energy_to) ??
        (grid.stat_energy_to ? [grid.stat_energy_to] : []);
      const importEntities = grid.flow_from?.map(e => e.stat_energy_from) ??
        (grid.stat_energy_from ? [grid.stat_energy_from] : []);
      if (exportEntities.length) {
        exportEntities.forEach(stat_energy_to => {
          if (!stat_energy_to || seenFlowTo.has(stat_energy_to)) return;
          seenFlowTo.add(stat_energy_to);
          nodes.push({
            id: stat_energy_to,
            section: currentSection,
            type: 'entity',
            name: '',
            subtract_entities: netFlows ? importEntities : undefined,
            color: getEnergySourceColor(grid.type),
          });
          sources.forEach(source => {
            if (!source.stat_energy_from) return;
            links.push({ source: source.stat_energy_from, target: stat_energy_to });
          });
        });
      }
    });

    // Handle battery charging
    const battery = sources.find(s => s.type === 'battery');
    if (battery && battery.stat_energy_from && battery.stat_energy_to) {
      nodes.push({
        id: battery.stat_energy_to,
        section: currentSection,
        type: 'entity',
        name: '',
        subtract_entities: netFlows ? [battery.stat_energy_from] : undefined,
        color: getEnergySourceColor(battery.type),
      });
      sources.forEach(source => {
        if (!source.stat_energy_from) return;
        links.push({ source: source.stat_energy_from, target: battery.stat_energy_to! });
      });
    }
    sections.push({}); // section 1 config

    currentSection++;

    const groupByFloor = this.config.autoconfig?.group_by_floor !== false;
    const groupByArea = this.config.autoconfig?.group_by_area !== false;

    if (groupByFloor || groupByArea) {
      const areasResult = await getEntitiesByArea(
        this.hass,
        devicesWithoutParent.map(d => d.id),
      );
      const areas = Object.values(areasResult)
        .sort((a, b) => (a.area.name === 'No area' ? 1 : b.area.name === 'No area' ? -1 : 0));

      const floors = await fetchFloorRegistry(this.hass);
      const orphanAreas = areas.filter(a => !a.area.floor_id);

      if (groupByFloor && orphanAreas.length !== areas.length) {
        // Add floor nodes
        floors.forEach(f => {
          nodes.push({
            id: f.floor_id,
            section: currentSection,
            type: 'remaining_child_state',
            name: f.name,
          });
          links.push({ source: 'total', target: f.floor_id });

          const floorAreas = areas.filter(a => a.area.floor_id === f.floor_id);
          if (groupByArea) {
            floorAreas.forEach(a => {
              links.push({ source: f.floor_id, target: a.area.area_id });
            });
          } else {
            floorAreas.forEach(a => {
              a.entities.forEach(entityId => {
                links.push({ source: f.floor_id, target: entityId });
              });
            });
          }
        });

        // Add orphan areas
        if (groupByArea) {
          orphanAreas.forEach(a => {
            links.push({ source: 'total', target: a.area.area_id });
          });
        } else {
          orphanAreas.forEach(a => {
            a.entities.forEach(entityId => {
              links.push({ source: 'total', target: entityId });
            });
          });
        }

        sections.push({ sort_by: 'state' }); // floor section with sorting
        currentSection++;
      } else {
        areas.forEach(a => {
          links.push({ source: 'total', target: a.area.area_id });
        });
      }

      if (groupByArea) {
        areas.forEach(({ area, entities }) => {
          nodes.push({
            id: area.area_id,
            section: currentSection,
            type: 'remaining_child_state',
            name: area.name,
          });
          entities.forEach(entityId => {
            links.push({ source: area.area_id, target: entityId });
          });
        });
        sections.push({ sort_by: 'state', sort_group_by_parent: true }); // area section with sorting
        currentSection++;
      }
    } else {
      devicesWithoutParent.forEach(d => {
        links.push({ source: 'total', target: d.id });
      });
    }

    // Add device nodes
    const deviceSections = this.getDeviceSections(parentLinks, deviceNodes);
    deviceSections.forEach((section, i) => {
      if (section.length) {
        section.forEach(d => {
          nodes.push({
            id: d.id,
            section: currentSection,
            type: 'entity',
            name: d.name || '',
          });
          const children = deviceSections[i + 1]?.filter(c => c.parent === d.id);
          children?.forEach(c => {
            links.push({ source: d.id, target: c.id });
          });
        });
        sections.push({ sort_by: 'state', sort_group_by_parent: true }); // device section with sorting
        currentSection++;
      }
    });

    // Add unknown node
    const totalSection = nodes.find(n => n.id === 'total')?.section;
    if (totalSection !== undefined) {
      nodes.push({
        id: 'unknown',
        section: totalSection + 1,
        type: 'remaining_parent_state',
        name: 'Unknown',
      });
    }

    // setNormalizedConfig will convert sections (SectionConfig[]) to internal sections (Section[])
    this.setNormalizedConfig({ ...this.config, nodes, links, sections } as any);
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
