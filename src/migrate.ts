import { LovelaceCardConfig } from 'custom-card-helpers';
import { CONVERSION_UNITS, UNIT_PREFIXES } from './const';
import type { ActionConfigExtended, NodeType, ChildConfigOrStr, ReconcileConfig, SankeyChartConfig } from './types';

interface V3Config extends LovelaceCardConfig {
  type: string;
  autoconfig?: {
    print_yaml?: boolean;
    group_by_floor?: boolean;
    group_by_area?: boolean;
  };
  title?: string;
  sections?: SectionConfig[];
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

interface SectionConfig {
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
  // @TODO: Implement
  return {
    ...config,
    nodes: [],
    links: [],
  };
}
