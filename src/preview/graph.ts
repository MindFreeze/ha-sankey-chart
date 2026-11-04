import type { Link, Node, Section, SectionConfig } from '../types';
import { isAutoPassthrough } from '../utils';

/**
 * Inverse of autoRouteCrossGapLinks: drops the synthetic passthroughs and points
 * each link straight at the node its chain ends in.
 */
export function collapseAutoPassthroughs(nodes: Node[], links: Link[]): { nodes: Node[]; links: Link[] } {
  const auto = new Set(nodes.filter(isAutoPassthrough).map(n => n.id));
  const onward = new Map<string, string>();
  links.forEach(l => {
    if (auto.has(l.source)) onward.set(l.source, l.target);
  });
  const resolve = (id: string): string => {
    const seen = new Set<string>();
    while (auto.has(id) && onward.has(id) && !seen.has(id)) {
      seen.add(id);
      id = onward.get(id)!;
    }
    return id;
  };
  const collapsed: Link[] = [];
  links.forEach(link => {
    if (auto.has(link.source)) return;
    const target = resolve(link.target);
    if (auto.has(target) || collapsed.some(l => l.source === link.source && l.target === target)) return;
    collapsed.push({ ...link, target });
  });
  return { nodes: nodes.filter(n => !auto.has(n.id)), links: collapsed };
}

// Section settings by section index, as a config stores them
export const sectionConfigs = (sections: Section[]): SectionConfig[] => {
  const configs: SectionConfig[] = [];
  sections.forEach((section, position) => {
    const { sort_by, sort_dir, sort_group_by_parent, min_width } = section;
    const config: SectionConfig = { sort_by, sort_dir, sort_group_by_parent, min_width };
    (Object.keys(config) as (keyof SectionConfig)[]).forEach(key => config[key] === undefined && delete config[key]);
    configs[section.index ?? position] = config;
  });
  return Array.from(configs, config => config ?? {});
};
