import {
  addLink,
  addNode,
  autoconfigToManual,
  ensureV4,
  getSectionCount,
  incoming,
  incompleteNodes,
  insertSection,
  isForward,
  moveNode,
  orphanedNodes,
  outgoing,
  removeLink,
  removeNode,
  removeSection,
  sectionNodes,
  updateLink,
  updateNode,
  updateSectionConfig,
} from '../src/editor/config-ops';
import type { SankeyChartConfig } from '../src/types';

const deepFreeze = <T>(obj: T): T => {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach(key => {
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  });
  return obj;
};

// grid -> home -> (fridge, tv), solar -> home; section 2 also has a lonely node
const baseConfig = (): SankeyChartConfig =>
  deepFreeze({
    type: 'custom:sankey-chart',
    nodes: [
      { id: 'sensor.grid' },
      { id: 'sensor.solar', section: 0 },
      { id: 'sensor.home', section: 1 },
      { id: 'sensor.fridge', section: 2 },
      { id: 'sensor.tv', section: 2 },
    ],
    links: [
      { source: 'sensor.grid', target: 'sensor.home' },
      { source: 'sensor.solar', target: 'sensor.home' },
      { source: 'sensor.home', target: 'sensor.fridge', value: 'sensor.fridge_flow' },
      { source: 'sensor.home', target: 'sensor.tv' },
    ],
    sections: [{}, { sort_by: 'state' }],
  });

const ids = (config: SankeyChartConfig) => (config.nodes || []).map(n => `${n.id}@${n.section ?? 0}`);

describe('config-ops helpers', () => {
  it('counts sections from section configs and sparse node indices', () => {
    expect(getSectionCount({ type: 'x' })).toBe(0);
    expect(getSectionCount(baseConfig())).toBe(3);
    expect(getSectionCount({ type: 'x', nodes: [{ id: 'a', section: 4 }], sections: [{}] })).toBe(5);
    expect(getSectionCount({ type: 'x', nodes: [{ id: 'a' }], sections: [{}, {}, {}] })).toBe(3);
  });

  it('lists section nodes, treating a missing section as 0', () => {
    expect(sectionNodes(baseConfig(), 0).map(n => n.id)).toEqual(['sensor.grid', 'sensor.solar']);
    expect(sectionNodes(baseConfig(), 2).map(n => n.id)).toEqual(['sensor.fridge', 'sensor.tv']);
    expect(sectionNodes(baseConfig(), 7)).toEqual([]);
  });

  it('lists outgoing and incoming links', () => {
    expect(outgoing(baseConfig(), 'sensor.home').map(l => l.target)).toEqual(['sensor.fridge', 'sensor.tv']);
    expect(incoming(baseConfig(), 'sensor.home').map(l => l.source)).toEqual(['sensor.grid', 'sensor.solar']);
    expect(outgoing(baseConfig(), 'nope')).toEqual([]);
  });

  it('detects forward links', () => {
    const config = baseConfig();
    expect(isForward(config, 'sensor.grid', 'sensor.home')).toBe(true);
    expect(isForward(config, 'sensor.grid', 'sensor.tv')).toBe(true);
    expect(isForward(config, 'sensor.home', 'sensor.grid')).toBe(false);
    expect(isForward(config, 'sensor.fridge', 'sensor.tv')).toBe(false);
    expect(isForward(config, 'sensor.grid', 'missing')).toBe(false);
  });

  it('migrates v3 configs and keeps v4 configs as they are', () => {
    const v4 = baseConfig();
    expect(ensureV4(v4)).toBe(v4);
    const v3 = deepFreeze({
      type: 'custom:sankey-chart',
      sections: [{ entities: [{ entity_id: 'sensor.a', children: ['sensor.b'] }] }, { entities: ['sensor.b'] }],
    }) as unknown as SankeyChartConfig;
    const migrated = ensureV4(v3);
    expect(migrated.nodes!.map(n => n.id)).toEqual(['sensor.a', 'sensor.b']);
    expect(migrated.links).toEqual([{ source: 'sensor.a', target: 'sensor.b' }]);
  });
});

