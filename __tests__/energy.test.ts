import { HomeAssistant } from 'custom-card-helpers';
import { getEnergyDataCollection } from '../src/energy';

const mockCollection = () => ({ subscribe: jest.fn() });

const createHass = (connectionKeys: Record<string, any>, panelUrl = 'energy') =>
  ({
    connection: connectionKeys,
    panelUrl,
  } as unknown as HomeAssistant);

describe('getEnergyDataCollection', () => {
  it('returns panel-specific collection by default (HA 2026.4+)', () => {
    const collection = mockCollection();
    const hass = createHass({ '_energy_energy': collection }, 'energy');
    expect(getEnergyDataCollection(hass)).toBe(collection);
  });

  it('prefers panel-specific key over other _energy* keys', () => {
    const correct = mockCollection();
    const wrong = mockCollection();
    const hass = createHass({
      '_energy_other-dashboard': wrong,
      '_energy_my-dashboard': correct,
    }, 'my-dashboard');
    expect(getEnergyDataCollection(hass)).toBe(correct);
  });

  it('falls back to legacy _energy key', () => {
    const collection = mockCollection();
    const hass = createHass({ '_energy': collection }, 'energy');
    expect(getEnergyDataCollection(hass)).toBe(collection);
  });

  it('falls back to prefix scan when panel and legacy keys miss', () => {
    const collection = mockCollection();
    const hass = createHass({ '_energy_some-other-panel': collection }, 'different-panel');
    expect(getEnergyDataCollection(hass)).toBe(collection);
  });

  it('returns null when no collection exists', () => {
    const hass = createHass({}, 'energy');
    expect(getEnergyDataCollection(hass)).toBeNull();
  });

  it('returns explicit collectionKey when found', () => {
    const collection = mockCollection();
    const hass = createHass({ '_energy_my-dashboard': collection }, 'energy');
    expect(getEnergyDataCollection(hass, '_energy_my-dashboard')).toBe(collection);
  });

  it('returns null when explicit collectionKey is not found', () => {
    const hass = createHass({ '_energy_other': mockCollection() }, 'energy');
    expect(getEnergyDataCollection(hass, '_energy_missing')).toBeNull();
  });

  it('explicit collectionKey bypasses auto-detection', () => {
    const panelCollection = mockCollection();
    const explicitCollection = mockCollection();
    const hass = createHass({
      '_energy_energy': panelCollection,
      '_energy_custom': explicitCollection,
    }, 'energy');
    expect(getEnergyDataCollection(hass, '_energy_custom')).toBe(explicitCollection);
  });

  it('skips objects without subscribe method', () => {
    const hass = createHass({
      '_energy_energy': { notSubscribe: jest.fn() },
      '_energy': { data: 'something' },
    }, 'energy');
    expect(getEnergyDataCollection(hass)).toBeNull();
  });
});
