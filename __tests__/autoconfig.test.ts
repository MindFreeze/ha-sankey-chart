import SankeyChart from '../src/ha-sankey-chart';
import { HomeAssistantReal } from '../src/hass';

// Mock dependencies
jest.mock('../src/energy', () => ({
  ...jest.requireActual('../src/energy'),
  getEnergyPreferences: jest.fn(),
  getEnergySourceColor: (type: string) => `color-for-${type}`,
}));
jest.mock('../src/hass', () => ({
  ...jest.requireActual('../src/hass'),
  getEntitiesByArea: jest.fn(),
  fetchFloorRegistry: jest.fn(),
}));

import { getEnergyPreferences } from '../src/energy';
import { getEntitiesByArea, fetchFloorRegistry } from '../src/hass';
import { DEFAULT_CONFIG } from '../src/types';

describe('SankeyChart autoconfig', () => {
  let sankeyChart: SankeyChart;
  let hass: HomeAssistantReal;

  beforeEach(() => {
    sankeyChart = new SankeyChart();
    hass = ({
      states: {
        'sensor.grid_in': { entity_id: 'sensor.grid_in', state: '10' },
        'sensor.solar': { entity_id: 'sensor.solar', state: '5' },
        'sensor.battery_in': { entity_id: 'sensor.battery_in', state: '2' },
        'sensor.device1': { entity_id: 'sensor.device1', state: '3' },
      },
      areas: {
        'area1': { area_id: 'area1', name: 'Area 1' },
      },
    } as unknown) as HomeAssistantReal;
    sankeyChart.hass = hass;
    sankeyChart.setConfig({ ...DEFAULT_CONFIG, autoconfig: {} }, true);
  });

  it('creates sections from energy preferences', async () => {
    (getEnergyPreferences as jest.Mock).mockResolvedValue({
      energy_sources: [
        { type: 'grid', stat_energy_from: 'sensor.grid_in' },
        { type: 'solar', stat_energy_from: 'sensor.solar' },
        { type: 'battery', stat_energy_from: 'sensor.battery_in', stat_energy_to: 'sensor.battery_out' },
      ],
      device_consumption: [
        { stat_consumption: 'sensor.device1', name: 'Device 1' },
      ],
    });
    (getEntitiesByArea as jest.Mock).mockResolvedValue({
      area1: { area: { area_id: 'area1', name: 'Area 1' }, entities: ['sensor.device1'] },
    });
    (fetchFloorRegistry as jest.Mock).mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sankeyChart as any)['autoconfig']();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (sankeyChart as any).config;
    expect(Array.isArray(config.sections)).toBe(true);
    expect(config.sections.length).toBeGreaterThan(0);
    const allEntities = config.sections.flatMap((s: { entities: { entity_id: string }[] }) => s.entities.map((e: { entity_id: string }) => e.entity_id));
    expect(allEntities).toContain('sensor.grid_in');
    expect(allEntities).toContain('sensor.solar');
    expect(allEntities).toContain('sensor.battery_in');
    expect(allEntities).toContain('sensor.device1');
  });
}); 