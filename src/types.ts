import { ActionConfig, LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

export type EntityConfig = string | {
  entity_id: string;
  parents?: string[];
}

export interface SectionConfig {
  entities: EntityConfig[];
}

export interface SankeyChartConfig extends LovelaceCardConfig {
  type: string;
  // name?: string;
  sections: SectionConfig[];
  height?: number;

  // show_warning?: boolean;
  // show_error?: boolean;
  // test_gui?: boolean;
  // entity?: string;
  // tap_action?: ActionConfig;
  // hold_action?: ActionConfig;
  // double_tap_action?: ActionConfig;
}

export interface Box {
  entity_id: string;
  state: number;
  parents: string[];
}

export interface SectionState {
  boxes: Box[],
  total: number,
}