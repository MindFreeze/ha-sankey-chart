import {
  createThing,
  formatNumber,
  FrontendLocaleData,
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
} from 'custom-card-helpers';
import { html, TemplateResult } from 'lit';
import { UNIT_PREFIXES, FT3_PER_M3 } from './const';
import {
  Box,
  Config,
  Connection,
  ConnectionState,
  DEFAULT_CONFIG,
  SankeyChartConfig,
  Section,
  SectionConfig,
  Node,
  Link,
  NodeInternal,
} from './types';
import {
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
} from 'date-fns';
import { migrateV3Config } from './migrate';
import type { V3Config, V3SectionConfig } from './migrate';

export function generateRandomRGBColor(): string {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r}, ${g}, ${b})`;
}

export function cloneObj<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function formatState(state: number, round: number, locale: FrontendLocaleData, monetary_unit?: string): string {
  let rounded: string;
  let decimals = round;
  do {
    // round to first significant digit
    rounded = state.toFixed(decimals++);
  } while (/^[0\.,]*$/.test(rounded) && decimals < 20);

  if (!monetary_unit) {
    return formatNumber(parseFloat(rounded), locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals - 1,
    });
  } else {
    return formatNumber(parseFloat(rounded), locale, {
      style: 'currency',
      currency: monetary_unit,
      minimumFractionDigits: decimals - 1,
      maximumFractionDigits: decimals - 1,
    });
  }
}

export function normalizeStateValue(
  unit_prefix: '' | 'auto' | keyof typeof UNIT_PREFIXES,
  state: number,
  unit_of_measurement?: string,
  enableAutoPrefix = false,
): { state: number; unit_of_measurement?: string } {
  const validState = Math.max(0, state) || 0; // the 0 check is for NaN
  if (!unit_of_measurement || unit_of_measurement == 'monetary') {
    return { state: validState, unit_of_measurement };
  }
  const prefix = getUOMPrefix(unit_of_measurement);
  const currentFactor = UNIT_PREFIXES[prefix] || 1;

  if (unit_prefix === 'auto') {
    if (enableAutoPrefix) {
      // Find the most appropriate prefix based on the state value
      const magnitude = Math.abs(state * currentFactor);

      // Choose prefix based on the magnitude
      if (magnitude < 1) {
        unit_prefix = 'm';
      } else if (magnitude >= 1000 && magnitude < 1000000) {
        unit_prefix = 'k';
      } else if (magnitude >= 1000000 && magnitude < 1000000000) {
        unit_prefix = 'M';
      } else if (magnitude >= 1000000000 && magnitude < 1000000000000) {
        unit_prefix = 'G';
      } else if (magnitude >= 1000000000000) {
        unit_prefix = 'T';
      } else {
        // For values between 1-999, use no prefix
        unit_prefix = '';
      }
    } else {
      // ignore auto prefix for now. calculate it at render
      unit_prefix = '';
    }
  }

  const targetFactor = UNIT_PREFIXES[unit_prefix] || 1;
  if (currentFactor === targetFactor) {
    return { state: validState, unit_of_measurement };
  }
  return {
    state: (validState * currentFactor) / targetFactor,
    unit_of_measurement: prefix ? unit_of_measurement.replace(prefix, unit_prefix) : unit_prefix + unit_of_measurement,
  };
}

function getUOMPrefix(unit_of_measurement: string): string {
  const cleanUnit = unit_of_measurement.replace('²', '').replace('³', '');
  return (cleanUnit.length > 1 && Object.keys(UNIT_PREFIXES).find(p => unit_of_measurement!.indexOf(p) === 0)) || '';
}

export function getEntityId(entity: string | Node | Record<string, unknown>): string {
  return typeof entity === 'string' ? entity : ((entity.id || (entity as Record<string, unknown>).entity_id) as string);
}

export function getChildConnections(
  parent: Box,
  children: Box[],
  allConnections: ConnectionState[],
  connectionsByParent: Map<NodeInternal, ConnectionState[]>,
): Connection[] {
  // @NOTE don't take prevParentState from connection because it is different
  let prevParentState = 0;
  let state = 0;
  const childConnections = connectionsByParent.get(parent.config);
  return children.map(child => {
    let connections = childConnections?.filter(c => c.child.id === child.id);
    if (!connections?.length) {
      connections = allConnections.filter(
        c => c.passthroughs.includes(child.config) || c.passthroughs.includes(parent.config),
      );
      if (!connections.length) {
        throw new Error(`Missing connection: ${parent.id} - ${child.id}`);
      }
    }
    state = connections.reduce((sum, c) => sum + c.state, 0);
    if (state <= 0) {
      // only continue if this connection will be rendered
      return { state } as Connection;
    }
    const startY = (prevParentState / parent.state) * parent.size + parent.top;
    prevParentState += state;
    const startSize = Math.max((state / parent.state) * parent.size, 0);
    const endY = (child.connectedParentState / child.state) * child.size + child.top;
    const endSize = Math.max((state / child.state) * child.size, 0);

    child.connectedParentState += state;

    return {
      startY,
      startSize,
      startColor: parent.color,
      endY,
      endSize,
      endColor: child.color,
      state,
      highlighted: connections.some(c => c.highlighted),
    };
  });
}

export function convertNodesToSections(nodes: Node[], links: Link[], sectionConfigs?: SectionConfig[]): Section[] {
  // Group nodes by section index
  const nodesBySection = new Map<number, NodeInternal[]>();

  nodes.forEach(node => {
    const nodeInternal: NodeInternal = {
      ...node,
      children: [],
    };

    if (!nodesBySection.has(node.section || 0)) {
      nodesBySection.set(node.section || 0, []);
    }
    nodesBySection.get(node.section || 0)!.push(nodeInternal);
  });

  // Build children arrays from links
  links.forEach(link => {
    const sourceNode = nodes.find(n => n.id === link.source);
    if (sourceNode) {
      const internalNode = nodesBySection.get(sourceNode.section || 0)?.find(n => n.id === link.source);
      if (internalNode) {
        if (link.value) {
          // Connection has a specific entity
          internalNode.children.push({
            entity_id: link.target,
            connection_entity_id: link.value,
          });
        } else {
          // Simple connection
          internalNode.children.push(link.target);
        }
      }
    }
  });

  // Convert to sections, sorted by section index
  // Include both sections with nodes AND empty sections defined in sectionConfigs
  const nodeIndices = Array.from(nodesBySection.keys());
  const configIndices = sectionConfigs ? sectionConfigs.map((_, i) => i) : [];
  const allIndices = new Set([...nodeIndices, ...configIndices]);
  const sectionIndices = Array.from(allIndices).sort((a, b) => a - b);

  const sections: Section[] = sectionIndices.map(sectionIndex => {
    // Get section config if available, otherwise use empty config
    const sectionConfig = sectionConfigs?.[sectionIndex] || {};

    return {
      entities: nodesBySection.get(sectionIndex) || [],
      sort_by: sectionConfig.sort_by,
      sort_dir: sectionConfig.sort_dir,
      sort_group_by_parent: sectionConfig.sort_group_by_parent,
      min_width: sectionConfig.min_width,
    };
  });

  createPassthroughs(sections);
  return sections;
}

export function normalizeConfig(conf: SankeyChartConfig | V3Config, isMetric?: boolean): Config {
  // V3 detection: check if sections have entities
  let config: SankeyChartConfig = conf.sections?.some(section => (section as V3SectionConfig).entities)
    ? migrateV3Config(conf as V3Config)
    : cloneObj(conf);

  const { autoconfig } = conf;
  if (autoconfig || typeof autoconfig === 'object') {
    config = {
      energy_date_selection: !config.time_period_from,
      unit_prefix: 'k',
      round: 1,
      ...config,
      nodes: config.nodes || [],
      links: config.links || [],
    };
  }

  const sections: Section[] = convertNodesToSections(config.nodes || [], config.links || [], config.sections);

  const default_co2_per_ft3 =
    55.0 + // gCO2e/ft3 tailpipe
    11.6; // gCO2e/ft3 supply chain, US average
  return {
    ...DEFAULT_CONFIG,
    gas_co2_intensity: isMetric ? default_co2_per_ft3 * FT3_PER_M3 : default_co2_per_ft3,
    ...config,
    min_state: config.min_state ? Math.abs(config.min_state) : 0,
    nodes: config.nodes || [],
    links: config.links || [],
    sections,
  };
}

export function createPassthroughs(sections: Section[]): void {
  sections.forEach((section: Section, sectionIndex: number) => {
    section.entities.forEach(entityConf => {
      // handle passthrough
      if (entityConf.children && entityConf.children.length) {
        entityConf.children.forEach(child => {
          for (let i = sectionIndex + 1; i < sections.length; i++) {
            const childConf = sections[i].entities.find(entity => getEntityId(entity) === getEntityId(child));
            if (childConf) {
              if (i > sectionIndex + 1) {
                for (let j = sectionIndex + 1; j < i; j++) {
                  sections[j].entities.push({
                    ...(typeof childConf === 'string' ? { id: childConf } : childConf),
                    type: 'passthrough',
                    children: [],
                    section: j,
                  });
                }
              }
              break;
            }
          }
        });
      }
    });
  });
}

export function sortBoxes(parentBoxes: Box[], boxes: Box[], sort?: string, dir = 'desc') {
  if (sort === 'state') {
    const parentChildren = parentBoxes.map(p =>
      p.config.type === 'passthrough' ? [p.id] : p.config.children.map(getEntityId),
    );
    const sortByParent = (a: Box, b: Box, realSort: (a: Box, b: Box) => number) => {
      let parentIndexA = parentChildren.findIndex(children => children.includes(a.id));
      let parentIndexB = parentChildren.findIndex(children => children.includes(b.id));
      // sort orphans to the end
      if (parentIndexA === -1) {
        parentIndexA = parentChildren.length;
      }
      if (parentIndexB === -1) {
        parentIndexB = parentChildren.length;
      }
      return parentIndexA < parentIndexB ? -1 : parentIndexA > parentIndexB ? 1 : realSort(a, b);
    };

    if (dir === 'desc') {
      boxes.sort((a, b) => sortByParent(a, b, (a, b) => (a.state > b.state ? -1 : a.state < b.state ? 1 : 0)));
    } else {
      boxes.sort((a, b) => sortByParent(a, b, (a, b) => (a.state < b.state ? -1 : a.state > b.state ? 1 : 0)));
    }
  }
  return boxes;
}

// private _showWarning(warning: string): TemplateResult {
//   return html`
//     <hui-warning>${warning}</hui-warning>
//   `;
// }

