import type { NodeConfigForEditor } from './types';

export const UNIT_PREFIXES = {
  'm': 0.001,
  'k': 1000,
  'M': 1000000,
  'G': 1000000000,
  'T': 1000000000000,
};

export const MIN_LABEL_HEIGHT = 15;
export const CHAR_WIDTH_RATIO = 8.15; // px per char, trial and error
export const NAME_CHAR_WIDTH = 6; // proportional/italic name text is narrower
export const SEPARATOR_WIDTH = 4; // nbsp between state and name
export const LABEL_PADDING = 10; // .label has padding: 0 10px

export const DEFAULT_BOX_THICKNESS = 15; // default width/height of the colored bar on each box

export const MIN_HORIZONTAL_SECTION_W = 150;
export const MIN_VERTICAL_SECTION_H = 150;

export const FT3_PER_M3 = 35.31;

export type CONVERSION_UNITS = 'MJ' | 'gCO2' | 'monetary';

export const DEFAULT_ENTITY_CONF: Partial<NodeConfigForEditor> = {
  type: 'entity',
  name: '',
  children: [],
  // No deprecated V3 properties (color_on_state, etc.)
};