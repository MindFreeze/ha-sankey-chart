import {
  ActionConfig,
  BaseActionConfig,
  HapticType,
  LovelaceCardConfig,
} from 'custom-card-helpers';
import { HassEntity, HassServiceTarget } from 'home-assistant-js-websocket';
import { UNIT_PREFIXES, CONVERSION_UNITS, DEFAULT_BOX_THICKNESS } from './const';

export const DEFAULT_CONFIG: Config = {
  type: 'custom:ha-sankey-chart',
  layout: 'auto',
  height: 200,
  unit_prefix: '',
  round: 0,
  convert_units_to: '',
  co2_intensity_entity: 'sensor.co2_signal_co2_intensity',
  min_box_size: 3,
  min_box_distance: 5,
  min_state: 0,
  show_states: true,
  show_units: true,
  box_thickness: DEFAULT_BOX_THICKNESS,
  connection_margin: 0,
  nodes: [],
  links: [],
  sections: [],
};

export type AutoconfigMode = 'energy' | 'power' | 'water' | 'water_flow';

export interface SankeyChartConfig extends LovelaceCardConfig {
  type: string;
  nodes?: Node[];
  links?: Link[];
  sections?: SectionConfig[];
  autoconfig?: {
    mode?: AutoconfigMode;
    print_yaml?: boolean;
    group_by_floor?: boolean;
    group_by_area?: boolean;
    net_flows?: boolean;
    carbon_split?: boolean;
  };
  title?: string;
  convert_units_to?: '' | CONVERSION_UNITS;
  co2_intensity_entity?: string;
  gas_co2_intensity?: number;
  monetary_unit?: string;
  electricity_price?: number;
  gas_price?: number;
  unit_prefix?: '' | 'auto' | keyof typeof UNIT_PREFIXES;
  round?: number;
  height?: number;
  layout?: 'auto' | 'vertical' | 'horizontal';
  show_icons?: boolean;
  show_names?: boolean;
  show_states?: boolean;
  show_units?: boolean;
  energy_date_selection?: boolean;
  energy_collection_key?: string;
  min_box_size?: number;
  min_box_distance?: number;
  box_thickness?: number;
  connection_margin?: number;
  throttle?: number;
  min_state?: number;
  static_scale?: number;
  sort_by?: 'none' | 'state';
  sort_dir?: 'asc' | 'desc';
  time_period_from?: string;
  time_period_to?: string;
  ignore_missing_entities?: boolean;
}

export interface Node {
  id: string;
  section?: number; // index in sections array
  type?: NodeType;
  name?: string;
  attribute?: string;
  unit_of_measurement?: string; // for attribute
  entity_id?: string; // explicit entity to read; defaults to `id`. Lets a synthetic node id reference a real entity.
  filters?: NodeFilter[]; // value transforms applied before the positive clamp.
  add_entities?: string[]; // temporary - will be replaced
  subtract_entities?: string[]; // temporary - will be replaced
  color?: string | {
    [color: string]: {
      from?: number;
      to?: number;
    }
  };
  icon?: string;
  // color_on_state?: boolean; // @depracated. use color instead
  // color_above?: string; // @depracated. use color instead
  // color_below?: string; // @depracated. use color instead
  // color_limit?: number; // @depracated. use color instead
  // url?: string; // @depracated. use tap_action instead
  tap_action?: ActionConfigExtended;
  double_tap_action?: ActionConfigExtended;
  hold_action?: ActionConfigExtended;
  children_sum?: ReconcileConfig;
  parents_sum?: ReconcileConfig;
}

export interface Link {
  source: string;
  target: string;
  value?: string; // optional connection entity
}

export const CARBON_NODE_TYPES = ['high_carbon_energy', 'low_carbon_energy'] as const;
export type CarbonNodeType = (typeof CARBON_NODE_TYPES)[number];

export type NodeType =
  | 'entity'
  | 'passthrough'
  | 'remaining_parent_state'
  | 'remaining_child_state'
  | CarbonNodeType;

