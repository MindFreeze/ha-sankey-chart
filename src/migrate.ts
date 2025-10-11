import { LovelaceCardConfig } from 'custom-card-helpers';
import { CONVERSION_UNITS, UNIT_PREFIXES } from './const';
import type { ActionConfigExtended, NodeType, ChildConfigOrStr, ReconcileConfig, SankeyChartConfig, SectionConfig } from './types';

export interface V3Config extends LovelaceCardConfig {
  type: string;
  autoconfig?: {
    print_yaml?: boolean;
    group_by_floor?: boolean;
    group_by_area?: boolean;
  };
  title?: string;
  sections?: V3SectionConfig[];
  convert_units_to?: '' | CONVERSION_UNITS;
  co2_intensity_entity?: string;
  gas_co2_intensity?: number;
  monetary_unit?: string;
  electricity_price?: number;
  gas_price?: number;
  unit_prefix?: '' | 'auto' | keyof typeof UNIT_PREFIXES;
  round?: number;
  height?: number;
  wide?: boolean;
  layout?: 'auto' | 'vertical' | 'horizontal';
  show_icons?: boolean;
  show_names?: boolean;
  show_states?: boolean;
  show_units?: boolean;
  energy_date_selection?: boolean;
  min_box_size?: number;
  min_box_distance?: number;
  throttle?: number;
  min_state?: number;
  static_scale?: number;
  sort_by?: 'none' | 'state';
  sort_dir?: 'asc' | 'desc';
  time_period_from?: string;
  time_period_to?: string;
  ignore_missing_entities?: boolean;
}

export interface V3SectionConfig {
  entities: EntityConfigOrStr[];
  sort_by?: 'none' | 'state';
  sort_dir?: 'asc' | 'desc';
  sort_group_by_parent?: boolean;
  min_width?: number;
}

type EntityConfigOrStr = string | EntityConfig;

export interface EntityConfig {
  entity_id: string;
  add_entities?: string[];
  subtract_entities?: string[];
  attribute?: string;
  type?: NodeType;
  children?: ChildConfigOrStr[];
  unit_of_measurement?: string; // for attribute
  color?: string;
  name?: string;
  icon?: string;
  color_on_state?: boolean;
  color_above?: string;
  color_below?: string;
  color_limit?: number;
  url?: string;
  tap_action?: ActionConfigExtended;
  double_tap_action?: ActionConfigExtended;
  hold_action?: ActionConfigExtended;
  children_sum?: ReconcileConfig;
  parents_sum?: ReconcileConfig;
}

export function migrateV3Config(config: V3Config): SankeyChartConfig {
  const nodes: SankeyChartConfig['nodes'] = [];
  const links: SankeyChartConfig['links'] = [];
  const sections: SankeyChartConfig['sections'] = [];

  if (!config.sections || config.sections.length === 0) {
    return {
      ...config,
      nodes: [],
      links: [],
      sections: [],
    };
  }

  // Convert sections to nodes with section index and extract section configs
  config.sections.forEach((section, sectionIndex) => {
    // Extract section config (without entities)
    const sectionConfig: SectionConfig = {
      sort_by: section.sort_by,
      sort_dir: section.sort_dir,
      sort_group_by_parent: section.sort_group_by_parent,
      min_width: section.min_width,
    };
    sections.push(sectionConfig);

    section.entities.forEach(entity => {
      const entityConf = typeof entity === 'string' ? { entity_id: entity } : entity;

      // Create node
      const node: NonNullable<SankeyChartConfig['nodes']>[number] = {
        id: entityConf.entity_id,
        section: sectionIndex,
        type: entityConf.type || 'entity',
        name: entityConf.name || '',
        attribute: entityConf.attribute,
        unit_of_measurement: entityConf.unit_of_measurement,
        add_entities: entityConf.add_entities,
        subtract_entities: entityConf.subtract_entities,
        icon: entityConf.icon,
        tap_action: entityConf.tap_action,
        double_tap_action: entityConf.double_tap_action,
        hold_action: entityConf.hold_action,
        children_sum: entityConf.children_sum,
        parents_sum: entityConf.parents_sum,
      };

      // Handle color migration
      if (entityConf.color_on_state && entityConf.color_limit !== undefined) {
        // Migrate old color format to new range-based format
        const colors: any = {};
        if (entityConf.color_below) {
          colors[entityConf.color_below] = { to: entityConf.color_limit };
        }
        if (entityConf.color_above) {
          colors[entityConf.color_above] = { from: entityConf.color_limit };
        }
        node.color = colors;
      } else if (entityConf.color) {
        node.color = entityConf.color;
      }

      nodes.push(node);

      // Create links from children
      if (entityConf.children) {
        entityConf.children.forEach(child => {
          const childConf = typeof child === 'string' ? { entity_id: child } : child;
          links.push({
            source: entityConf.entity_id,
            target: childConf.entity_id,
            value: 'connection_entity_id' in childConf ? childConf.connection_entity_id : undefined,
          });
        });
      }
    });
  });

  // Remove old sections from config (will use new sections without entities)
  const { sections: _oldSections, ...configWithoutSections } = config;

  return {
    ...configWithoutSections,
    nodes,
    links,
    sections,
  };
}
