import type { GeneratedConfig } from '../editor-bridge';
import { migrateV3Config } from '../migrate';
import type { V3Config, V3SectionConfig } from '../migrate';
import type { Link, Node, NodeType, SankeyChartConfig, SectionConfig } from '../types';
import { isCarbonNodeType } from '../types';

// Every operation returns the input object itself when nothing changes, so
// callers can detect a no-op with `result === config`. Inputs may be deeply
// frozen and are never mutated.

export interface RemovalResult {
  config: SankeyChartConfig;
  removedLinks: Link[];
}

export interface AddNodeResult {
  config: SankeyChartConfig;
  id: string;
}

export type UpdateNodeError = 'not_found' | 'invalid_id' | 'duplicate_id';

export interface UpdateNodeResult {
  config: SankeyChartConfig;
  id: string;
  error?: UpdateNodeError;
}

export interface MoveNodeOptions {
  before?: string;
  newSection?: boolean;
}

export interface RemoveSectionResult extends RemovalResult {
  removedNodes: Node[];
}

export const nodeSection = (node: Pick<Node, 'section'>): number => node.section ?? 0;

const nodesOf = (config: SankeyChartConfig): Node[] => config.nodes ?? [];
const linksOf = (config: SankeyChartConfig): Link[] => config.links ?? [];

export function isAutoconfig(config: SankeyChartConfig): boolean {
  const { autoconfig } = config;
  return !!autoconfig || typeof autoconfig === 'object';
}

export function isV3Config(config: SankeyChartConfig): boolean {
  return !!config.sections?.some(section => (section as unknown as V3SectionConfig).entities);
}

export function ensureV4(config: SankeyChartConfig): SankeyChartConfig {
  return isV3Config(config) ? migrateV3Config(config as V3Config) : config;
}

export function readsEntity(type?: NodeType): boolean {
  return !type || type === 'entity' || isCarbonNodeType(type);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, i) => deepEqual(item, other[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA).filter(key => objA[key] !== undefined);
  const keysB = Object.keys(objB).filter(key => objB[key] !== undefined);
  return keysA.length === keysB.length && keysA.every(key => deepEqual(objA[key], objB[key]));
}

export function stripUndefined<T>(obj: T): T {
  const source = obj as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  Object.keys(source).forEach(key => {
    if (source[key] !== undefined) {
      out[key] = source[key];
    }
  });
  return out as unknown as T;
}

export function getSectionCount(config: SankeyChartConfig): number {
  const fromNodes = nodesOf(config).reduce((max, node) => Math.max(max, nodeSection(node) + 1), 0);
  return Math.max(config.sections?.length ?? 0, fromNodes);
}

export function findNode(config: SankeyChartConfig, id: string): Node | undefined {
  return nodesOf(config).find(node => node.id === id);
}

export function findLink(config: SankeyChartConfig, source: string, target: string): Link | undefined {
  return linksOf(config).find(link => link.source === source && link.target === target);
}

export function sectionNodes(config: SankeyChartConfig, index: number): Node[] {
  return nodesOf(config).filter(node => nodeSection(node) === index);
}

export function outgoing(config: SankeyChartConfig, id: string): Link[] {
  return linksOf(config).filter(link => link.source === id);
}

export function incoming(config: SankeyChartConfig, id: string): Link[] {
  return linksOf(config).filter(link => link.target === id);
}

export function isForward(config: SankeyChartConfig, source: string, target: string): boolean {
  const from = findNode(config, source);
  const to = findNode(config, target);
  return !!from && !!to && nodeSection(to) > nodeSection(from);
}

/**
 * Nodes the card can only render in edit mode, because they miss links they
 * need: a passthrough that no flow reaches or leaves, or a remaining parent
 * state that no flow reaches. Flows start and end at nodes that are not
 * passthroughs.
 */
