import { HomeAssistant } from 'custom-card-helpers';
import { getCarbonNodeStates, getEnergyDataCollection, resolveCarbonSources } from '../src/energy';

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

describe('resolveCarbonSources', () => {
  const hass = { states: { 'sensor.grid': {} } } as unknown as HomeAssistant;

  it('uses entity_id when set', () => {
    expect(
      resolveCarbonSources({ id: 'low_carbon', entity_id: 'sensor.grid' }, hass),
    ).toEqual(['sensor.grid']);
  });

  it('combines entity_id with add_entities', () => {
    expect(
      resolveCarbonSources(
        { id: 'low_carbon', entity_id: 'sensor.grid', add_entities: ['sensor.grid2'] },
        hass,
      ),
    ).toEqual(['sensor.grid', 'sensor.grid2']);
  });

  it('falls back to id when id is a real entity', () => {
    expect(
      resolveCarbonSources({ id: 'sensor.grid' }, hass),
    ).toEqual(['sensor.grid']);
  });

  it('returns add_entities alone when neither entity_id nor real id', () => {
    expect(
      resolveCarbonSources({ id: 'low_carbon', add_entities: ['sensor.grid'] }, hass),
    ).toEqual(['sensor.grid']);
  });
});

describe('getCarbonNodeStates', () => {
  const range = { start: new Date('2026-05-01T00:00:00Z'), end: new Date('2026-05-02T00:00:00Z') };

  const createMockHass = (statsByEntity: Record<string, number>, fossilByEntity: Record<string, number>) => {
    const callWS = jest.fn(async (call: any) => {
      if (call.type === 'recorder/statistics_during_period') {
        const out: Record<string, any> = {};
        for (const id of call.statistic_ids) {
          out[id] = [{ start: 0, end: 1, change: statsByEntity[id] ?? 0 }];
        }
        return out;
      }
      if (call.type === 'energy/fossil_energy_consumption') {
        const sum = call.energy_statistic_ids.reduce(
          (acc: number, id: string) => acc + (fossilByEntity[id] ?? 0),
          0,
        );
        return { '2026-05-01T00:00:00Z': sum };
      }
      throw new Error('unexpected call: ' + call.type);
    });
    return { callWS } as unknown as HomeAssistant;
  };

  it('returns fossil sum for high_carbon_energy nodes', async () => {
    const hass = createMockHass({ 'sensor.grid': 30 }, { 'sensor.grid': 10 });
    const result = await getCarbonNodeStates(
      hass,
      range,
      [{ nodeId: 'high', type: 'high_carbon_energy', sourceEntityIds: ['sensor.grid'] }],
      'sensor.co2',
    );
    expect(result).toEqual({ high: 10 });
  });

  it('returns total - fossil for low_carbon_energy nodes', async () => {
    const hass = createMockHass({ 'sensor.grid': 30 }, { 'sensor.grid': 10 });
    const result = await getCarbonNodeStates(
      hass,
      range,
      [{ nodeId: 'low', type: 'low_carbon_energy', sourceEntityIds: ['sensor.grid'] }],
      'sensor.co2',
    );
    expect(result).toEqual({ low: 20 });
  });

  it('sums multi-source totals and fossil portions', async () => {
    const hass = createMockHass(
      { 'sensor.grid_a': 20, 'sensor.grid_b': 10 },
      { 'sensor.grid_a': 6, 'sensor.grid_b': 2 },
    );
    const result = await getCarbonNodeStates(
      hass,
      range,
      [{ nodeId: 'low', type: 'low_carbon_energy', sourceEntityIds: ['sensor.grid_a', 'sensor.grid_b'] }],
      'sensor.co2',
    );
    // total 30 − fossil 8 = 22
    expect(result).toEqual({ low: 22 });
  });

  it('clamps low-carbon at 0 when fossil exceeds total (data inconsistency)', async () => {
    const hass = createMockHass({ 'sensor.grid': 5 }, { 'sensor.grid': 10 });
    const result = await getCarbonNodeStates(
      hass,
      range,
      [{ nodeId: 'low', type: 'low_carbon_energy', sourceEntityIds: ['sensor.grid'] }],
      'sensor.co2',
    );
    expect(result).toEqual({ low: 0 });
  });

  it('throws when co2 entity is missing', async () => {
    const hass = createMockHass({}, {});
    await expect(
      getCarbonNodeStates(
        hass,
        range,
        [{ nodeId: 'low', type: 'low_carbon_energy', sourceEntityIds: ['sensor.grid'] }],
        '',
      ),
    ).rejects.toThrow(/CO2 signal entity/i);
  });

  it('returns empty when no carbon nodes provided', async () => {
    const hass = createMockHass({}, {});
    const result = await getCarbonNodeStates(hass, range, [], '');
    expect(result).toEqual({});
    expect((hass as any).callWS).not.toHaveBeenCalled();
  });
});
