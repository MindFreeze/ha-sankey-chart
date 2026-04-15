import { migrateV3Config } from '../src/migrate';
import type { V3Config } from '../src/migrate';
import { normalizeConfig } from '../src/utils';
import type { SankeyChartConfig } from '../src/types';

describe('migrateV3Config', () => {
  it('migrates a simple V3 config to V4 format', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.grid',
              children: ['sensor.home'],
            },
          ],
        },
        {
          entities: ['sensor.home'],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    // Check V4 structure
    expect(result.nodes).toBeDefined();
    expect(result.links).toBeDefined();
    expect(result.sections).toBeDefined();

    // Check nodes
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes![0]).toMatchObject({
      id: 'sensor.grid',
      section: 0,
      type: 'entity',
    });
    expect(result.nodes![1]).toMatchObject({
      id: 'sensor.home',
      section: 1,
      type: 'entity',
    });

    // Check links
    expect(result.links).toHaveLength(1);
    expect(result.links![0]).toMatchObject({
      source: 'sensor.grid',
      target: 'sensor.home',
    });

    // Check sections are config-only
    expect(result.sections).toHaveLength(2);
    expect((result.sections![0] as any).entities).toBeUndefined();
  });

  it('preserves entity properties in nodes', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.solar',
              name: 'Solar Power',
              color: 'yellow',
              icon: 'mdi:solar-power',
              children: ['sensor.total'],
            },
          ],
        },
        {
          entities: ['sensor.total'],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes![0]).toMatchObject({
      id: 'sensor.solar',
      section: 0,
      type: 'entity',
      name: 'Solar Power',
      color: 'yellow',
      icon: 'mdi:solar-power',
    });
  });

  it('migrates old color format to new range-based format', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.temp',
              color_on_state: true,
              color_limit: 25,
              color_below: 'blue',
              color_above: 'red',
            },
          ],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes![0].color).toEqual({
      'blue': { to: 25 },
      'red': { from: 25 },
    });
  });

  it('preserves simple string colors', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.grid',
              color: 'green',
            },
          ],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes![0].color).toBe('green');
  });

  it('extracts section configs without entities', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: ['sensor.a'],
          sort_by: 'state',
          sort_dir: 'desc',
          min_width: 100,
        },
        {
          entities: ['sensor.b'],
          sort_by: 'none',
          sort_group_by_parent: true,
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.sections).toHaveLength(2);
    expect(result.sections![0]).toEqual({
      sort_by: 'state',
      sort_dir: 'desc',
      min_width: 100,
      sort_group_by_parent: undefined,
    });
    expect(result.sections![1]).toEqual({
      sort_by: 'none',
      sort_dir: undefined,
      min_width: undefined,
      sort_group_by_parent: true,
    });
    // Ensure entities are not in section configs
    expect((result.sections![0] as any).entities).toBeUndefined();
    expect((result.sections![1] as any).entities).toBeUndefined();
  });

  it('creates links from children with connection entities', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.grid',
              children: [
                {
                  entity_id: 'sensor.home',
                  connection_entity_id: 'sensor.grid_to_home',
                },
              ],
            },
          ],
        },
        {
          entities: ['sensor.home'],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.links).toHaveLength(1);
    expect(result.links![0]).toEqual({
      source: 'sensor.grid',
      target: 'sensor.home',
      value: 'sensor.grid_to_home',
    });
  });

  it('handles multiple children', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.total',
              children: ['sensor.a', 'sensor.b', 'sensor.c'],
            },
          ],
        },
        {
          entities: ['sensor.a', 'sensor.b', 'sensor.c'],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.links).toHaveLength(3);
    expect(result.links).toContainEqual({ source: 'sensor.total', target: 'sensor.a', value: undefined });
    expect(result.links).toContainEqual({ source: 'sensor.total', target: 'sensor.b', value: undefined });
    expect(result.links).toContainEqual({ source: 'sensor.total', target: 'sensor.c', value: undefined });
  });

  it('handles string entities', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: ['sensor.a', 'sensor.b'],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes![0]).toMatchObject({
      id: 'sensor.a',
      section: 0,
      type: 'entity',
      name: '',
    });
    expect(result.nodes![1]).toMatchObject({
      id: 'sensor.b',
      section: 0,
      type: 'entity',
      name: '',
    });
  });

  it('preserves entity type', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.remaining',
              type: 'remaining_child_state',
              children: ['sensor.child'],
            },
          ],
        },
        {
          entities: ['sensor.child'],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes![0]).toMatchObject({
      id: 'sensor.remaining',
      section: 0,
      type: 'remaining_child_state',
    });
  });

  it('preserves add_entities and subtract_entities', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.total',
              add_entities: ['sensor.extra1', 'sensor.extra2'],
              subtract_entities: ['sensor.loss1'],
            },
          ],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes![0]).toMatchObject({
      id: 'sensor.total',
      add_entities: ['sensor.extra1', 'sensor.extra2'],
      subtract_entities: ['sensor.loss1'],
    });
  });

  it('preserves tap actions', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.grid',
              tap_action: {
                action: 'more-info',
              },
              double_tap_action: {
                action: 'toggle',
              },
            },
          ],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes![0]).toMatchObject({
      id: 'sensor.grid',
      tap_action: {
        action: 'more-info',
      },
      double_tap_action: {
        action: 'toggle',
      },
    });
  });

  it('preserves reconciliation configs', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.total',
              children_sum: {
                should_be: 'equal',
                reconcile_to: 'max',
              },
              parents_sum: {
                should_be: 'equal_or_less',
                reconcile_to: 'min',
              },
            },
          ],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes![0]).toMatchObject({
      id: 'sensor.total',
      children_sum: {
        should_be: 'equal',
        reconcile_to: 'max',
      },
      parents_sum: {
        should_be: 'equal_or_less',
        reconcile_to: 'min',
      },
    });
  });

  it('handles empty sections array', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      sections: [],
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.sections).toEqual([]);
  });

  it('handles missing sections', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
    };

    const result = migrateV3Config(v3Config);

    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.sections).toEqual([]);
  });

  it('preserves global config properties', () => {
    const v3Config: V3Config = {
      type: 'custom:sankey-chart',
      title: 'Energy Flow',
      show_states: true,
      unit_prefix: 'k',
      round: 2,
      min_state: 0.1,
      sections: [
        {
          entities: ['sensor.a'],
        },
      ],
    };

    const result = migrateV3Config(v3Config);

    expect(result).toMatchObject({
      type: 'custom:sankey-chart',
      title: 'Energy Flow',
      show_states: true,
      unit_prefix: 'k',
      round: 2,
      min_state: 0.1,
    });
  });
});

describe('normalizeConfig', () => {
  it('defaults node type to "entity" for v4 nodes without an explicit type', () => {
    const config = normalizeConfig({
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.grid', section: 0 },
        { id: 'sensor.home', section: 1 },
      ],
      links: [{ source: 'sensor.grid', target: 'sensor.home' }],
      sections: [{}, {}],
    } as SankeyChartConfig);

    expect(config.nodes[0].type).toBe('entity');
    expect(config.nodes[1].type).toBe('entity');
  });

  it('preserves explicit node types', () => {
    const config = normalizeConfig({
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.grid', section: 0, type: 'remaining_parent_state' },
        { id: 'sensor.home', section: 1 },
      ],
      links: [],
      sections: [{}, {}],
    } as SankeyChartConfig);

    expect(config.nodes[0].type).toBe('remaining_parent_state');
    expect(config.nodes[1].type).toBe('entity');
  });
});