export function incompleteNodes(config: SankeyChartConfig): Node[] {
  const nodes = nodesOf(config);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  linksOf(config).forEach(({ source, target }) => {
    if (!byId.has(source) || !byId.has(target)) return;
    forward.set(source, [...(forward.get(source) ?? []), target]);
    backward.set(target, [...(backward.get(target) ?? []), source]);
  });
  const reached = (edges: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>();
    const queue: string[] = [];
    nodes.forEach(node => {
      if (node.type !== 'passthrough') queue.push(...(edges.get(node.id) ?? []));
    });
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (byId.get(id)?.type === 'passthrough') queue.push(...(edges.get(id) ?? []));
    }
    return seen;
  };
  const fed = reached(forward);
  const drained = reached(backward);
  return nodes.filter(node =>
    node.type === 'passthrough'
      ? !fed.has(node.id) || !drained.has(node.id)
      : node.type === 'remaining_parent_state' && !fed.has(node.id),
  );
}

/** Nodes a change left incomplete that were complete before it. */
export function orphanedNodes(before: SankeyChartConfig, after: SankeyChartConfig): Node[] {
  const was = new Set(incompleteNodes(before).map(node => node.id));
  return incompleteNodes(after).filter(node => !was.has(node.id));
}

// Where a node joins the end of a section: after the section's last node, or
// before the first node of a later section, so nodes[] stays grouped.
function sectionEndIndex(nodes: Node[], section: number): number {
  let last = -1;
  nodes.forEach((node, i) => {
    if (nodeSection(node) === section) last = i;
  });
  if (last >= 0) return last + 1;
  const later = nodes.findIndex(node => nodeSection(node) > section);
  return later >= 0 ? later : nodes.length;
}

