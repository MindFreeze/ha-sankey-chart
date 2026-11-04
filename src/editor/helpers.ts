import { HomeAssistant, stateIcon } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';
import { html, TemplateResult } from 'lit';
import { resolveCarbonSources } from '../energy';
import { computeEntityName } from '../entity-name';
import * as en from '../localize/languages/en.json';
import { localize } from '../localize/localize';
import { isCarbonNodeType } from '../types';
import type { Node, NodeType } from '../types';
import { deepEqual, readsEntity } from './config-ops';

export const NODE_TYPES: NodeType[] = [
  'entity',
  'passthrough',
  'remaining_parent_state',
  'remaining_child_state',
  'high_carbon_energy',
  'low_carbon_energy',
];

const TYPE_ICONS: Record<NodeType, string> = {
  entity: 'mdi:flash',
  passthrough: 'mdi:arrow-right-thin',
  remaining_parent_state: 'mdi:call-split',
  remaining_child_state: 'mdi:call-merge',
  high_carbon_energy: 'mdi:molecule-co2',
  low_carbon_energy: 'mdi:leaf',
};

/** The translation of a key, or undefined when there is none. */
export function translate(key: string): string | undefined {
  try {
    const value: unknown = localize(key);
    return typeof value === 'string' ? value : undefined;
  } catch (e) {
    // localize throws when a parent key of `key` is missing
    return undefined;
  }
}

/** Translates an `editor.*` key, replacing every `{name}` placeholder. */
export function tr(key: string, vars: Record<string, string | number> = {}): string {
  let text = translate(key) ?? key;
  Object.keys(vars).forEach(name => {
    text = text.split(`{${name}}`).join(String(vars[name]));
  });
  return text;
}

// The language localize() uses, as the BCP 47 tag Intl expects
const language = (): string => {
  try {
    return (localStorage.getItem('selectedLanguage') || 'en').replace(/['"]+/g, '');
  } catch (e) {
    return 'en';
  }
};

// Not in the es2017 lib this project compiles against
const intl = Intl as unknown as {
  PluralRules?: new (locale: string) => { select(count: number): string };
  ListFormat?: new (locale: string, options: { type: string }) => { format(items: string[]): string };
};

const english = (key: string): unknown =>
  key.split('.').reduce<unknown>((obj, part) => (obj as Record<string, unknown> | undefined)?.[part], en);

/**
 * Picks the `_one`, `_few`, `_many` or `_other` variant of `key` for the
 * active language. The English fallback only has `_one` and `_other`.
 */
export function trCount(key: string, count: number, vars: Record<string, string | number> = {}): string {
  let category: string | undefined;
  try {
    category = intl.PluralRules ? new intl.PluralRules(language()).select(count) : undefined;
  } catch (e) {
    category = undefined;
  }
  const own = category ? translate(`${key}_${category}`) : undefined;
  const useOwn = own !== undefined && own !== english(`${key}_${category}`);
  return tr(useOwn ? `${key}_${category}` : `${key}_${count === 1 ? 'one' : 'other'}`, { count, ...vars });
}

export function formatList(items: string[]): string {
  try {
    return intl.ListFormat ? new intl.ListFormat(language(), { type: 'conjunction' }).format(items) : items.join(', ');
  } catch (e) {
    return items.join(', ');
  }
}

export type CommonString = 'back' | 'delete' | 'add' | 'cancel' | 'edit' | 'remove' | 'undo';

const COMMON_FALLBACK: Record<CommonString, string> = {
  back: 'Back',
  delete: 'Delete',
  add: 'Add',
  cancel: 'Cancel',
  edit: 'Edit',
  remove: 'Remove',
  undo: 'Undo',
};

export function common(hass: HomeAssistant | undefined, key: CommonString): string {
  return hass?.localize?.(`ui.common.${key}`) || COMMON_FALLBACK[key];
}

export const nodeType = (node: Node): NodeType => node.type ?? 'entity';

export const nodeEntityId = (node: Node): string => node.entity_id || node.id;

export function typeLabel(type: NodeType): string {
  return tr(`editor.entity_types.${type}`);
}

export function nodeStateObj(hass: HomeAssistant | undefined, node: Node): HassEntity | undefined {
  return readsEntity(node.type) ? hass?.states[nodeEntityId(node)] : undefined;
}

export function nodeName(hass: HomeAssistant | undefined, node: Node | undefined, fallback = ''): string {
  if (!node) return fallback;
  return computeEntityName(hass, nodeStateObj(hass, node), node.name) || node.id;
}

export function isMissingEntity(hass: HomeAssistant | undefined, node: Node): boolean {
  if (!hass || !readsEntity(node.type)) return false;
  // a carbon node's id is usually synthetic: it reads its source entities instead
  if (isCarbonNodeType(node.type)) return !resolveCarbonSources(node, hass).some(id => hass.states[id]);
  return !hass.states[nodeEntityId(node)];
}

export function sectionLabel(index: number): string {
  return tr('editor.section_n', { n: index + 1 });
}

const RAINBOW = 'conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)';

/** CSS background for the color swatch of a node. */
export function nodeSwatch(node: Node): string {
  const { color } = node;
  if (!color) return 'var(--primary-color)';
  if (typeof color === 'string') return color === 'random' ? RAINBOW : color;
  const colors = Object.keys(color);
  if (colors.length === 1) return colors[0];
  return colors.length ? `linear-gradient(90deg, ${colors.join(', ')})` : 'var(--primary-color)';
}

export function renderNodeIcon(hass: HomeAssistant, node: Node): TemplateResult {
  if (node.icon) {
    return html`<ha-icon class="node-icon" .icon=${node.icon}></ha-icon>`;
  }
  if (isMissingEntity(hass, node)) {
    return html`<ha-icon class="node-icon missing" .icon=${'mdi:alert-circle-outline'}></ha-icon>`;
  }
  const stateObj = nodeStateObj(hass, node);
  if (stateObj) {
    return customElements.get('ha-state-icon')
      ? html`<ha-state-icon class="node-icon" .hass=${hass} .stateObj=${stateObj}></ha-state-icon>`
      : html`<ha-icon class="node-icon" .icon=${stateIcon(stateObj)}></ha-icon>`;
  }
  return html`<ha-icon class="node-icon" .icon=${TYPE_ICONS[nodeType(node)]}></ha-icon>`;
}

export function memoizeOne<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let lastArgs: A | undefined;
  let lastResult: R;
  return (...args: A): R => {
    if (lastArgs && lastArgs.length === args.length && lastArgs.every((arg, i) => arg === args[i])) {
      return lastResult;
    }
    lastArgs = args;
    lastResult = fn(...args);
    return lastResult;
  };
}

/** The keys whose values differ between the data given to ha-form and the value it reports. */
export function changedKeys(data: Record<string, unknown>, value: Record<string, unknown>, keys?: string[]): string[] {
  const all = keys ?? Array.from(new Set([...Object.keys(data), ...Object.keys(value)]));
  return all.filter(key => !deepEqual(data[key], value[key]));
}

export const isEmptyValue = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
