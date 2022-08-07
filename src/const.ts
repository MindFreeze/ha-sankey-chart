import { EntityConfig } from "./types";

export const UNIT_PREFIXES = {
  'm': 0.001,
  'k': 1000,
  'M': 1000000,
  'G': 1000000000,
  'T': 1000000000000,
};

export const MIN_LABEL_HEIGHT = 15;

export const DEFAULT_ENTITY_CONF: Omit<EntityConfig, 'entity_id'> = {
  type: 'entity',
};