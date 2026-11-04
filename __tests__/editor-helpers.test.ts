import { HomeAssistant } from 'custom-card-helpers';
import { isMissingEntity } from '../src/editor/helpers';
import type { Node } from '../src/types';

const hass = { states: { 'sensor.grid': { entity_id: 'sensor.grid', state: '1', attributes: {} } } } as unknown as HomeAssistant;

describe('isMissingEntity', () => {
  it('checks the entity a node reads', () => {
    expect(isMissingEntity(hass, { id: 'sensor.grid' })).toBe(false);
    expect(isMissingEntity(hass, { id: 'sensor.gone' })).toBe(true);
    expect(isMissingEntity(hass, { id: 'grid_copy', entity_id: 'sensor.grid' })).toBe(false);
    expect(isMissingEntity(hass, { id: 'total', type: 'remaining_parent_state' })).toBe(false);
  });

  it('checks the sources of a carbon node, whose id is synthetic', () => {
    const carbon = (node: Partial<Node>): Node => ({ id: 'grid_low_carbon', type: 'low_carbon_energy', ...node });
    expect(isMissingEntity(hass, carbon({ add_entities: ['sensor.grid'] }))).toBe(false);
    expect(isMissingEntity(hass, carbon({ entity_id: 'sensor.grid' }))).toBe(false);
    expect(isMissingEntity(hass, carbon({ add_entities: ['sensor.gone'] }))).toBe(true);
    expect(isMissingEntity(hass, carbon({}))).toBe(true);
  });
});