export const isCarbonNodeType = (type: NodeType | undefined): type is CarbonNodeType =>
  type === 'high_carbon_energy' || type === 'low_carbon_energy';

// ESPHome/Plotly-style filter shape: each entry is `{ <name>: <arg> }`. Future
// transforms (e.g. `abs`, `clamp`) slot in as additional union members.
export type NodeFilter =
  | { multiply: number }
  | { divide: number }
  | { offset: number };

export interface NodeInternal extends Node {
  children: ChildConfigOrStr[];
  accountedState?: number;
  foundChildren?: string[];
}

// Backward compatibility alias
export type EntityConfigInternal = NodeInternal;

// Editor-specific types - working with nodes that have temporary children array
export interface NodeConfigForEditor extends Node {
  children?: ChildConfigOrStr[]; // temporary UI property, synced with links
}

export type NodeConfigOrStr = string | NodeConfigForEditor;

export type ChildConfig = {
  entity_id: string;
  connection_entity_id: string;
};

export type ChildConfigOrStr = string | ChildConfig;

export type ActionConfigExtended = ActionConfig | CallServiceActionConfig | MoreInfoActionConfig | ZoomActionConfig;

export interface MoreInfoActionConfig extends BaseActionConfig {
  action: 'more-info';
  entity?: string;
  data?: {
    entity_id?: string | [string];
  };
}

export interface ZoomActionConfig extends BaseActionConfig {
  action: 'zoom';
}

export interface CallServiceActionConfig extends BaseActionConfig {
  action: 'call-service';
  service: string;
  data?: {
    entity_id?: string | [string];
    [key: string]: unknown;
  };
  target?: HassServiceTarget;
  repeat?: number;
  haptic?: HapticType;
}

export interface ReconcileConfig {
  should_be: 'equal' | 'equal_or_less' | 'equal_or_more';
  reconcile_to: 'min' | 'max' | 'mean' |  'latest';
}

export interface SectionConfig {
  sort_by?: 'none' | 'state';
  sort_dir?: 'asc' | 'desc';
  sort_group_by_parent?: boolean;
  min_width?: number;
}

export interface Section {
  entities: NodeInternal[];
  sort_by?: 'none' | 'state';
  sort_dir?: 'asc' | 'desc';
  sort_group_by_parent?: boolean;
  min_width?: number;
}

export interface Config extends SankeyChartConfig {
  layout: 'auto' | 'vertical' | 'horizontal';
  unit_prefix: '' | 'auto' | keyof typeof UNIT_PREFIXES;
  round: number;
  height: number;
  min_box_size: number;
  min_box_distance: number;
  box_thickness: number;
  connection_margin: number;
  min_state: number;
  nodes: Node[];
  links: Link[];
  sections: Section[]; // calculated from nodes/links by depth
}

export interface Connection {
  startY: number;
  startSize: number;
  endY: number;
  endSize: number;
  state: number;
  startColor?: string;
  endColor?: string;
  highlighted?: boolean;
}

export interface Box {
  config: NodeInternal;
  entity: Omit<HassEntity, 'state'> & {
    state: string | number;
  };
  id: string;
  state: number;
  unit_of_measurement?: string;
  children: ChildConfigOrStr[];
  color: string;
  size: number;
  top: number;
  connections: {
    parents: Connection[];
  };
  connectedParentState: number;
}

export interface SectionState {
  boxes: Box[];
  total: number;
  spacerSize: number;
  statePerPixel: number;
  config: Section;
  size: number;
  offset: number;
}

export interface ConnectionState {
  parent: NodeInternal;
  child: NodeInternal;
  state: number;
  prevParentState: number;
  prevChildState: number;
  ready: boolean;
  calculating?: boolean;
  highlighted?: boolean;
  passthroughs: NodeInternal[];
  connection_entity_id?: string;
}

export interface NormalizedState {
  state: number;
  unit_of_measurement?: string;
  last_updated: string;
}
