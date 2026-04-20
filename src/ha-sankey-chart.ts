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
  ENERGY_SOURCE_TYPES,
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
  // preview: true, // requires energy data
});

const ENERGY_DATA_TIMEOUT = 10000;

type DeviceNode = { id: string; name?: string; parent?: string; color?: string };

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
    const nodes: Config['nodes'] = [];
    const links: Config['links'] = [];
    const sections: SectionConfig[] = [];

    prefs.device_consumption.forEach((device, idx) => {
      const node = {
        id: device.stat_consumption,
        name: device.name,
        parent: device.included_in_stat,
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

      // Build a reverse lookup from device id -> area id so we can walk
      // devicesWithoutParent in prefs.device_consumption order and fill the
      // floor/area structure in the order we actually encounter devices.
      const areaByDeviceId: Record<string, string> = {};
      Object.values(areasResult).forEach(({ area, entities }) => {
        entities.forEach(entityId => {
          areaByDeviceId[entityId] = area.area_id;
        });
      });

      // floorsMap: insertion-ordered areas per floor, mirroring HA's
      // _groupByFloorAndArea. 'no_floor' is seeded with 'no_area' so the
      // fallback path produces a stable ordering even without real floors.
      const floorsMap: Record<string, { areas: string[] }> = {
        no_floor: { areas: ['no_area'] },
      };
      devicesWithoutParent.forEach(d => {
        const areaId = areaByDeviceId[d.id] ?? 'no_area';
        if (areaId === 'no_area') return;
        const floorId = this.hass.areas[areaId]?.floor_id ?? null;
        if (floorId) {
          if (!floorsMap[floorId]) floorsMap[floorId] = { areas: [] };
          if (!floorsMap[floorId].areas.includes(areaId)) {
            floorsMap[floorId].areas.push(areaId);
          }
        } else if (!floorsMap.no_floor.areas.includes(areaId)) {
          // Match HA: unshift no-floor areas so they land at the top of the
          // no_floor bucket in reverse-encounter order.
          floorsMap.no_floor.areas.unshift(areaId);
        }
      });

      const floorRegistry = await fetchFloorRegistry(this.hass);
      const floorsById: Record<string, FloorRegistryEntry> = {};
      floorRegistry.forEach(f => {
        floorsById[f.floor_id] = f;
      });

      // Sort floors by level DESC, like HA (hui-energy-sankey-card.ts:314-319).
      // 'no_floor' has no registry entry, so it naturally sorts to the bottom.
      const sortedFloorIds = Object.keys(floorsMap).sort(
        (a, b) => (floorsById[b]?.level ?? -Infinity) - (floorsById[a]?.level ?? -Infinity),
      );

      const hasAnyRealFloor = sortedFloorIds.some(
        id => id !== 'no_floor' && floorsMap[id].areas.length > 0,
      );

      // Link an area into its parent (floor or 'total'). If the area is
      // 'no_area' or grouping by area is disabled, bypass the intermediate
      // area node and link the entities straight to the parent — matching
      // HA's hui-energy-sankey-card, which never creates a "No area" node.
      const linkAreaOrEntities = (parentId: string, areaId: string) => {
        const a = areasResult[areaId];
        if (!a) return;
        if (areaId === 'no_area' || !groupByArea) {
          a.entities.forEach(entityId => {
            links.push({ source: parentId, target: entityId });
          });
        } else {
          links.push({ source: parentId, target: areaId });
        }
      };

      if (groupByFloor && hasAnyRealFloor) {
        sortedFloorIds.forEach(floorId => {
          if (floorId === 'no_floor') {
            floorsMap.no_floor.areas.forEach(areaId => {
              linkAreaOrEntities('total', areaId);
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
          links.push({ source: 'total', target: floorId });

          floorsMap[floorId].areas.forEach(areaId => {
            linkAreaOrEntities(floorId, areaId);
          });
        });

        sections.push({ sort_by: 'none' });
        currentSection++;
      } else if (!groupByArea) {
        // No floor column and no area column — link every device directly
        // to total in device_consumption order.
        devicesWithoutParent.forEach(d => {
          links.push({ source: 'total', target: d.id });
        });
      } else {
        // Orphan-only path: no real floors, but we are still grouping by area.
        // Walk areas in the same insertion order we built (no_floor first,
        // then any leftovers from areasResult that weren't captured).
        const emitted = new Set<string>();
        floorsMap.no_floor.areas.forEach(areaId => {
          if (!areasResult[areaId]) return;
          linkAreaOrEntities('total', areaId);
          emitted.add(areaId);
        });
        Object.keys(areasResult).forEach(areaId => {
          if (emitted.has(areaId)) return;
          linkAreaOrEntities('total', areaId);
        });
      }

      if (groupByArea) {
        // Emit area nodes grouped by their floor (sorted order). 'no_area' is
        // never emitted as a node — its entities are wired directly to the
        // parent (floor or total) by linkAreaOrEntities above.
        const areaOrder: string[] = [];
        sortedFloorIds.forEach(fId => {
          floorsMap[fId].areas.forEach(aId => {
            if (aId === 'no_area') return;
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
        links.push({ source: 'total', target: d.id });
      });
    }

    // Add device nodes. Parent→child links were already emitted above while
    // iterating prefs.device_consumption, so this loop only has to place each
    // device into the right section; autoRouteCrossGapLinks takes care of any
    // cross-gap routing.
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

    // Insert passthrough nodes for any link whose source/target span more
    // than one section. normalizeConfig() normally handles this, but
    // setNormalizedConfig bypasses it — so do it here.
    autoRouteCrossGapLinks(nodes, links);

    // setNormalizedConfig will convert sections (SectionConfig[]) to internal sections (Section[])
    this.setNormalizedConfig({ ...this.config, nodes, links, sections } as any);
  }

  // Organize device nodes into hierarchical sections based on parent-child
   // relationships. Top-level parents (have children, no parent themselves)
   // land in the leftmost device column regardless of how deep their subtree
   // is; middle-layer parents are pushed one column to the right, and so on.
   // Mirrors HA's hui-energy-sankey-card._getDeviceSections so shallow and
   // deep hierarchies stay aligned.
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
