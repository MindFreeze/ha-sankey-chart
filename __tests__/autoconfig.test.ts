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

  it('creates grid export entity for new format with stat_energy_to', async () => {
    hass.states['sensor.grid_out'] = { entity_id: 'sensor.grid_out', state: '3' } as any;
    (getEnergyPreferences as jest.Mock).mockResolvedValue({
      energy_sources: [
        { type: 'grid', stat_energy_from: 'sensor.grid_in', stat_energy_to: 'sensor.grid_out' },
        { type: 'solar', stat_energy_from: 'sensor.solar' },
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
    const gridExport = config.nodes.find((n: { id: string }) => n.id === 'sensor.grid_out');
    expect(gridExport).toBeDefined();
    expect(gridExport.subtract_entities).toEqual(['sensor.grid_in']);
    // all source entities should link to grid export
    const sourceNodes = config.nodes.filter((n: { id: string }) => ['sensor.grid_in', 'sensor.solar'].includes(n.id));
    sourceNodes.forEach((n: { id: string }) => {
      const link = config.links.find((l: { source: string; target: string }) => l.source === n.id && l.target === 'sensor.grid_out');
      expect(link).toBeDefined();
    });
  });

  it('creates grid export entity for old format with flow_to', async () => {
    hass.states['sensor.grid_out'] = { entity_id: 'sensor.grid_out', state: '3' } as any;
    (getEnergyPreferences as jest.Mock).mockResolvedValue({
      energy_sources: [
        {
          type: 'grid',
          flow_from: [{ stat_energy_from: 'sensor.grid_in' }],
          flow_to: [{ stat_energy_to: 'sensor.grid_out' }],
        },
        { type: 'solar', stat_energy_from: 'sensor.solar' },
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
    const gridExport = config.nodes.find((n: { id: string }) => n.id === 'sensor.grid_out');
    expect(gridExport).toBeDefined();
    expect(gridExport.subtract_entities).toEqual(['sensor.grid_in']);
    // all source entities should link to grid export
    const sourceNodes = config.nodes.filter((n: { id: string }) => ['sensor.grid_in', 'sensor.solar'].includes(n.id));
    sourceNodes.forEach((n: { id: string }) => {
      const link = config.links.find((l: { source: string; target: string }) => l.source === n.id && l.target === 'sensor.grid_out');
      expect(link).toBeDefined();
    });
  });

  it('removes subtract_entities with net_flows: false', async () => {
    hass.states['sensor.grid_out'] = { entity_id: 'sensor.grid_out', state: '3' } as any;
    sankeyChart.setConfig({ ...DEFAULT_CONFIG, autoconfig: { net_flows: false } }, true);
    (getEnergyPreferences as jest.Mock).mockResolvedValue({
      energy_sources: [
        { type: 'grid', stat_energy_from: 'sensor.grid_in', stat_energy_to: 'sensor.grid_out' },
        { type: 'solar', stat_energy_from: 'sensor.solar' },
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
    const gridExport = config.nodes.find((n: { id: string }) => n.id === 'sensor.grid_out');
    expect(gridExport).toBeDefined();
    expect(gridExport.subtract_entities).toBeUndefined();
    const gridImport = config.nodes.find((n: { id: string }) => n.id === 'sensor.grid_in');
    expect(gridImport.subtract_entities).toBeUndefined();
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

    // Check V4 format (nodes and links)
    expect(Array.isArray(config.nodes)).toBe(true);
    expect(config.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(config.links)).toBe(true);
    expect(config.links.length).toBeGreaterThan(0);

    // Check nodes contain expected entities
    const allNodeIds = config.nodes.map((n: { id: string }) => n.id);
    expect(allNodeIds).toContain('sensor.grid_in');
    expect(allNodeIds).toContain('sensor.solar');
    expect(allNodeIds).toContain('sensor.battery_in');
    expect(allNodeIds).toContain('sensor.device1');

    // Check sections are calculated from nodes
    expect(Array.isArray(config.sections)).toBe(true);
    expect(config.sections.length).toBeGreaterThan(0);
    const allEntities = config.sections.flatMap((s: { entities: { id: string }[] }) => s.entities.map((e: { id: string }) => e.id));
    expect(allEntities).toContain('sensor.grid_in');
    expect(allEntities).toContain('sensor.solar');
    expect(allEntities).toContain('sensor.battery_in');
    expect(allEntities).toContain('sensor.device1');
  });

  describe('floor/area ordering (issue #341)', () => {
    const setupFloorAreaFixture = () => {
      hass.states['sensor.device2'] = { entity_id: 'sensor.device2', state: '4' } as any;
      hass.states['sensor.device3'] = { entity_id: 'sensor.device3', state: '5' } as any;
      hass.areas = {
        kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground' },
        bedroom: { area_id: 'bedroom', name: 'Bedroom', floor_id: 'first' },
        attic_room: { area_id: 'attic_room', name: 'Attic Room', floor_id: 'top' },
      };
    };

    it('sorts floors by level DESC', async () => {
      setupFloorAreaFixture();
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.device1' },
          { stat_consumption: 'sensor.device2' },
          { stat_consumption: 'sensor.device3' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        kitchen: { area: hass.areas.kitchen, entities: ['sensor.device1'] },
        bedroom: { area: hass.areas.bedroom, entities: ['sensor.device2'] },
        attic_room: { area: hass.areas.attic_room, entities: ['sensor.device3'] },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([
        { floor_id: 'ground', name: 'Ground', level: 0 },
        { floor_id: 'first', name: 'First', level: 1 },
        { floor_id: 'top', name: 'Top', level: 3 },
      ]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      const floorNodes = config.nodes.filter((n: { id: string }) => ['ground', 'first', 'top'].includes(n.id));
      expect(floorNodes.map((n: { id: string }) => n.id)).toEqual(['top', 'first', 'ground']);
    });

    it('skips floors with no devices', async () => {
      setupFloorAreaFixture();
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [{ stat_consumption: 'sensor.device1' }],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        kitchen: { area: hass.areas.kitchen, entities: ['sensor.device1'] },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([
        { floor_id: 'ground', name: 'Ground', level: 0 },
        { floor_id: 'first', name: 'First', level: 1 },
        { floor_id: 'top', name: 'Top', level: 3 },
      ]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      const nodeIds = config.nodes.map((n: { id: string }) => n.id);
      expect(nodeIds).toContain('ground');
      expect(nodeIds).not.toContain('first');
      expect(nodeIds).not.toContain('top');
    });

    it('preserves device-encounter order for areas within a floor', async () => {
      hass.states['sensor.device2'] = { entity_id: 'sensor.device2', state: '4' } as any;
      hass.states['sensor.device3'] = { entity_id: 'sensor.device3', state: '5' } as any;
      hass.areas = {
        area_a: { area_id: 'area_a', name: 'Area A', floor_id: 'ground' },
        area_b: { area_id: 'area_b', name: 'Area B', floor_id: 'ground' },
      };
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.device1' },
          { stat_consumption: 'sensor.device2' },
          { stat_consumption: 'sensor.device3' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        area_b: { area: hass.areas.area_b, entities: ['sensor.device2'] },
        area_a: { area: hass.areas.area_a, entities: ['sensor.device1', 'sensor.device3'] },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([
        { floor_id: 'ground', name: 'Ground', level: 0 },
      ]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      const areaNodes = config.nodes.filter((n: { id: string }) => ['area_a', 'area_b'].includes(n.id));
      // device1 (area_a) comes before device2 (area_b) in device_consumption,
      // so area_a must render first.
      expect(areaNodes.map((n: { id: string }) => n.id)).toEqual(['area_a', 'area_b']);
    });

    it('unshifts no-floor areas into reverse-encounter order', async () => {
      hass.states['sensor.device2'] = { entity_id: 'sensor.device2', state: '4' } as any;
      hass.states['sensor.device3'] = { entity_id: 'sensor.device3', state: '5' } as any;
      hass.areas = {
        area_x: { area_id: 'area_x', name: 'Area X', floor_id: null },
        area_y: { area_id: 'area_y', name: 'Area Y', floor_id: null },
        kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground' },
      };
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.device1' },
          { stat_consumption: 'sensor.device2' },
          { stat_consumption: 'sensor.device3' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        area_x: { area: hass.areas.area_x, entities: ['sensor.device1'] },
        area_y: { area: hass.areas.area_y, entities: ['sensor.device2'] },
        kitchen: { area: hass.areas.kitchen, entities: ['sensor.device3'] },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([
        { floor_id: 'ground', name: 'Ground', level: 0 },
      ]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      // area_x is encountered first, then area_y. Both are unshifted onto
      // floorsMap.no_floor.areas, so area_y ends up first.
      const areaNodes = config.nodes.filter((n: { id: string }) =>
        ['area_x', 'area_y', 'kitchen'].includes(n.id),
      );
      // kitchen is under a real floor (ground); area_y / area_x are under no_floor
      // and render after the real floor's areas.
      expect(areaNodes.map((n: { id: string }) => n.id)).toEqual(['kitchen', 'area_y', 'area_x']);
    });

    it('links areas directly to total when no floor has devices', async () => {
      hass.states['sensor.device2'] = { entity_id: 'sensor.device2', state: '4' } as any;
      hass.areas = {
        area1: { area_id: 'area1', name: 'Area 1', floor_id: null },
        area2: { area_id: 'area2', name: 'Area 2', floor_id: null },
      };
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.device1' },
          { stat_consumption: 'sensor.device2' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        area1: { area: hass.areas.area1, entities: ['sensor.device1'] },
        area2: { area: hass.areas.area2, entities: ['sensor.device2'] },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      // No floor nodes when every area is orphan.
      expect(config.nodes.find((n: { id: string }) => n.id === 'ground')).toBeUndefined();
      const area1Link = config.links.find(
        (l: { source: string; target: string }) => l.source === 'total' && l.target === 'area1',
      );
      const area2Link = config.links.find(
        (l: { source: string; target: string }) => l.source === 'total' && l.target === 'area2',
      );
      expect(area1Link).toBeDefined();
      expect(area2Link).toBeDefined();
    });

    it('does not emit a No area node and links its entities directly to the floor', async () => {
      hass.states['sensor.orphan1'] = { entity_id: 'sensor.orphan1', state: '2' } as any;
      hass.areas = {
        kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground' },
      };
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.device1' },
          { stat_consumption: 'sensor.orphan1' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        kitchen: { area: hass.areas.kitchen, entities: ['sensor.device1'] },
        no_area: {
          area: { area_id: 'no_area', name: 'No area' },
          entities: ['sensor.orphan1'],
        },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([
        { floor_id: 'ground', name: 'Ground', level: 0 },
      ]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      // No "No area" node should exist.
      expect(config.nodes.find((n: { id: string }) => n.id === 'no_area')).toBeUndefined();
      // The orphan entity must be reachable via a chain starting at 'total'.
      // autoRouteCrossGapLinks may have rewritten total -> orphan1 into a
      // passthrough chain, so the final hop into the entity is what matters.
      const orphanIncoming = config.links.find(
        (l: { source: string; target: string }) => l.target === 'sensor.orphan1',
      );
      expect(orphanIncoming).toBeDefined();
      // And no link should target an intermediate 'no_area' node.
      const noAreaLinks = config.links.filter(
        (l: { source: string; target: string }) => l.source === 'no_area' || l.target === 'no_area',
      );
      expect(noAreaLinks).toEqual([]);
    });

    it('links no_area entities to their floor, not an area node', async () => {
      hass.states['sensor.device2'] = { entity_id: 'sensor.device2', state: '4' } as any;
      hass.areas = {
        kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground' },
      };
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.device1' }, // in kitchen on ground
          { stat_consumption: 'sensor.device2' }, // no area, no floor
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        kitchen: { area: hass.areas.kitchen, entities: ['sensor.device1'] },
        no_area: {
          area: { area_id: 'no_area', name: 'No area' },
          entities: ['sensor.device2'],
        },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([
        { floor_id: 'ground', name: 'Ground', level: 0 },
      ]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      // device2 (in no_area under no_floor) must be reachable from 'total'.
      // The direct link may have been rewritten into a passthrough chain by
      // autoRouteCrossGapLinks, so assert on the incoming hop into device2.
      const device2Incoming = config.links.find(
        (l: { source: string; target: string }) => l.target === 'sensor.device2',
      );
      expect(device2Incoming).toBeDefined();
    });

    it('emits parent→child links for every included_in_stat relationship, even in mixed-depth hierarchies', async () => {
      // Same shape as the "top-level parents leftmost" test, but here we
      // assert that every parent→child relationship appears as a link (or
      // as a passthrough chain ending at the child), including the shallow
      // hierarchy whose leaf lives two sections to the right of its parent.
      hass.states['sensor.shallow_top'] = { entity_id: 'sensor.shallow_top', state: '2' } as any;
      hass.states['sensor.shallow_leaf'] = { entity_id: 'sensor.shallow_leaf', state: '1' } as any;
      hass.states['sensor.deep_top'] = { entity_id: 'sensor.deep_top', state: '4' } as any;
      hass.states['sensor.deep_mid'] = { entity_id: 'sensor.deep_mid', state: '3' } as any;
      hass.states['sensor.deep_leaf'] = { entity_id: 'sensor.deep_leaf', state: '2' } as any;
      hass.areas = {};
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.shallow_top' },
          { stat_consumption: 'sensor.shallow_leaf', included_in_stat: 'sensor.shallow_top' },
          { stat_consumption: 'sensor.deep_top' },
          { stat_consumption: 'sensor.deep_mid', included_in_stat: 'sensor.deep_top' },
          { stat_consumption: 'sensor.deep_leaf', included_in_stat: 'sensor.deep_mid' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({});
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      // shallow_top -> shallow_leaf: shallow_leaf sits in the last device
      // section, but shallow_top is in the first, so the link may have been
      // rewritten via a passthrough chain. Assert the chain exists by walking
      // outgoing links from shallow_top until we reach shallow_leaf.
      const nodeById: Record<string, { id: string; type?: string }> = Object.fromEntries(
        config.nodes.map((n: { id: string; type?: string }) => [n.id, n]),
      );
      const reaches = (source: string, target: string): boolean => {
        const seen = new Set<string>();
        const stack = [source];
        while (stack.length) {
          const cur = stack.pop()!;
          if (seen.has(cur)) continue;
          seen.add(cur);
          const outgoing = config.links.filter(
            (l: { source: string; target: string }) => l.source === cur,
          );
          for (const l of outgoing) {
            if (l.target === target) return true;
            // follow passthroughs
            if (nodeById[l.target]?.type === 'passthrough') stack.push(l.target);
          }
        }
        return false;
      };
      expect(reaches('sensor.shallow_top', 'sensor.shallow_leaf')).toBe(true);
      expect(reaches('sensor.deep_top', 'sensor.deep_mid')).toBe(true);
      expect(reaches('sensor.deep_mid', 'sensor.deep_leaf')).toBe(true);
    });

    it('places all top-level parent devices in the leftmost device column regardless of subtree depth', async () => {
      // Two hierarchies of different depth:
      //   Shallow: shallow_top -> shallow_leaf
      //   Deep:    deep_top -> deep_mid -> deep_leaf
      // Both top-level parents (shallow_top, deep_top) must share the leftmost
      // device section; deep_mid occupies the middle; the leaves share the
      // rightmost. This matches HA's layout — our previous implementation
      // pushed shallow_top one column to the right of deep_top.
      hass.states['sensor.shallow_top'] = { entity_id: 'sensor.shallow_top', state: '2' } as any;
      hass.states['sensor.shallow_leaf'] = { entity_id: 'sensor.shallow_leaf', state: '1' } as any;
      hass.states['sensor.deep_top'] = { entity_id: 'sensor.deep_top', state: '4' } as any;
      hass.states['sensor.deep_mid'] = { entity_id: 'sensor.deep_mid', state: '3' } as any;
      hass.states['sensor.deep_leaf'] = { entity_id: 'sensor.deep_leaf', state: '2' } as any;
      hass.areas = {};
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.shallow_top' },
          { stat_consumption: 'sensor.shallow_leaf', included_in_stat: 'sensor.shallow_top' },
          { stat_consumption: 'sensor.deep_top' },
          { stat_consumption: 'sensor.deep_mid', included_in_stat: 'sensor.deep_top' },
          { stat_consumption: 'sensor.deep_leaf', included_in_stat: 'sensor.deep_mid' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({});
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      const sectionOf = (id: string) =>
        config.nodes.find((n: { id: string }) => n.id === id)?.section;

      const shallowTopSec = sectionOf('sensor.shallow_top');
      const deepTopSec = sectionOf('sensor.deep_top');
      const deepMidSec = sectionOf('sensor.deep_mid');
      const shallowLeafSec = sectionOf('sensor.shallow_leaf');
      const deepLeafSec = sectionOf('sensor.deep_leaf');

      expect(shallowTopSec).toBe(deepTopSec);
      expect(deepMidSec).toBe(deepTopSec + 1);
      expect(deepLeafSec).toBe(deepMidSec + 1);
      expect(shallowLeafSec).toBe(deepLeafSec);
    });

    it('inserts passthrough nodes for cross-gap links (no_area device jumping from total to device column)', async () => {
      // A device with no area + no floor links 'total' (section 1) straight
      // to the device (section 4 or 5). Without passthroughs the chart can't
      // render the gradients between intermediate columns.
      hass.states['sensor.orphan'] = { entity_id: 'sensor.orphan', state: '2' } as any;
      hass.areas = {
        kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground' },
      };
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.device1' },
          { stat_consumption: 'sensor.orphan' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        kitchen: { area: hass.areas.kitchen, entities: ['sensor.device1'] },
        no_area: {
          area: { area_id: 'no_area', name: 'No area' },
          entities: ['sensor.orphan'],
        },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([
        { floor_id: 'ground', name: 'Ground', level: 0 },
      ]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      // A passthrough node should be inserted for the orphan device in each
      // intermediate section between total (1) and the device section.
      const passthroughs = config.nodes.filter(
        (n: { type?: string; id: string }) => n.type === 'passthrough' && n.id.includes('sensor.orphan'),
      );
      expect(passthroughs.length).toBeGreaterThan(0);

      // The original total -> sensor.orphan link must have been rewritten to
      // hop through a passthrough; no direct link should jump more than one
      // section.
      const directOrphanLink = config.links.find(
        (l: { source: string; target: string }) =>
          l.source === 'total' && l.target === 'sensor.orphan',
      );
      expect(directOrphanLink).toBeUndefined();
    });

    it('sets floor/area section sort_by to none, devices keep state', async () => {
      setupFloorAreaFixture();
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.device1' },
          { stat_consumption: 'sensor.device2' },
          { stat_consumption: 'sensor.device3' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({
        kitchen: { area: hass.areas.kitchen, entities: ['sensor.device1'] },
        bedroom: { area: hass.areas.bedroom, entities: ['sensor.device2'] },
        attic_room: { area: hass.areas.attic_room, entities: ['sensor.device3'] },
      });
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([
        { floor_id: 'ground', name: 'Ground', level: 0 },
        { floor_id: 'first', name: 'First', level: 1 },
        { floor_id: 'top', name: 'Top', level: 3 },
      ]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      // sections: [0]=sources, [1]=total, [2]=floors, [3]=areas, [4]=devices.
      expect(config.sections[2].sort_by).toBe('none');
      expect(config.sections[3].sort_by).toBe('none');
      expect(config.sections[3].sort_group_by_parent).toBe(true);
      expect(config.sections[4].sort_by).toBe('state');
      expect(config.sections[4].sort_group_by_parent).toBe(true);
    });

    it('state-sorts and groups by parent on every device section (all sections after areas)', async () => {
      hass.states['sensor.parent'] = { entity_id: 'sensor.parent', state: '5' } as any;
      hass.states['sensor.child'] = { entity_id: 'sensor.child', state: '2' } as any;
      hass.areas = {};
      (getEnergyPreferences as jest.Mock).mockResolvedValue({
        energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_in' }],
        device_consumption: [
          { stat_consumption: 'sensor.parent' },
          { stat_consumption: 'sensor.child', included_in_stat: 'sensor.parent' },
        ],
      });
      (getEntitiesByArea as jest.Mock).mockResolvedValue({});
      (fetchFloorRegistry as jest.Mock).mockResolvedValue([]);

      await (sankeyChart as any)['autoconfig']();
      const config = (sankeyChart as any).config;

      // Two device sections: [sensor.parent] and [sensor.child].
      // sections: [0]=sources, [1]=total, [2]=parents, [3]=leaves.
      expect(config.sections[2].sort_by).toBe('state');
      expect(config.sections[2].sort_group_by_parent).toBe(true);
      expect(config.sections[3].sort_by).toBe('state');
      expect(config.sections[3].sort_group_by_parent).toBe(true);
    });
  });

  it('prefers power sensors when available and in power mode', async () => {
    hass.states['sensor.grid_power_in'] = { entity_id: 'sensor.grid_power_in', state: '1000' } as any;
    hass.states['sensor.solar_power'] = { entity_id: 'sensor.solar_power', state: '500' } as any;
    hass.states['sensor.device1_power'] = { entity_id: 'sensor.device1_power', state: '300' } as any;
    sankeyChart.setConfig({ ...DEFAULT_CONFIG, autoconfig: { power: true } }, true);

    (getEnergyPreferences as jest.Mock).mockResolvedValue({
      energy_sources: [
        {
          type: 'grid',
          stat_energy_from: 'sensor.grid_in',
          stat_power_from: 'sensor.grid_power_in',
        },
        {
          type: 'solar',
          stat_energy_from: 'sensor.solar',
          stat_power_from: 'sensor.solar_power',
        },
      ],
      device_consumption: [
        {
          stat_consumption: 'sensor.device1',
          stat_power_consumption: 'sensor.device1_power',
          name: 'Device 1',
        },
      ],
    });
    (getEntitiesByArea as jest.Mock).mockResolvedValue({
      area1: { area: { area_id: 'area1', name: 'Area 1' }, entities: ['sensor.device1_power'] },
    });
    (fetchFloorRegistry as jest.Mock).mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sankeyChart as any)['autoconfig']();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (sankeyChart as any).config;

    const allNodeIds = config.nodes.map((n: { id: string }) => n.id);
    expect(allNodeIds).toContain('sensor.grid_power_in');
    expect(allNodeIds).toContain('sensor.solar_power');
    expect(allNodeIds).toContain('sensor.device1_power');
    expect(allNodeIds).not.toContain('sensor.grid_in');
    expect(allNodeIds).not.toContain('sensor.solar');
    expect(allNodeIds).not.toContain('sensor.device1');
  });

  it('prefers energy sensors when power mode is disabled', async () => {
    hass.states['sensor.grid_power_in'] = { entity_id: 'sensor.grid_power_in', state: '1000' } as any;
    sankeyChart.setConfig({ ...DEFAULT_CONFIG, autoconfig: { power: false } }, true);

    (getEnergyPreferences as jest.Mock).mockResolvedValue({
      energy_sources: [
        {
          type: 'grid',
          stat_energy_from: 'sensor.grid_in',
          stat_power_from: 'sensor.grid_power_in',
        },
      ],
      device_consumption: [],
    });
    (getEntitiesByArea as jest.Mock).mockResolvedValue({});
    (fetchFloorRegistry as jest.Mock).mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sankeyChart as any)['autoconfig']();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (sankeyChart as any).config;

    const allNodeIds = config.nodes.map((n: { id: string }) => n.id);
    expect(allNodeIds).toContain('sensor.grid_in');
    expect(allNodeIds).not.toContain('sensor.grid_power_in');
  });
});