describe('addNode', () => {
  it('appends a node and returns its id', () => {
    const config = baseConfig();
    const result = addNode(config, { id: 'sensor.oven', section: 2 });
    expect(result.id).toBe('sensor.oven');
    expect(result.config.nodes!.slice(-1)).toEqual([{ id: 'sensor.oven', section: 2 }]);
    expect(config.nodes).toHaveLength(5);
  });

  it('keeps nodes[] grouped by section', () => {
    expect(ids(addNode(baseConfig(), { id: 'sensor.ev', section: 1 }).config)).toEqual([
      'sensor.grid@0',
      'sensor.solar@0',
      'sensor.home@1',
      'sensor.ev@1',
      'sensor.fridge@2',
      'sensor.tv@2',
    ]);
    const sparse = deepFreeze({ type: 'x', nodes: [{ id: 'a' }, { id: 'c', section: 2 }] });
    expect(ids(addNode(sparse, { id: 'b', section: 1 }).config)).toEqual(['a@0', 'b@1', 'c@2']);
  });

  it('gives a duplicate a unique id that still reads the original entity', () => {
    const first = addNode(baseConfig(), { id: 'sensor.home', section: 2 });
    expect(first.id).toBe('sensor.home_2');
    expect(first.config.nodes!.slice(-1)).toEqual([{ id: 'sensor.home_2', entity_id: 'sensor.home', section: 2 }]);

    const second = addNode(first.config, { id: 'sensor.home', section: 2 });
    expect(second.id).toBe('sensor.home_3');
  });

  it('does not add entity_id to duplicates of non-entity nodes', () => {
    const config = addNode(baseConfig(), { id: 'other', type: 'remaining_parent_state', section: 2 }).config;
    const result = addNode(config, { id: 'other', type: 'remaining_parent_state', section: 2 });
    expect(result.config.nodes!.slice(-1)).toEqual([{ id: 'other_2', type: 'remaining_parent_state', section: 2 }]);
  });

  it('refuses an empty id', () => {
    const config = baseConfig();
    expect(addNode(config, { id: '' })).toEqual({ config, id: '' });
  });
});

describe('updateNode', () => {
  it('merges a patch and deletes keys patched to undefined', () => {
    const config = deepFreeze({
      type: 'x',
      nodes: [{ id: 'sensor.a', name: 'A', color: 'red' }],
    });
    const result = updateNode(config, 'sensor.a', { name: undefined, icon: 'mdi:flash' });
    expect(result.error).toBeUndefined();
    expect(result.config.nodes).toEqual([{ id: 'sensor.a', color: 'red', icon: 'mdi:flash' }]);
    expect('name' in result.config.nodes![0]).toBe(false);
    expect(config.nodes[0]).toEqual({ id: 'sensor.a', name: 'A', color: 'red' });
  });

  it('returns the same config when nothing changes', () => {
    const config = baseConfig();
    expect(updateNode(config, 'sensor.home', { section: 1 }).config).toBe(config);
    expect(updateNode(config, 'sensor.home', { name: undefined }).config).toBe(config);
  });

  it('rewrites links when renaming', () => {
    const result = updateNode(baseConfig(), 'sensor.home', { id: 'sensor.house' });
    expect(result.id).toBe('sensor.house');
    expect(result.config.nodes![2]).toEqual({ id: 'sensor.house', section: 1 });
    expect(result.config.links).toEqual([
      { source: 'sensor.grid', target: 'sensor.house' },
      { source: 'sensor.solar', target: 'sensor.house' },
      { source: 'sensor.house', target: 'sensor.fridge', value: 'sensor.fridge_flow' },
      { source: 'sensor.house', target: 'sensor.tv' },
    ]);
  });

  it('refuses renaming onto an existing or empty id', () => {
    const config = baseConfig();
    expect(updateNode(config, 'sensor.home', { id: 'sensor.tv' })).toEqual({
      config,
      id: 'sensor.home',
      error: 'duplicate_id',
    });
    expect(updateNode(config, 'sensor.home', { id: '' }).error).toBe('invalid_id');
    expect(updateNode(config, 'sensor.home', { id: undefined }).error).toBe('invalid_id');
    expect(updateNode(config, 'missing', { name: 'x' })).toEqual({ config, id: 'missing', error: 'not_found' });
  });
});

