import { LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

export type EntityConfig = string | {
  entity_id: string;
  children?: string[];
  color?: string;
}

export interface SectionConfig {
  entities: EntityConfig[];
}

export interface SankeyChartConfig extends LovelaceCardConfig {
  type: string;
  // name?: string;
  sections: SectionConfig[];
  height?: number;
  wide?: boolean;
}

export interface Connection {
  startY: number;
  startSize: number;
  endY: number;
  endSize: number;
}

export interface Box {
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
  spacerH?: number,
}