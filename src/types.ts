import { LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';
import {UNIT_PREFIXES} from './const';

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

export type EntityConfig = {
  entity_id: string;
  children?: string[];
  color?: string;
  name?: string;
}

export type EntityConfigOrStr = string | EntityConfig;

export interface SectionConfig {
  entities: EntityConfigOrStr[];
}

export interface SankeyChartConfig extends LovelaceCardConfig {
  type: string;
  sections: SectionConfig[];
  unit_prefix?: '' | keyof typeof UNIT_PREFIXES;
  round?: number;
  height?: number;
  wide?: boolean;
  show_icons?: boolean;
  show_names?: boolean;
  min_box_height?: number,
  min_box_distance?: number,
}

export interface Config extends SankeyChartConfig {
  unit_prefix: '' | keyof typeof UNIT_PREFIXES;
  round: number;
  height: number;
  min_box_height: number;
  min_box_distance: number;
}

export interface Connection {
  startY: number;
  startSize: number;
  endY: number;
  endSize: number;
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