describe('removeNode', () => {
  it('removes the node and every link touching it', () => {
    const result = removeNode(baseConfig(), 'sensor.home');
    expect(result.config.nodes!.map(n => n.id)).not.toContain('sensor.home');
    expect(result.config.links).toEqual([]);
    expect(result.removedLinks).toHaveLength(4);
  });

  it('ignores unknown ids', () => {
    const config = baseConfig();
    expect(removeNode(config, 'missing')).toEqual({ config, removedLinks: [] });
  });
});

describe('moveNode', () => {
  it('moves a node after the last node of the target section', () => {
    const result = moveNode(baseConfig(), 'sensor.solar', 1);
    expect(ids(result.config)).toEqual([
      'sensor.grid@0',
      'sensor.home@1',
      'sensor.solar@1',
      'sensor.fridge@2',
      'sensor.tv@2',
    ]);
  });

  it('places the node before the given node of the target section', () => {
    const result = moveNode(baseConfig(), 'sensor.tv', 2, { before: 'sensor.fridge' });
    expect(ids(result.config).slice(3)).toEqual(['sensor.tv@2', 'sensor.fridge@2']);

    const ignored = moveNode(baseConfig(), 'sensor.solar', 1, { before: 'sensor.tv' });
    expect(ids(ignored.config)[2]).toBe('sensor.solar@1');
  });

  it('appends to nodes[] when the target section is empty', () => {
    const config = deepFreeze({ ...baseConfig(), sections: [{}, {}, {}, {}] });
    const result = moveNode(config, 'sensor.grid', 3);
    expect(ids(result.config).slice(-1)).toEqual(['sensor.grid@3']);
  });

  it('removes links that are no longer forward and reports them', () => {
    const result = moveNode(baseConfig(), 'sensor.home', 2);
    expect(result.removedLinks).toEqual([
      { source: 'sensor.home', target: 'sensor.fridge', value: 'sensor.fridge_flow' },
      { source: 'sensor.home', target: 'sensor.tv' },
    ]);
    expect(result.config.links).toEqual([
      { source: 'sensor.grid', target: 'sensor.home' },
      { source: 'sensor.solar', target: 'sensor.home' },
    ]);
  });

  it('keeps links that were not forward before the move', () => {
    const config = deepFreeze({ ...baseConfig(), links: [{ source: 'sensor.tv', target: 'sensor.fridge' }] });
    const result = moveNode(config, 'sensor.fridge', 1);
    expect(ids(result.config)).toContain('sensor.fridge@1');
    expect(result.config.links).toEqual([{ source: 'sensor.tv', target: 'sensor.fridge' }]);
    expect(result.removedLinks).toEqual([]);
  });

  it('does not leave an empty section when a lone node lands next to its own section', () => {
    const chain = deepFreeze({
      type: 'x',
      nodes: [{ id: 'a' }, { id: 'b', section: 1 }, { id: 'c', section: 2 }],
      links: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
      sections: [{}, {}, {}],
    });
    expect(moveNode(chain, 'b', 1, { newSection: true }).config).toBe(chain);
    expect(moveNode(chain, 'b', 2, { newSection: true }).config).toBe(chain);
    expect(moveNode(chain, 'c', 3, { newSection: true }).config).toBe(chain);
    expect(moveNode(chain, 'c', 3).config).toBe(chain);

    expect(ids(moveNode(chain, 'b', 0, { newSection: true }).config)).toEqual(['b@0', 'a@1', 'c@3']);
    expect(ids(moveNode(chain, 'b', 3, { newSection: true }).config)).toEqual(['a@0', 'c@2', 'b@3']);
  });

  it('inserts a new section and shifts the nodes after it', () => {
    const result = moveNode(baseConfig(), 'sensor.tv', 1, { newSection: true });
    expect(ids(result.config)).toEqual([
      'sensor.grid@0',
      'sensor.solar@0',
      'sensor.tv@1',
      'sensor.home@2',
      'sensor.fridge@3',
    ]);
    expect(result.config.sections).toEqual([{}, {}, { sort_by: 'state' }]);
    expect(result.removedLinks).toEqual([{ source: 'sensor.home', target: 'sensor.tv' }]);
  });

  it('pads sections when inserting beyond the configured ones', () => {
    const config = deepFreeze({ type: 'x', nodes: [{ id: 'a' }, { id: 'b', section: 4 }] });
    const result = moveNode(config, 'a', 3, { newSection: true });
    expect(result.config.sections).toEqual([{}, {}, {}, {}]);
    expect(ids(result.config)).toEqual(['a@3', 'b@5']);
  });

  it('is a no-op when nothing changes', () => {
    const config = baseConfig();
    expect(moveNode(config, 'sensor.grid', 0, { before: 'sensor.solar' }).config).toBe(config);
    expect(moveNode(config, 'sensor.tv', 2).config).toBe(config);
    expect(moveNode(config, 'sensor.tv', 2, { before: 'sensor.tv' }).config).toBe(config);
    expect(moveNode(config, 'missing', 1).config).toBe(config);
    expect(moveNode(config, 'sensor.tv', -1).config).toBe(config);
  });

  it('does not add a section key to a node that stays in section 0', () => {
    const result = moveNode(baseConfig(), 'sensor.grid', 0, { before: undefined });
    expect(result.config.nodes!.find(n => n.id === 'sensor.grid')).toEqual({ id: 'sensor.grid' });
  });
});

