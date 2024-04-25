import { EntityConfig } from "./types";

export const UNIT_PREFIXES = {
  'm': 0.001,
  'k': 1000,
  'M': 1000000,
  'G': 1000000000,
  'T': 1000000000000,
};

export const MIN_LABEL_HEIGHT = 15;
export const CHAR_WIDTH_RATIO = 8.15; // px per char, trial and error

export const MIN_HORIZONTAL_SECTION_W = 150;
export const MIN_VERTICAL_SECTION_H = 150;

export const DEFAULT_ENTITY_CONF: Omit<EntityConfig, 'entity_id'> = {
  type: 'entity',
};

export const FT3_PER_M3 = 35.31;

export type CONVERSION_UNITS = 'MJ' | 'gCO2' | 'monetary';