/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';

import type { Config, SankeyChartConfig, SectionConfig } from './types';
import { version } from '../package.json';
import { localize } from './localize/localize';
import { autoRouteCrossGapLinks, convertNodesToSections, normalizeConfig, renderError } from './utils';
import { SubscribeMixin } from './subscribe-mixin';
import './chart';
import './print-config';
import { HassEntities } from 'home-assistant-js-websocket';
import {
  Conversions,
  DeviceConsumptionEnergyPreference,
  EnergyCollection,
  EnergyData,
  EnergySource,
  getEnergyDataCollection,
  getEnergySourceColor,
  getStatistics,
  getEnergyPreferences,
  EnergyPreferences,
  isRateMode,
  sourceTypesForMode,
} from './energy';
import { until } from 'lit/directives/until';
import { fetchFloorRegistry, FloorRegistryEntry, getEntitiesByArea, HomeAssistantReal } from './hass';
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
});

const ENERGY_DATA_TIMEOUT = 10000;

// Sentinel node IDs used by autoconfig. They're real keys in the rendered
// graph (matched by id in links and tests), so the values must stay stable.
const TOTAL_NODE_ID = 'total';
const UNKNOWN_NODE_ID = 'unknown';
const NO_FLOOR = 'no_floor';
const NO_AREA = 'no_area';

type DeviceNode = { id: string; name?: string; parent?: string; color?: string };

@customElement('sankey-chart')
class SankeyChart extends SubscribeMixin(LitElement) {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
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
  @state() private error?: unknown;
  @state() private forceUpdateTs?: number;

  private async _fetchStats(range: Pick<EnergyData, 'start' | 'end'>): Promise<void> {
    if (!this.entityIds.length) return;
    const conversions: Conversions = {
      convert_units_to: this.config.convert_units_to!,
      co2_intensity_entity: this.config.co2_intensity_entity!,
      gas_co2_intensity: this.config.gas_co2_intensity!,
      electricity_price: this.config.electricity_price,
      gas_price: this.config.gas_price,
    };
    const stats = await getStatistics(this.hass, range, this.entityIds, conversions);
    const states: HassEntities = {};
    Object.keys(stats).forEach(id => {
      if (this.hass.states[id]) {
        states[id] = { ...this.hass.states[id], state: String(stats[id]) };
      }
    });
    this.states = states;
  }