export function uniqueNodeId(config: SankeyChartConfig, base: string): string {
  const ids = new Set(nodesOf(config).map(node => node.id));
  if (!ids.has(base)) return base;
  let i = 2;
  while (ids.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function addNode(config: SankeyChartConfig, node: Node): AddNodeResult {
  if (!node.id) return { config, id: '' };
  const id = uniqueNodeId(config, node.id);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, entity_id, ...rest } = node;
  // A renamed duplicate keeps reading the entity it was created for.
  const entityId = entity_id ?? (id !== node.id && readsEntity(node.type) ? node.id : undefined);
  const added = stripUndefined({ id, ...(entityId ? { entity_id: entityId } : {}), ...rest });
  const nodes = nodesOf(config);
  const at = sectionEndIndex(nodes, nodeSection(added));
  return { config: { ...config, nodes: [...nodes.slice(0, at), added, ...nodes.slice(at)] }, id };
}

export function updateNode(config: SankeyChartConfig, id: string, patch: Partial<Node>): UpdateNodeResult {
  const nodes = nodesOf(config);
  const index = nodes.findIndex(node => node.id === id);
  if (index < 0) return { config, id, error: 'not_found' };

  const newId = 'id' in patch ? patch.id : id;
  if (newId !== id) {
    if (!newId) return { config, id, error: 'invalid_id' };
    if (nodes.some(node => node.id === newId)) return { config, id, error: 'duplicate_id' };
  }

  const current = nodes[index];
  const next = { ...current, id: newId! } as Node;
  (Object.keys(patch) as (keyof Node)[]).forEach(key => {
    if (key === 'id') return;
    if (patch[key] === undefined) {
      delete next[key];
    } else {
      (next as unknown as Record<string, unknown>)[key] = patch[key];
    }
  });
  if (deepEqual(current, next)) return { config, id };

  const result: SankeyChartConfig = { ...config, nodes: nodes.map((node, i) => (i === index ? next : node)) };
  if (newId !== id && linksOf(config).some(link => link.source === id || link.target === id)) {
    result.links = linksOf(config).map(link =>
      link.source === id || link.target === id
        ? {
            ...link,
            source: link.source === id ? newId! : link.source,
            target: link.target === id ? newId! : link.target,
          }
        : link,
    );
  }
  return { config: result, id: newId! };
}

export function removeNode(config: SankeyChartConfig, id: string): RemovalResult {
  const nodes = nodesOf(config);
  if (!nodes.some(node => node.id === id)) return { config, removedLinks: [] };
  const links = linksOf(config);
  const removedLinks = links.filter(link => link.source === id || link.target === id);
  const result: SankeyChartConfig = { ...config, nodes: nodes.filter(node => node.id !== id) };
  if (removedLinks.length) {
    result.links = links.filter(link => !removedLinks.includes(link));
  }
  return { config: result, removedLinks };
}

export function insertSection(config: SankeyChartConfig, index: number): SankeyChartConfig {
  if (!Number.isInteger(index) || index < 0) return config;
  const sections = [...(config.sections ?? [])];
  while (sections.length < index) sections.push({});
  sections.splice(index, 0, {});
  const result: SankeyChartConfig = { ...config, sections };
  if (config.nodes) {
    result.nodes = config.nodes.map(node =>
      nodeSection(node) >= index ? { ...node, section: nodeSection(node) + 1 } : node,
    );
  }
  return result;
}

export function moveNode(
  config: SankeyChartConfig,
  id: string,
  toSection: number,
  options: MoveNodeOptions = {},
): RemovalResult {
  const unchanged = { config, removedLinks: [] };
  const node = findNode(config, id);
  if (!node || !Number.isInteger(toSection) || toSection < 0) return unchanged;
  const from = nodeSection(node);
  if (sectionNodes(config, from).length === 1) {
    // A node alone in its section that lands in a new section next to it
    // would only leave an empty section behind.
    const count = getSectionCount(config);
    const besideItself = options.newSection
      ? toSection === from || toSection === from + 1
      : toSection === count && from === count - 1;
    if (besideItself) return unchanged;
  }

  const shifted = options.newSection ? insertSection(config, toSection) : config;
  const nodes = nodesOf(shifted);
  const index = nodes.findIndex(node => node.id === id);
  const original = nodes[index];
  const moving = nodeSection(original) === toSection ? original : { ...original, section: toSection };
  const rest = nodes.filter((_, i) => i !== index);

  let insertAt: number;
  const beforeIndex =
    options.before === undefined
      ? -1
      : rest.findIndex(node => node.id === options.before && nodeSection(node) === toSection);
  if (options.before === id && nodeSection(original) === toSection) {
    insertAt = index;
  } else if (beforeIndex >= 0) {
    insertAt = beforeIndex;
  } else {
    insertAt = sectionEndIndex(rest, toSection);
  }
  const nextNodes = [...rest.slice(0, insertAt), moving, ...rest.slice(insertAt)];

  if (!options.newSection && nextNodes.every((node, i) => node === nodes[i])) return unchanged;

  const moved: SankeyChartConfig = { ...shifted, nodes: nextNodes };
  const links = linksOf(moved);
  // insertSection keeps the relative order of sections, so `shifted` tells
  // which links were forward before the move.
  const removedLinks = links.filter(
    link =>
      (link.source === id || link.target === id) &&
      isForward(shifted, link.source, link.target) &&
      !isForward(moved, link.source, link.target),
  );
  if (removedLinks.length) {
    moved.links = links.filter(link => !removedLinks.includes(link));
  }
  return { config: moved, removedLinks };
}

export function addLink(config: SankeyChartConfig, source: string, target: string, value?: string): SankeyChartConfig {
  if (!isForward(config, source, target) || findLink(config, source, target)) return config;
  const link: Link = value ? { source, target, value } : { source, target };
  return { ...config, links: [...linksOf(config), link] };
}

export function updateLink(
  config: SankeyChartConfig,
  source: string,
  target: string,
  patch: Partial<Pick<Link, 'value'>>,
): SankeyChartConfig {
  const links = linksOf(config);
  const index = links.findIndex(link => link.source === source && link.target === target);
  if (index < 0) return config;
  const next: Link = { ...links[index] };
  if ('value' in patch) {
    if (patch.value) {
      next.value = patch.value;
    } else {
      delete next.value;
    }
  }
  if (deepEqual(next, links[index])) return config;
  return { ...config, links: links.map((link, i) => (i === index ? next : link)) };
}

export function removeLink(config: SankeyChartConfig, source: string, target: string): SankeyChartConfig {
  const links = linksOf(config);
  const remaining = links.filter(link => link.source !== source || link.target !== target);
  if (remaining.length === links.length) return config;
  return { ...config, links: remaining };
}

export function removeSection(config: SankeyChartConfig, index: number): RemoveSectionResult {
  if (!Number.isInteger(index) || index < 0 || index >= getSectionCount(config)) {
    return { config, removedLinks: [], removedNodes: [] };
  }
  const nodes = nodesOf(config);
  const removedNodes = nodes.filter(node => nodeSection(node) === index);
  const removedIds = new Set(removedNodes.map(node => node.id));
  const links = linksOf(config);
  const removedLinks = links.filter(link => removedIds.has(link.source) || removedIds.has(link.target));

  const result: SankeyChartConfig = { ...config };
  if (config.nodes) {
    result.nodes = nodes
      .filter(node => nodeSection(node) !== index)
      .map(node => (nodeSection(node) > index ? { ...node, section: nodeSection(node) - 1 } : node));
  }
  if (removedLinks.length) {
    result.links = links.filter(link => !removedLinks.includes(link));
  }
  if (config.sections) {
    result.sections = config.sections.filter((_, i) => i !== index);
  }
  return { config: result, removedLinks, removedNodes };
}

export function updateSectionConfig(
  config: SankeyChartConfig,
  index: number,
  sectionConfig: SectionConfig,
): SankeyChartConfig {
  if (!Number.isInteger(index) || index < 0) return config;
  const next = stripUndefined(sectionConfig);
  const sections = [...(config.sections ?? [])];
  if (index < sections.length ? deepEqual(sections[index], next) : !Object.keys(next).length) return config;
  while (sections.length <= index) sections.push({});
  sections[index] = next;
  return { ...config, sections };
}

const cleanGeneratedNode = (node: Node): Node => {
  const cleaned = stripUndefined({ ...node });
  if (cleaned.name === '') delete cleaned.name;
  if (cleaned.type === 'entity') delete cleaned.type;
  return cleaned;
};

/**
 * Turns an autoconfig card into an equivalent manual config. Pins the values
 * normalizeConfig only defaults (with ??) for autoconfig, so the chart looks the same.
 */
export function autoconfigToManual(config: SankeyChartConfig, generated: GeneratedConfig): SankeyChartConfig {
  if (!isAutoconfig(config)) return config;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { autoconfig, nodes: _nodes, links: _links, sections: _sections, ...manual } = config;
  const mode = (autoconfig && typeof autoconfig === 'object' && autoconfig.mode) || 'energy';

  if (mode === 'power' || mode === 'water_flow') {
    // Rate modes ignore these and show live states; a manual card would show statistics.
    delete manual.energy_date_selection;
    delete manual.time_period_from;
    delete manual.time_period_to;
  } else if (manual.energy_date_selection == null) {
    if (manual.time_period_from) {
      delete manual.energy_date_selection;
    } else {
      manual.energy_date_selection = true;
    }
  }
  if (manual.unit_prefix == null) {
    if (mode === 'energy') {
      manual.unit_prefix = 'k';
    } else {
      delete manual.unit_prefix;
    }
  }
  if (manual.round == null) {
    manual.round = 1;
  }

  return {
    ...manual,
    nodes: generated.nodes.map(cleanGeneratedNode),
    links: generated.links.map(link => stripUndefined({ ...link })),
    sections: generated.sections.map(section => stripUndefined({ ...section })),
  };
}