describe('links', () => {
  it('adds only forward, unique links between existing nodes', () => {
    const config = baseConfig();
    const added = addLink(config, 'sensor.grid', 'sensor.tv', 'sensor.tv_flow');
    expect(added.links!.slice(-1)).toEqual([{ source: 'sensor.grid', target: 'sensor.tv', value: 'sensor.tv_flow' }]);
    expect(addLink(config, 'sensor.home', 'sensor.grid')).toBe(config);
    expect(addLink(config, 'sensor.fridge', 'sensor.tv')).toBe(config);
    expect(addLink(config, 'sensor.grid', 'sensor.home')).toBe(config);
    expect(addLink(config, 'sensor.grid', 'missing')).toBe(config);
  });

  it('adds the links array when the config has none', () => {
    const config = deepFreeze({ type: 'x', nodes: [{ id: 'a' }, { id: 'b', section: 1 }] });
    expect(addLink(config, 'a', 'b').links).toEqual([{ source: 'a', target: 'b' }]);
  });

  it('sets and removes the connection entity', () => {
    const config = baseConfig();
    const set = updateLink(config, 'sensor.grid', 'sensor.home', { value: 'sensor.flow' });
    expect(set.links![0]).toEqual({ source: 'sensor.grid', target: 'sensor.home', value: 'sensor.flow' });
    const removed = updateLink(config, 'sensor.home', 'sensor.fridge', { value: undefined });
    expect(removed.links![2]).toEqual({ source: 'sensor.home', target: 'sensor.fridge' });
    expect(updateLink(config, 'sensor.grid', 'sensor.home', { value: undefined })).toBe(config);
    expect(updateLink(config, 'missing', 'sensor.home', { value: 'x' })).toBe(config);
  });

  it('removes a link', () => {
    const config = baseConfig();
    expect(removeLink(config, 'sensor.home', 'sensor.tv').links).toHaveLength(3);
    expect(removeLink(config, 'sensor.tv', 'sensor.home')).toBe(config);
  });
});

describe('sections', () => {
  it('inserts a section and shifts later nodes', () => {
    const result = insertSection(baseConfig(), 1);
    expect(ids(result)).toEqual([
      'sensor.grid@0',
      'sensor.solar@0',
      'sensor.home@2',
      'sensor.fridge@3',
      'sensor.tv@3',
    ]);
    expect(result.sections).toEqual([{}, {}, { sort_by: 'state' }]);
  });

  it('appends a section at the end', () => {
    const result = insertSection(baseConfig(), getSectionCount(baseConfig()));
    expect(result.sections).toEqual([{}, { sort_by: 'state' }, {}, {}]);
    expect(getSectionCount(result)).toBe(4);
  });

  it('removes a section with its nodes and links and shifts later sections down', () => {
    const result = removeSection(baseConfig(), 1);
    expect(ids(result.config)).toEqual(['sensor.grid@0', 'sensor.solar@0', 'sensor.fridge@1', 'sensor.tv@1']);
    expect(result.config.links).toEqual([]);
    expect(result.config.sections).toEqual([{}]);
    expect(result.removedNodes.map(n => n.id)).toEqual(['sensor.home']);
    expect(result.removedLinks).toHaveLength(4);
  });

  it('removes a section that exists only through node indices', () => {
    const result = removeSection(baseConfig(), 2);
    expect(ids(result.config)).toEqual(['sensor.grid@0', 'sensor.solar@0', 'sensor.home@1']);
    expect(result.config.sections).toEqual([{}, { sort_by: 'state' }]);
  });

  it('ignores out of range sections', () => {
    const config = baseConfig();
    expect(removeSection(config, 3).config).toBe(config);
    expect(insertSection(config, -1)).toBe(config);
  });

  it('updates a section config, padding and stripping undefined keys', () => {
    const config = baseConfig();
    const result = updateSectionConfig(config, 2, { sort_by: 'state', sort_dir: undefined, min_width: 100 });
    expect(result.sections).toEqual([{}, { sort_by: 'state' }, { sort_by: 'state', min_width: 100 }]);
    expect('sort_dir' in result.sections![2]).toBe(false);
    expect(updateSectionConfig(config, 1, { sort_by: 'state' })).toBe(config);
    expect(updateSectionConfig(config, 5, {})).toBe(config);
  });
});

