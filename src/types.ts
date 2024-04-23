import {
  ActionConfig,
  BaseActionConfig,
  HapticType,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from 'custom-card-helpers';
import { HassEntity, HassServiceTarget } from 'home-assistant-js-websocket';
import { UNIT_PREFIXES, CONVERSION_UNITS } from './const';

export interface SankeyChartConfig extends LovelaceCardConfig {
  type: string;
  autoconfig?: {
    print_yaml?: boolean;
  };
  title?: string;
  sections?: SectionConfig[];
  convert_units_to?: '' | CONVERSION_UNITS;
  co2_intensity_entity?: string;
  gas_co2_intensity?: number;
  monetary_unit?: string;
  electricity_price?: number;
  gas_price?: number;
  unit_prefix?: '' | keyof typeof UNIT_PREFIXES;
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
}

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

export type BoxType = 'entity' | 'passthrough' | 'remaining_parent_state' | 'remaining_child_state';

export interface EntityConfig {
  entity_id: string;
  add_entities?: string[];
  subtract_entities?: string[];
  // @deprecated #100
  substract_entities?: string[];
  attribute?: string;
  type?: BoxType;
  children?: ChildConfigOrStr[];
  unit_of_measurement?: string; // for attribute
  color?: string;
  name?: string;
  icon?: string;
  color_on_state?: boolean;
  color_above?: string;
  color_below?: string;
  color_limit?: number;
  tap_action?: ActionConfigExtended;
  double_tap_action?: ActionConfigExtended;
  hold_action?: ActionConfigExtended;
  // @deprecated
  remaining?:
    | string
    | {
        name: string;
        color?: string;
      };
}

export type EntityConfigInternal = EntityConfig & {
  children: ChildConfigOrStr[];
  accountedState?: number;
  foundChildren?: string[];
};

export type EntityConfigOrStr = string | EntityConfig;

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

export interface SectionConfig {
  entities: EntityConfigOrStr[];
  sort_by?: 'none' | 'state';
  sort_dir?: 'asc' | 'desc';
  sort_group_by_parent?: boolean;
  min_width?: number;
}

export interface Section {
  entities: EntityConfigInternal[];
  sort_by?: 'none' | 'state';
  sort_dir?: 'asc' | 'desc';
  sort_group_by_parent?: boolean;
  min_width?: number;
}

export interface Config extends SankeyChartConfig {
  layout: 'auto' | 'vertical' | 'horizontal';
  unit_prefix: '' | keyof typeof UNIT_PREFIXES;
  round: number;
  height: number;
  min_box_size: number;
  min_box_distance: number;
  min_state: number;
  sections: Section[];
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
  config: EntityConfigInternal;
  entity: Omit<HassEntity, 'state'> & {
    state: string | number;
  };
  entity_id: string;
  state: number;
  unit_of_measurement?: string;
  children: ChildConfigOrStr[];
  color: string;
  size: number;
  top: number;
  extraSpacers?: number;
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
}

export interface ConnectionState {
  parent: EntityConfigInternal;
  child: EntityConfigInternal;
  state: number;
  prevParentState: number;
  prevChildState: number;
  ready: boolean;
  calculating?: boolean;
  highlighted?: boolean;
  passthroughs: EntityConfigInternal[];
}

export interface NormalizedState {
  state: number;
  unit_of_measurement?: string;
}