  public hassSubscribe() {
    const isAutoconfig = this.config.autoconfig || typeof this.config.autoconfig === 'object';
    if (this.config.energy_date_selection) {
      const start = Date.now();
      const getEnergyDataCollectionPoll = (
        resolve: (value: EnergyCollection | PromiseLike<EnergyCollection>) => void,
        reject: (reason?: any) => void,
      ) => {
        const energyCollection = getEnergyDataCollection(this.hass, this.config.energy_collection_key);
        if (energyCollection) {
          resolve(energyCollection);
        } else if (Date.now() - start > ENERGY_DATA_TIMEOUT) {
          console.debug(getEnergyDataCollection(this.hass, this.config.energy_collection_key));
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
          console.debug(getEnergyDataCollection(this.hass, this.config.energy_collection_key));
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
            await this._fetchStats(data);
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
            await this._fetchStats({ start, end });
          } catch (err: any) {
            this.error = err;
          }
          this.forceUpdateTs = Date.now();
        }
      };
      getTimePeriod();
      const interval = setInterval(getTimePeriod, this.config.throttle || 1000);
      return [() => clearInterval(interval)];
    } else if (isAutoconfig && !this.config.sections.length) {
      // Rate-mode autoconfig (mode = 'power' | 'water_flow'): no date selection
      // and no time_period_from. Build the graph once from energy preferences
      // and let live hass.states drive subsequent renders.
      this.autoconfig().catch((err: any) => {
        this.error = new Error(err?.message || err);
      });
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
    this.config.nodes.forEach(node => {
      if (node.type === 'entity') {
        this.entityIds.push(node.id);
        node.add_entities?.forEach(id => this.entityIds.push(id));
        node.subtract_entities?.forEach(id => this.entityIds.push(id));
      }
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
    const mode = this.config.autoconfig?.mode || 'energy';
    const rateMode = isRateMode(mode);
    const validTypes = sourceTypesForMode(mode);
    const netFlows = this.config.autoconfig?.net_flows !== false;

    const fromEntity = (s: EnergySource): string | undefined =>
      rateMode ? s.stat_rate : s.stat_energy_from;
    const toEntity = (s: EnergySource): string | undefined =>
      mode === 'energy' ? s.stat_energy_to : undefined;
    const deviceEntity = (d: DeviceConsumptionEnergyPreference): string | undefined =>
      rateMode ? d.stat_rate : d.stat_consumption;
    const deviceList: DeviceConsumptionEnergyPreference[] =
      mode === 'water' || mode === 'water_flow'
        ? prefs.device_consumption_water || []
        : prefs.device_consumption || [];

    const sources: EnergySource[] = [];
    (prefs?.energy_sources || []).forEach(s => {
      if (!validTypes.includes(s.type)) return;
      const id = fromEntity(s);
      if (!id || !this.hass.states[id]) return;
      sources.push(s);
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
    const nodes: Config['nodes'] = [];
    const links: Config['links'] = [];
    const sections: SectionConfig[] = [];

    // `included_in_stat` always references a parent device's `stat_consumption`.
    // In rate modes the parent's node id is its `stat_rate`, so we need a
    // stat_consumption → resolved-node-id map to rewrite child.parent into
    // something that actually exists in the graph. In energy/water modes the
    // map is identity. Parents whose entity is missing for the current mode
    // are absent from the map, and their children fall back to no-parent.
    const consumptionToNodeId: Record<string, string> = {};
    deviceList.forEach(device => {
      const id = deviceEntity(device);
      if (id) consumptionToNodeId[device.stat_consumption] = id;
    });

    deviceList.forEach((device, idx) => {
      const id = deviceEntity(device);
      if (!id) return;
      const parent = device.included_in_stat
        ? consumptionToNodeId[device.included_in_stat]
        : undefined;
      const node = {
        id,
        name: device.name,
        parent,
        color: `var(--color-${(idx % 54) + 1})`,
      };
      if (node.parent) {
        parentLinks[node.id] = node.parent;
        // Emit the parent→child link upfront. getDeviceSections may place the
        // parent and child more than one section apart (e.g. a shallow 2-level
        // hierarchy sharing a device section with the leaves of a deeper
        // hierarchy), and autoRouteCrossGapLinks handles the column-span.
        links.push({ source: node.parent, target: node.id });
      }
      deviceNodes.push(node);
    });
    const devicesWithoutParent = deviceNodes.filter(node => !parentLinks[node.id]);

    let currentSection = 0;

    sources.forEach(source => {
      const id = fromEntity(source)!;
      const exportId = toEntity(source);
      const subtract = (source.type === 'grid' || source.type === 'battery') && !netFlows
        ? undefined
        : exportId
          ? [exportId]
          : undefined;
      nodes.push({
        id,
        section: currentSection,
        type: 'entity',
        name: '',
        subtract_entities: subtract,
        color: getEnergySourceColor(source.type),
      });
      links.push({ source: id, target: TOTAL_NODE_ID });
    });
    sections.push({});

    currentSection++;

    nodes.push({
      id: TOTAL_NODE_ID,
      section: currentSection,
      type: sources.length ? 'remaining_parent_state' : 'remaining_child_state',
      name: 'Total Consumption',
      children_sum: {
        should_be: 'equal_or_less',
        reconcile_to: 'max',
      },
    });
    links.push({ source: TOTAL_NODE_ID, target: UNKNOWN_NODE_ID });

    // Grid export and battery charge nodes only exist in energy mode. In rate
    // and water modes the source is a single signed/unidirectional sensor, so
    // there is no separate to-side node.
    if (mode === 'energy') {
      const gridSources = sources.filter(s => s.type === 'grid');
      const seenFlowTo = new Set<string>();
      gridSources.forEach(grid => {
        const exportEntity = grid.stat_energy_to;
        const importEntity = grid.stat_energy_from;
        if (!exportEntity || seenFlowTo.has(exportEntity)) return;
        seenFlowTo.add(exportEntity);
        nodes.push({
          id: exportEntity,
          section: currentSection,
          type: 'entity',
          name: '',
          subtract_entities: netFlows && importEntity ? [importEntity] : undefined,
          color: getEnergySourceColor(grid.type),
        });
        sources.forEach(source => {
          const sId = fromEntity(source);
          if (!sId) return;
          links.push({ source: sId, target: exportEntity });
        });
      });

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
          const sId = fromEntity(source);
          if (!sId) return;
          links.push({ source: sId, target: battery.stat_energy_to! });
        });
      }
    }
    sections.push({});

    currentSection++;

    const groupByFloor = this.config.autoconfig?.group_by_floor !== false;
    const groupByArea = this.config.autoconfig?.group_by_area !== false;

    if (groupByFloor || groupByArea) {
      const [areasResult, floorRegistry] = await Promise.all([
        getEntitiesByArea(this.hass, devicesWithoutParent.map(d => d.id)),
        fetchFloorRegistry(this.hass),
      ]);

      const areaByDeviceId: Record<string, string> = {};
      Object.values(areasResult).forEach(({ area, entities }) => {
        entities.forEach(entityId => {
          areaByDeviceId[entityId] = area.area_id;
        });
      });

      // floorsMap mirrors HA's _groupByFloorAndArea. 'no_floor' is seeded
      // with 'no_area' so the fallback path has stable ordering even without
      // real floors.
      const floorsMap: Record<string, { areas: string[] }> = {
        [NO_FLOOR]: { areas: [NO_AREA] },
      };
      devicesWithoutParent.forEach(d => {
        const areaId = areaByDeviceId[d.id] ?? NO_AREA;
        if (areaId === NO_AREA) return;
        const floorId = this.hass.areas[areaId]?.floor_id ?? null;
        if (floorId) {
          if (!floorsMap[floorId]) floorsMap[floorId] = { areas: [] };
          if (!floorsMap[floorId].areas.includes(areaId)) {
            floorsMap[floorId].areas.push(areaId);
          }
        } else if (!floorsMap[NO_FLOOR].areas.includes(areaId)) {
          // Match HA: unshift so no-floor areas land at the top of the
          // no_floor bucket in reverse-encounter order.
          floorsMap[NO_FLOOR].areas.unshift(areaId);
        }
      });

      const floorsById: Record<string, FloorRegistryEntry> = {};
      floorRegistry.forEach(f => {
        floorsById[f.floor_id] = f;
      });

      // Sort by level DESC like HA (hui-energy-sankey-card.ts:314-319).
      // NO_FLOOR has no registry entry so it naturally sorts to the bottom.
      const sortedFloorIds = Object.keys(floorsMap).sort(
        (a, b) => (floorsById[b]?.level ?? -Infinity) - (floorsById[a]?.level ?? -Infinity),
      );

      const hasAnyRealFloor = sortedFloorIds.some(
        id => id !== NO_FLOOR && floorsMap[id].areas.length > 0,
      );

      // HA never creates a "No area" node: no_area entities are wired
      // straight to the parent (floor or total).
      const linkAreaOrEntities = (parentId: string, areaId: string) => {
        const a = areasResult[areaId];
        if (!a) return;
        if (areaId === NO_AREA || !groupByArea) {
          a.entities.forEach(entityId => {
            links.push({ source: parentId, target: entityId });
          });
        } else {
          links.push({ source: parentId, target: areaId });
        }
      };

      if (groupByFloor && hasAnyRealFloor) {
        sortedFloorIds.forEach(floorId => {
          if (floorId === NO_FLOOR) {
            floorsMap[NO_FLOOR].areas.forEach(areaId => {
              linkAreaOrEntities(TOTAL_NODE_ID, areaId);
            });
            return;
          }

          const floor = floorsById[floorId];
          nodes.push({
            id: floorId,
            section: currentSection,
            type: 'remaining_child_state',
            name: floor?.name ?? floorId,
          });
          links.push({ source: TOTAL_NODE_ID, target: floorId });

          floorsMap[floorId].areas.forEach(areaId => {
            linkAreaOrEntities(floorId, areaId);
          });
        });

        sections.push({ sort_by: 'none' });
        currentSection++;
      } else if (!groupByArea) {
        devicesWithoutParent.forEach(d => {
          links.push({ source: TOTAL_NODE_ID, target: d.id });
        });
      } else {
        // Orphan-only path: no real floors, still grouping by area. Walk
        // areas in the insertion order we built (no_floor first, then any
        // leftovers from areasResult).
        const emitted = new Set<string>();
        floorsMap[NO_FLOOR].areas.forEach(areaId => {
          if (!areasResult[areaId]) return;
          linkAreaOrEntities(TOTAL_NODE_ID, areaId);
          emitted.add(areaId);
        });
        Object.keys(areasResult).forEach(areaId => {
          if (emitted.has(areaId)) return;
          linkAreaOrEntities(TOTAL_NODE_ID, areaId);
        });
      }

      if (groupByArea) {
        const areaOrder: string[] = [];
        sortedFloorIds.forEach(fId => {
          floorsMap[fId].areas.forEach(aId => {
            if (aId === NO_AREA) return;
            if (!areaOrder.includes(aId) && areasResult[aId]) {
              areaOrder.push(aId);
            }
          });
        });

        if (areaOrder.length) {
          areaOrder.forEach(areaId => {
            const a = areasResult[areaId];
            if (!a) return;
            nodes.push({
              id: a.area.area_id,
              section: currentSection,
              type: 'remaining_child_state',
              name: a.area.name,
            });
            a.entities.forEach(entityId => {
              links.push({ source: a.area.area_id, target: entityId });
            });
          });
          sections.push({ sort_by: 'none', sort_group_by_parent: true });
          currentSection++;
        }
      }
    } else {
      devicesWithoutParent.forEach(d => {
        links.push({ source: TOTAL_NODE_ID, target: d.id });
      });
    }

    // Parent→child links were emitted above while iterating device_consumption,
    // so this loop only has to place each device into the right section;
    // autoRouteCrossGapLinks takes care of any cross-gap routing.
    const deviceSections = this.getDeviceSections(parentLinks, deviceNodes);
    deviceSections.forEach(section => {
      if (section.length) {
        section.forEach(d => {
          nodes.push({
            id: d.id,
            section: currentSection,
            type: 'entity',
            name: d.name || '',
            color: d.color,
          });
        });
        sections.push({ sort_by: 'state', sort_group_by_parent: true });
        currentSection++;
      }
    });

    const totalSection = nodes.find(n => n.id === TOTAL_NODE_ID)?.section;
    if (totalSection !== undefined) {
      nodes.push({
        id: UNKNOWN_NODE_ID,
        section: totalSection + 1,
        type: 'remaining_parent_state',
        name: 'Unknown',
      });
    }

    // normalizeConfig() normally calls this, but setNormalizedConfig bypasses
    // it — do it here so cross-gap links get their passthrough chain.
    autoRouteCrossGapLinks(nodes, links);

    this.setNormalizedConfig({ ...this.config, nodes, links, sections } as any);
  }

  // Mirrors HA's hui-energy-sankey-card._getDeviceSections: top-level parents
  // land in the leftmost device column regardless of subtree depth, so shallow
  // and deep hierarchies stay aligned.
  private getDeviceSections(parentLinks: Record<string, string>, deviceNodes: DeviceNode[]): DeviceNode[][] {
    const parentSection: DeviceNode[] = [];
    const childSection: DeviceNode[] = [];
    const parentIds = Object.values(parentLinks);

    deviceNodes.forEach(deviceNode => {
      const isChild = deviceNode.id in parentLinks;
      const isParent = parentIds.includes(deviceNode.id);
      if (isParent && !isChild) {
        parentSection.push(deviceNode);
      } else {
        childSection.push(deviceNode);
      }
    });

    // Drop links whose parent is already placed in this layer; the remaining
    // links feed the next recursion on the child section.
    const remainingLinks: typeof parentLinks = {};
    Object.entries(parentLinks).forEach(([child, parent]) => {
      if (!parentSection.some(node => node.id === parent)) {
        remainingLinks[child] = parent;
      }
    });

    if (parentSection.length > 0) {
      return [parentSection, ...this.getDeviceSections(remainingLinks, childSection)];
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