describe('autoconfigToManual', () => {
  const generated = deepFreeze({
    nodes: [
      { id: 'sensor.grid', section: 0, type: 'entity' as const, name: '', subtract_entities: undefined, color: 'blue' },
      { id: 'total', section: 1, type: 'remaining_parent_state' as const, name: 'Total' },
    ],
    links: [{ source: 'sensor.grid', target: 'total' }],
    sections: [{}, { sort_by: 'none' as const }],
  });

  it('uses the generated graph and pins the autoconfig defaults for energy mode', () => {
    const config = deepFreeze({
      type: 'custom:sankey-chart',
      title: 'Energy',
      autoconfig: { print_yaml: false },
      nodes: [],
    });
    const result = autoconfigToManual(config, generated);
    expect(result).toEqual({
      type: 'custom:sankey-chart',
      title: 'Energy',
      energy_date_selection: true,
      unit_prefix: 'k',
      round: 1,
      nodes: [
        { id: 'sensor.grid', section: 0, color: 'blue' },
        { id: 'total', section: 1, type: 'remaining_parent_state', name: 'Total' },
      ],
      links: [{ source: 'sensor.grid', target: 'total' }],
      sections: [{}, { sort_by: 'none' }],
    });
    expect('autoconfig' in result).toBe(false);
  });

  it('keeps user set values', () => {
    const config = deepFreeze({
      type: 'x',
      autoconfig: { mode: 'energy' as const },
      energy_date_selection: false,
      unit_prefix: 'M' as const,
      round: 3,
    });
    const result = autoconfigToManual(config, generated);
    expect(result.energy_date_selection).toBe(false);
    expect(result.unit_prefix).toBe('M');
    expect(result.round).toBe(3);
  });

  it('does not enable the energy date selection with a time period or in rate modes', () => {
    // `autoconfig: true` is documented in the README, but not in the type
    const boolAutoconfig = { type: 'x', autoconfig: true, time_period_from: 'now/d' } as unknown as SankeyChartConfig;
    const withPeriod = autoconfigToManual(deepFreeze(boolAutoconfig), generated);
    expect(withPeriod.energy_date_selection).toBeUndefined();
    expect(withPeriod.time_period_from).toBe('now/d');

    const power = autoconfigToManual(deepFreeze({ type: 'x', autoconfig: { mode: 'power' as const } }), generated);
    expect(power.energy_date_selection).toBeUndefined();
    expect(power.unit_prefix).toBeUndefined();
    expect(power.round).toBe(1);
  });

  it('drops the time options that rate modes ignore', () => {
    const config = deepFreeze({
      type: 'x',
      autoconfig: { mode: 'water_flow' as const },
      energy_date_selection: true,
      time_period_from: 'now/d',
      time_period_to: 'now',
      unit_prefix: 'k' as const,
    });
    const result = autoconfigToManual(config, generated);
    expect('energy_date_selection' in result).toBe(false);
    expect('time_period_from' in result).toBe(false);
    expect('time_period_to' in result).toBe(false);
    expect(result.unit_prefix).toBe('k');
  });

  it('pins defaults for null values like normalizeConfig does', () => {
    const energy = { type: 'x', autoconfig: {}, energy_date_selection: null, unit_prefix: null, round: null };
    const result = autoconfigToManual(deepFreeze(energy) as unknown as SankeyChartConfig, generated);
    expect(result.energy_date_selection).toBe(true);
    expect(result.unit_prefix).toBe('k');
    expect(result.round).toBe(1);

    const water = {
      type: 'x',
      autoconfig: { mode: 'water' },
      time_period_from: 'now/d',
      energy_date_selection: null,
      unit_prefix: null,
    };
    const waterResult = autoconfigToManual(deepFreeze(water) as unknown as SankeyChartConfig, generated);
    expect('energy_date_selection' in waterResult).toBe(false);
    expect('unit_prefix' in waterResult).toBe(false);
    expect(waterResult.time_period_from).toBe('now/d');
  });

  it('leaves manual configs alone', () => {
    const config = baseConfig();
    expect(autoconfigToManual(config, generated)).toBe(config);
  });
});

