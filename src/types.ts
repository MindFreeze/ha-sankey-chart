import { LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';
import {UNIT_PREFIXES} from './const';

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

type BoxType = 'entity' | 'passthrough' | 'remaining_parent_state' | 'remaining_child_state';

export type EntityConfig = {
  entity_id: string;
  attribute?: string;
  type?: BoxType;
  children?: string[];
  color?: string;
  name?: string;
  color_on_state?: boolean;
  color_above?: string;
  color_below?: string;
  color_limit?: number;
  remaining?: string | {
    name: string;
    color?: string;
  },
}

export type EntityConfigInternal = EntityConfig & {
  // children: string[];
  accountedState?: number;
  foundChildren?: string[];
}

export type EntityConfigOrStr = string | EntityConfig;

export interface SectionConfig {
  entities: EntityConfigOrStr[];
}

export interface SankeyChartConfig extends LovelaceCardConfig {
  type: string;
  title?: string;
  sections: SectionConfig[];
  unit_prefix?: '' | keyof typeof UNIT_PREFIXES;
  round?: number;
  height?: number;
  wide?: boolean;
  show_icons?: boolean;
  show_names?: boolean;
  show_states?: boolean;
  show_units?: boolean;
  min_box_height?: number,
  min_box_distance?: number,
  throttle?: number,
}

export interface Config extends SankeyChartConfig {
  unit_prefix: '' | keyof typeof UNIT_PREFIXES;
  round: number;
  height: number;
  min_box_height: number;
  min_box_distance: number;
  sections: {
    entities: EntityConfig[];
  }[];
}

export interface Connection {
  startY: number;
  startSize: number;
  endY: number;
  endSize: number;
  state: number;
  startColor?: string;
  endColor?: string;
}

export interface Box {
  config: EntityConfig;
  entity: HassEntity;
  entity_id: string;
  state: number;
  unit_of_measurement?: string;
  children: string[];
  color: string;
  size: number;
  top: number;
  extraSpacers?: number;
  connections: {
    parents: Connection[];
  }
}

export interface SectionState {
  boxes: Box[],
  total: number,
  spacerH: number,
  statePerPixelY: number,
}