export async function renderError(
  error: string,
  origConfig?: LovelaceCardConfig,
  hass?: HomeAssistant,
): Promise<TemplateResult> {
  const config = {
    type: 'error',
    error,
    origConfig,
  };
  let element: LovelaceCard;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const HELPERS = (window as any).loadCardHelpers ? (window as any).loadCardHelpers() : undefined;
  if (HELPERS) {
    element = (await HELPERS).createCardElement(config);
  } else {
    element = createThing(config);
  }
  if (hass) {
    element.hass = hass;
  }

  return html` ${element} `;
}

export function calculateTimePeriod(from: string, to = 'now'): { start: Date; end: Date } {
  const now = new Date();

  function parseTimeString(timeStr: string): Date {
    if (timeStr === 'now') return now;

    const match = timeStr.match(/^now(-|\+)?(\d+)?([smhdwMy])?(\/(d|w|M|y))?$/);
    if (!match) throw new Error(`Invalid time format: ${timeStr}`);

    const [, sign, amount, unit, , roundTo] = match;
    let date = new Date(now);

    if (amount && unit) {
      const numAmount = parseInt(amount, 10) * (sign === '-' ? -1 : 1);
      switch (unit) {
        case 's':
          date = addSeconds(date, numAmount);
          break;
        case 'm':
          date = addMinutes(date, numAmount);
          break;
        case 'h':
          date = addHours(date, numAmount);
          break;
        case 'd':
          date = addDays(date, numAmount);
          break;
        case 'w':
          date = addWeeks(date, numAmount);
          break;
        case 'M':
          date = addMonths(date, numAmount);
          break;
        case 'y':
          date = addYears(date, numAmount);
          break;
      }
    }

    if (roundTo) {
      switch (roundTo) {
        case 'd':
          date = startOfDay(date);
          break;
        case 'w':
          date = startOfWeek(date);
          break;
        case 'M':
          date = startOfMonth(date);
          break;
        case 'y':
          date = startOfYear(date);
          break;
      }
    }

    return date;
  }

  const start = parseTimeString(from);
  const end = parseTimeString(to);

  return { start, end };
}
