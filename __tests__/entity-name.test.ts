import type { HomeAssistant } from 'custom-card-helpers';
import type { HassEntity } from 'home-assistant-js-websocket';
import {
  computeEntityName,
  entityNamesChanged,
  entityStateNamesChanged,
  supportsEntityNameSelector,
} from '../src/entity-name';
import { computeSchema } from '../src/editor/entity';
import type { NodeConfigForEditor } from '../src/types';

const state = {
  entity_id: 'sensor.temperature',
  state: '21',
  attributes: { friendly_name: 'Temperature' },
} as HassEntity;

const hass = (version: string, formatEntityName?: jest.Mock): HomeAssistant =>
  ({ config: { version }, formatEntityName } as unknown) as HomeAssistant;

describe('entity name compatibility', () => {
  it('only enables the selector when the formatter is available', () => {
    expect(supportsEntityNameSelector(hass('2026.3'))).toBe(false);
    expect(supportsEntityNameSelector(hass('2026.4'))).toBe(true);
    expect(supportsEntityNameSelector(hass('2026.4.1'))).toBe(true);
    expect(supportsEntityNameSelector(hass('2026.4.1-beta'))).toBe(true);
    expect(supportsEntityNameSelector(hass(''))).toBe(false);
  });

  it('keeps structured names on the friendly-name fallback before 2026.4', () => {
    const formatEntityName = jest.fn();
    expect(computeEntityName(hass('2026.3', formatEntityName), state, { type: 'entity' })).toBe('Temperature');
    expect(formatEntityName).not.toHaveBeenCalled();
  });

  it('passes structured names to the formatter from 2026.4 onward', () => {
    const formatEntityName = jest.fn().mockReturnValue('Indoor temperature');
    const name = [{ type: 'parent_device' as const }, { type: 'entity' as const }];
    expect(computeEntityName(hass('2026.4', formatEntityName), state, name)).toBe('Indoor temperature');
    expect(formatEntityName).toHaveBeenCalledWith(state, name);
  });

  it('treats an empty configured name as the default name', () => {
    const formatEntityName = jest.fn().mockReturnValue('Temperature');
    expect(computeEntityName(hass('2026.4', formatEntityName), state, '')).toBe('Temperature');
    expect(formatEntityName).toHaveBeenCalledWith(state, undefined);
  });

  it('falls back when the formatter is missing', () => {
    expect(computeEntityName(hass('2026.4'), state, undefined)).toBe('Temperature');
  });
});

describe('entity name update detection', () => {
  it('detects registry source replacement', () => {
    const oldHass = hass('2026.4') as HomeAssistant & { areas: object };
    const newHass = { ...oldHass, areas: {} };
    expect(entityNamesChanged(oldHass, newHass)).toBe(true);
    expect(entityNamesChanged(oldHass, oldHass)).toBe(false);
  });

  it('detects friendly-name changes for chart entities', () => {
    const oldStates = { 'sensor.temperature': state };
    const newStates = {
      'sensor.temperature': { ...state, attributes: { friendly_name: 'Indoor temperature' } },
    };
    expect(entityStateNamesChanged(oldStates, newStates, ['sensor.temperature'])).toBe(true);
    expect(entityStateNamesChanged(oldStates, oldStates, ['sensor.temperature'])).toBe(false);
  });
});

describe('entity editor name selector', () => {
  it('uses the actual entity for aliased nodes and keeps synthetic nodes textual', () => {
    const realNode = { id: 'sensor.alias', entity_id: 'sensor.temperature', type: 'entity' as const };
    const syntheticNode = { id: 'other', type: 'remaining_parent_state' as const };
    const realName = (computeSchema(hass('2026.4'), realNode, '') as any[]).find(item => item.name === 'name');
    const syntheticName = (computeSchema(hass('2026.4'), syntheticNode, '') as any[]).find(item => item.name === 'name');

    expect(realName.context).toEqual({ entity: 'entity_id' });
    expect(realName.selector).toEqual({ entity_name: {} });
    expect(syntheticName.selector).toEqual({ text: {} });
  });

  it('keeps the text editor on Home Assistant versions without entity names', () => {
    const node: NodeConfigForEditor = { id: 'sensor.temperature', type: 'entity' };
    const name = (computeSchema(hass('2026.3'), node, '') as any[]).find(item => item.name === 'name');
    expect(name.selector).toEqual({ text: {} });
  });
});