describe('incomplete nodes', () => {
  const incompleteIds = (config: SankeyChartConfig) => incompleteNodes(config).map(n => n.id);

  // a -> p -> q -> b, plus a -> r, where p and q are passthroughs and r a remaining parent state
  const chain = (): SankeyChartConfig =>
    deepFreeze({
      type: 'x',
      nodes: [
        { id: 'a' },
        { id: 'p', type: 'passthrough' as const, section: 1 },
        { id: 'r', type: 'remaining_parent_state' as const, section: 1 },
        { id: 'q', type: 'passthrough' as const, section: 2 },
        { id: 'b', section: 3 },
      ],
      links: [
        { source: 'a', target: 'p' },
        { source: 'p', target: 'q' },
        { source: 'q', target: 'b' },
        { source: 'a', target: 'r' },
      ],
    });

  it('accepts passthroughs on a flow and remaining parent states with a parent', () => {
    expect(incompleteNodes(chain())).toEqual([]);
  });

  it('flags passthroughs that no flow reaches or leaves', () => {
    const config = chain();
    expect(incompleteIds(removeNode(config, 'b').config)).toEqual(['p', 'q']);
    expect(incompleteIds(removeNode(config, 'a').config)).toEqual(['p', 'r', 'q']);
    expect(incompleteIds(removeLink(config, 'p', 'q'))).toEqual(['p', 'q']);
    expect(incompleteIds(addNode(config, { id: 'new', type: 'passthrough', section: 1 }).config)).toEqual(['new']);
  });

  it('flags a remaining parent state without parents', () => {
    const result = removeLink(chain(), 'a', 'r');
    expect(incompleteIds(result)).toEqual(['r']);
  });

  it('reports only the nodes a change left incomplete', () => {
    const config = chain();
    const broken = removeNode(config, 'b').config;
    expect(orphanedNodes(config, broken).map(n => n.id)).toEqual(['p', 'q']);
    expect(orphanedNodes(broken, removeNode(broken, 'a').config).map(n => n.id)).toEqual(['r']);
    expect(orphanedNodes(config, moveNode(config, 'b', 2).config).map(n => n.id)).toEqual(['p', 'q']);
  });
});

describe('frozen inputs', () => {
  it('never mutates the input', () => {
    const config = baseConfig();
    const before = JSON.stringify(config);
    expect(() => {
      addNode(config, { id: 'sensor.home', section: 0 });
      updateNode(config, 'sensor.home', { id: 'sensor.house', name: 'House' });
      updateNode(config, 'sensor.home', { section: undefined });
      removeNode(config, 'sensor.home');
      moveNode(config, 'sensor.home', 2);
      moveNode(config, 'sensor.home', 0, { newSection: true, before: 'sensor.grid' });
      addLink(config, 'sensor.grid', 'sensor.tv');
      updateLink(config, 'sensor.home', 'sensor.fridge', { value: undefined });
      removeLink(config, 'sensor.home', 'sensor.tv');
      insertSection(config, 0);
      removeSection(config, 0);
      updateSectionConfig(config, 0, { sort_by: 'state' });
      autoconfigToManual({ ...config, autoconfig: {} }, { nodes: config.nodes!, links: config.links!, sections: [] });
    }).not.toThrow();
    expect(JSON.stringify(config)).toBe(before);
  });
});
