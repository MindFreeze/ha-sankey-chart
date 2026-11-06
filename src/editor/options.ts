import { UNIT_PREFIXES } from '../const';
import type { AutoconfigMode, Config, SankeyChartConfig } from '../types';
import { changedKeys, translate, tr } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Schema = any;

export interface FormChange {
  config: SankeyChartConfig;
  changed: string[];
}

export const OPTION_KEYS = [
  'title',
  'layout',
  'height',
  'show_names',
  'show_icons',
  'show_states',
  'show_units',
  'box_thickness',
  'min_box_size',
  'min_box_distance',
  'connection_margin',
  'unit_prefix',
  'round',
  'min_state',
  'static_scale',
  'convert_units_to',
  'monetary_unit',
  'electricity_price',
  'gas_price',
  'co2_intensity_entity',
  'gas_co2_intensity',
  'energy_date_selection',
  'energy_collection_key',
  'time_period_from',
  'time_period_to',
  'sort_by',
  'sort_dir',
  'throttle',
  'ignore_missing_entities',
] as const;

// '' is a real unit_prefix (no prefix) that differs from unset in autoconfig
// mode, and a select cannot hold an empty value, so the form uses a stand-in.
const NO_PREFIX = 'none';

export const labelledOptions = (values: string[], labelKey: (value: string) => string) =>
  values.map(value => ({ value, label: tr(labelKey(value)) }));

export const select = (opts: { value: string; label: string }[]) => ({ select: { mode: 'dropdown', options: opts } });
const number = (extra: Record<string, unknown> = {}) => ({ number: { mode: 'box', ...extra } });
const px = number({ min: 0, unit_of_measurement: 'px' });
const bool = { boolean: {} };
const text = { text: {} };
export const grid = (schema: Schema[]) => ({ type: 'grid', name: '', schema });
export const group = (key: string, icon: string, schema: Schema[]) => ({
  type: 'expandable',
  name: '',
  title: tr(`editor.groups.${key}`),
  icon,
  schema,
});

export const sortBySelector = () => select(labelledOptions(['none', 'state'], v => `editor.sort_by.${v}`));
export const sortDirSelector = () => select(labelledOptions(['desc', 'asc'], v => `editor.sort_dir.${v}`));

export function optionsSchema(data: Record<string, unknown>): Schema[] {
  const convert = data.convert_units_to;
  return [
    { name: 'title', selector: text },
    group('appearance', 'mdi:palette-outline', [
      {
        name: 'layout',
        selector: select(labelledOptions(['auto', 'horizontal', 'vertical'], v => `editor.layout.${v}`)),
      },
      { name: 'height', selector: px },
      grid([
        { name: 'show_names', selector: bool },
        { name: 'show_icons', selector: bool },
        { name: 'show_states', selector: bool },
        { name: 'show_units', selector: bool },
      ]),
      grid([
        { name: 'box_thickness', selector: px },
        { name: 'min_box_size', selector: px },
        { name: 'min_box_distance', selector: px },
        { name: 'connection_margin', selector: px },
      ]),
    ]),
    group('values', 'mdi:numeric', [
      grid([
        {
          name: 'unit_prefix',
          selector: select([
            { value: NO_PREFIX, label: tr('editor.unit_prefix_none') },
            { value: 'auto', label: tr('editor.layout.auto') },
            ...Object.keys(UNIT_PREFIXES).map(key => ({ value: key, label: key })),
          ]),
        },
        { name: 'round', selector: number({ min: 0, unit_of_measurement: tr('editor.decimals') }) },
        { name: 'min_state', selector: number({ min: 0, step: 'any' }) },
        { name: 'static_scale', selector: number({ min: 0, step: 'any' }) },
      ]),
      {
        name: 'convert_units_to',
        selector: select(labelledOptions(['MJ', 'gCO2', 'monetary'], v => `editor.convert_units.${v}`)),
      },
      ...(convert === 'monetary'
        ? [
            { name: 'monetary_unit', selector: text },
            grid([
              { name: 'electricity_price', selector: number({ step: 'any' }) },
              { name: 'gas_price', selector: number({ step: 'any' }) },
            ]),
          ]
        : []),
      ...(convert === 'gCO2'
        ? [
            { name: 'co2_intensity_entity', selector: { entity: {} } },
            { name: 'gas_co2_intensity', selector: number({ min: 0, step: 'any' }) },
          ]
        : []),
    ]),
    // ha-form renders items by position, so the optional item goes last: typing a
    // time period turns the date picker off and must not replace the fields.
    group('time', 'mdi:calendar-range', [
      { name: 'energy_date_selection', selector: bool },
      grid([
        { name: 'time_period_from', selector: text },
        { name: 'time_period_to', selector: text },
      ]),
      ...(data.energy_date_selection ? [{ name: 'energy_collection_key', selector: text }] : []),
    ]),
    group('sorting', 'mdi:sort', [
      grid([
        { name: 'sort_by', selector: sortBySelector() },
        { name: 'sort_dir', selector: sortDirSelector() },
      ]),
    ]),
    group('advanced', 'mdi:cog-outline', [
      grid([
        { name: 'throttle', selector: number({ min: 0, unit_of_measurement: 'ms' }) },
        { name: 'ignore_missing_entities', selector: bool },
      ]),
    ]),
  ];
}

