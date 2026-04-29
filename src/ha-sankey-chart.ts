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
  EnergyCollection,
  EnergyData,
  ENERGY_SOURCE_TYPES,
  EnergySource,
  getEnergyDataCollection,
  getEnergySourceColor,
  getStatistics,
  getEnergyPreferences,
  EnergyPreferences,
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
      this.autoconfig();
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
    const netFlows = this.config.autoconfig?.net_flows !== false;
    const mode = this.config.autoconfig?.mode || 'energy';

    const ext = {
      energy: {
        getSourceEntityId: (s: any, f: any) => f.stat_energy_from,
        getDeviceEntityId: (d: any) => d.stat_consumption,
        getSourceSubtract: (s: any) => s.stat_energy_to ? [s.stat_energy_to] : s.flow_to?.map((e: any) => e.stat_energy_to).filter(Boolean),
        getGridExportEntities: (grid: any) => grid.flow_to?.map((e: any) => e.stat_energy_to).filter(Boolean) ?? (grid.stat_energy_to ? [grid.stat_energy_to] : []),
        getGridImportEntities: (grid: any) => grid.flow_from?.map((e: any) => e.stat_energy_from).filter(Boolean) ?? (grid.stat_energy_from ? [grid.stat_energy_from] : []),
        getBatteryToEntityId: (battery: any) => battery.stat_energy_to,
      },
      power: {
        getSourceEntityId: (s: any, f: any) => f.stat_rate || s.power_config?.stat_rate_from || f.stat_energy_from || (f === s && s.power_config ? s.power_config.stat_rate_to : undefined),
        getDeviceEntityId: (d: any) => d.stat_rate || d.stat_consumption,
        getSourceSubtract: (s: any) => {
          const statPowerTo = s.stat_rate || s.power_config?.stat_rate_to;
          return statPowerTo ? [statPowerTo] : (s.stat_energy_to ? [s.stat_energy_to] : s.flow_to?.map((e: any) => e.stat_rate || e.stat_energy_to).filter(Boolean));
        },
        getGridExportEntities: (grid: any) => (grid.power_config?.stat_rate_to ? [grid.power_config.stat_rate_to] : undefined) ?? grid.flow_to?.map((e: any) => (e.stat_rate || e.stat_energy_to)).filter(Boolean) ?? (grid.stat_energy_to ? [grid.stat_energy_to] : []),
        getGridImportEntities: (grid: any) => (grid.power_config?.stat_rate_from ? [grid.power_config.stat_rate_from] : undefined) ?? grid.flow_from?.map((e: any) => (e.stat_rate || e.stat_energy_from)).filter(Boolean) ?? (grid.stat_energy_from ? [grid.stat_energy_from] : []),
        getBatteryToEntityId: (battery: any) => battery.stat_rate || battery.power_config?.stat_rate_to || battery.stat_energy_to,
      }
    }[mode];

    const sources: (EnergySource & { _autoconfig_id: string; _real_entity_id: string })[] = [];
    for (const s of (prefs?.energy_sources || [])) {
      if (!ENERGY_SOURCE_TYPES.includes(s.type)) {
        continue;
      }
      for (const f of [s, ...(s.flow_from || [])]) {
        const entityId = ext.getSourceEntityId(s, f);

        if (entityId) {
          if (!this.hass.states[entityId]) {
            console.warn('Ignoring missing entity ' + entityId);
          } else {
            // Suffix source ID if it might conflict with child nodes later
            const sourceId = (s.stat_energy_to || s.power_config?.stat_rate_to) === entityId
              ? `source_${entityId}`
              : entityId;
            sources.push({ ...s, ...f, _autoconfig_id: sourceId, _real_entity_id: entityId });
          }
        }
      }
    }
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

    const deviceEntityIdMap: Record<string, string> = {};
    for (const device of prefs.device_consumption) {
      const entityId = ext.getDeviceEntityId(device);
      if (entityId) {
        deviceEntityIdMap[device.stat_consumption] = entityId;
      }
    }

    for (let idx = 0; idx < prefs.device_consumption.length; idx++) {
      const device = prefs.device_consumption[idx];
      const entityId = ext.getDeviceEntityId(device);
      let parent = device.included_in_stat;
      if (parent && deviceEntityIdMap[parent]) {
        parent = deviceEntityIdMap[parent];
      }
      const node = {
        id: entityId,
        name: device.name,
        parent: parent,
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
    }
    const devicesWithoutParent = deviceNodes.filter(node => !parentLinks[node.id]);

    let currentSection = 0;

    sources.forEach(source => {
      const subtract = (source.type === 'grid' || source.type === 'battery') && !netFlows
        ? undefined
        : ext.getSourceSubtract(source) as string[] | undefined;
      nodes.push({
        id: source._autoconfig_id,
        entity_id: source._real_entity_id,
        section: currentSection,
        type: 'entity',
        name: '',
        subtract_entities: subtract?.filter(id => id !== source._autoconfig_id && id !== source._real_entity_id),
        color: getEnergySourceColor(source.type),
      });
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

    const gridSources = sources.filter(s => s.type === 'grid');
    const seenFlowTo = new Set<string>();
    gridSources.forEach(grid => {
      const exportEntities = ext.getGridExportEntities(grid);
      const importEntities = ext.getGridImportEntities(grid);
      if (exportEntities.length) {
        exportEntities.forEach(stat_to => {
          if (!stat_to || seenFlowTo.has(stat_to)) return;
          seenFlowTo.add(stat_to);
          nodes.push({
            id: stat_to,
            section: currentSection,
            type: 'entity',
            name: '',
            subtract_entities: netFlows ? importEntities.filter(id => id !== stat_to) : undefined,
            color: getEnergySourceColor(grid.type),
          });
          // These are children of the source, same section as TOTAL_NODE_ID
          sources.forEach(source => {
            if (source._autoconfig_id !== stat_to) {
              links.push({ source: source._autoconfig_id, target: stat_to });
            }
          });
        });
      }
    });

    const battery = sources.find(s => s.type === 'battery');
    if (battery) {
      const battery_to = ext.getBatteryToEntityId(battery);
      if (battery_to) {
        nodes.push({
          id: battery_to,
          section: currentSection,
          type: 'entity',
          name: '',
          subtract_entities: netFlows
            ? sources.filter(s => s._autoconfig_id !== battery_to && s._real_entity_id !== battery_to).map(s => s._autoconfig_id)
            : undefined,
          color: getEnergySourceColor(battery.type),
        });
        sources.forEach(source => {
          if (source._autoconfig_id !== battery_to) {
            links.push({ source: source._autoconfig_id, target: battery_to });
          }
        });
      }
    }

    // Now link sources to Total Consumption
    sources.forEach(source => {
      if (source._autoconfig_id !== TOTAL_NODE_ID) {
        links.push({ source: source._autoconfig_id, target: TOTAL_NODE_ID });
      }
    });

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
      const devicesByArea: Record<string, string[]> = {};
      devicesWithoutParent.forEach(d => {
        const areaId = areaByDeviceId[d.id] ?? NO_AREA;
        if (!devicesByArea[areaId]) devicesByArea[areaId] = [];
        devicesByArea[areaId].push(d.id);
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
      const linkAreaOrEntities = (parentId: string, areaId: string, section: number) => {
        let a = areasResult[areaId];
        if (areaId === NO_AREA) {
          a = { area: { area_id: NO_AREA, name: 'Other Devices' } as any, entities: devicesByArea[NO_AREA] || [] };
        }
        if (!a || !a.entities.length) return;
        if (areaId === NO_AREA) {
          // No area: wire entities directly to the parent (floor or total).
          // autoRouteCrossGapLinks will insert passthrough nodes if needed.
          a.entities.forEach(entityId => {
            links.push({ source: parentId, target: entityId });
          });
        } else if (!groupByArea) {
          a.entities.forEach(entityId => {
            links.push({ source: parentId, target: entityId });
          });
        } else {
          nodes.push({
            id: areaId,
            section: section,
            type: 'remaining_child_state',
            name: a.area.name,
          });
          links.push({ source: parentId, target: areaId });
          a.entities.forEach(entityId => {
            links.push({ source: areaId, target: entityId });
          });
          return true; // signal that an area node was emitted
        }
        return false;
      };

      if (groupByFloor && hasAnyRealFloor) {
        // Section: Floors
        sortedFloorIds.forEach(floorId => {
          if (floorId === NO_FLOOR) return;
          const floor = floorsById[floorId];
          nodes.push({
            id: floorId,
            section: currentSection,
            type: 'remaining_child_state',
            name: floor?.name ?? floorId,
          });
          links.push({ source: TOTAL_NODE_ID, target: floorId });
        });
        sections.push({ sort_by: 'none', sort_group_by_parent: true });
        currentSection++;

        // Section: Areas
        sortedFloorIds.forEach(floorId => {
          const parentId = floorId === NO_FLOOR ? TOTAL_NODE_ID : floorId;
          floorsMap[floorId].areas.forEach(areaId => {
            linkAreaOrEntities(parentId, areaId, currentSection);
          });
        });
        sections.push({ sort_by: 'none', sort_group_by_parent: true });
        currentSection++;
      } else if (groupByArea) {
        // Section: Areas (no floors)
        let anyArea = false;
        Object.keys(devicesByArea).forEach(areaId => {
          if (linkAreaOrEntities(TOTAL_NODE_ID, areaId, currentSection)) anyArea = true;
        });
        if (anyArea) {
          sections.push({ sort_by: 'none', sort_group_by_parent: true });
          currentSection++;
        }
      } else {
        // No grouping
        devicesWithoutParent.forEach(d => {
          links.push({ source: TOTAL_NODE_ID, target: d.id });
        });
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

    // Add the "Untracked" usage box as a sibling of floors
    const totalSection = nodes.find(n => n.id === TOTAL_NODE_ID)?.section;
    if (totalSection !== undefined) {
      nodes.push({
        id: UNKNOWN_NODE_ID,
        section: totalSection + 1,
        type: 'remaining_parent_state',
        name: 'Untracked',
      });
      links.push({ source: TOTAL_NODE_ID, target: UNKNOWN_NODE_ID });
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