/** What the form shows: the configured value, or the default the card would use. */
export function optionsData(config: SankeyChartConfig, defaults: Partial<Config>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  OPTION_KEYS.forEach(key => {
    const value = config[key] !== undefined ? config[key] : defaults[key];
    if (value !== undefined && value !== '') {
      data[key] = value;
    }
  });
  if (data.unit_prefix === undefined) {
    data.unit_prefix = NO_PREFIX;
  }
  return data;
}

/** Writes only the options the user changed, so saved configs do not fill up with defaults. */
export function applyOptionsChange(
  config: SankeyChartConfig,
  data: Record<string, unknown>,
  value: Record<string, unknown>,
): FormChange {
  const changed = changedKeys(data, value, [...OPTION_KEYS]);
  if (!changed.length) return { config, changed };
  const next: SankeyChartConfig = { ...config };
  changed.forEach(key => {
    const newValue = value[key];
    if (key === 'unit_prefix' && newValue === NO_PREFIX) {
      next.unit_prefix = '';
    } else if (newValue === undefined || newValue === null || newValue === '') {
      delete next[key];
    } else {
      next[key] = newValue;
    }
  });
  // The energy date picker and a fixed time period exclude each other.
  if (changed.includes('time_period_from') && next.time_period_from) {
    delete next.energy_date_selection;
  }
  if (changed.includes('energy_date_selection') && next.energy_date_selection) {
    delete next.time_period_from;
    delete next.time_period_to;
  }
  return { config: next, changed };
}

export const AUTOCONFIG_DEFAULTS = {
  mode: 'energy' as AutoconfigMode,
  group_by_floor: true,
  group_by_area: true,
  net_flows: true,
  carbon_split: false,
  print_yaml: false,
};

type AutoconfigOptions = NonNullable<SankeyChartConfig['autoconfig']>;

const autoconfigOf = (config: SankeyChartConfig): AutoconfigOptions =>
  config.autoconfig && typeof config.autoconfig === 'object' ? config.autoconfig : {};

export function autoconfigData(config: SankeyChartConfig): Record<string, unknown> {
  const data: Record<string, unknown> = { ...AUTOCONFIG_DEFAULTS };
  const autoconfig = autoconfigOf(config);
  Object.keys(autoconfig).forEach(key => {
    if (autoconfig[key] !== undefined) data[key] = autoconfig[key];
  });
  return data;
}

export function autoconfigSchema(mode: unknown): Schema[] {
  const energy = (mode || 'energy') === 'energy';
  return [
    {
      name: 'mode',
      selector: select(labelledOptions(['energy', 'power', 'water', 'water_flow'], v => `editor.autoconfig_mode.${v}`)),
    },
    grid([
      { name: 'group_by_floor', selector: bool },
      { name: 'group_by_area', selector: bool },
      ...(energy
        ? [
            { name: 'net_flows', selector: bool },
            { name: 'carbon_split', selector: bool },
          ]
        : []),
      { name: 'print_yaml', selector: bool },
    ]),
  ];
}

export function applyAutoconfigChange(
  config: SankeyChartConfig,
  data: Record<string, unknown>,
  value: Record<string, unknown>,
): FormChange {
  const changed = changedKeys(data, value, Object.keys(AUTOCONFIG_DEFAULTS));
  if (!changed.length) return { config, changed };
  const autoconfig: Record<string, unknown> = { ...autoconfigOf(config) };
  changed.forEach(key => {
    const newValue = value[key];
    if (newValue === undefined || newValue === '' || newValue === AUTOCONFIG_DEFAULTS[key]) {
      delete autoconfig[key];
    } else {
      autoconfig[key] = newValue;
    }
  });
  return { config: { ...config, autoconfig: autoconfig as AutoconfigOptions }, changed };
}

const LABEL_KEYS: Record<string, string> = {
  mode: 'editor.fields.autoconfig_mode',
  section: 'editor.section',
};

export const computeLabel = (schema: { name: string }): string =>
  tr(LABEL_KEYS[schema.name] ?? `editor.fields.${schema.name}`);

export const computeHelper = (schema: { name: string }): string | undefined =>
  schema.name ? translate(`editor.helpers.${schema.name}`) : undefined;
