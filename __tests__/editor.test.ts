import { HomeAssistant } from 'custom-card-helpers';
import { getEditorBridge } from '../src/editor-bridge';
import type { SankeyEditorBridge } from '../src/preview/bridge';
import { updateNode } from '../src/editor/config-ops';
import { trCount } from '../src/editor/helpers';
import '../src/editor/index';
import type { SankeyChartEditor } from '../src/editor/index';
import {
  applyAutoconfigChange,
  applyOptionsChange,
  autoconfigData,
  optionsData,
  optionsSchema,
} from '../src/editor/options';
import type { SankeyChartConfig } from '../src/types';
import { normalizeConfig } from '../src/utils';
import mockHass from './__mocks__/hass.mock';

const deepFreeze = <T>(obj: T): T => {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach(key => {
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  });
  return obj;
};

const config = (): SankeyChartConfig =>
  deepFreeze({
    type: 'custom:sankey-chart',
    nodes: [{ id: 'sensor.grid' }, { id: 'sensor.home', section: 1 }, { id: 'sensor.tv', section: 2 }],
    links: [
      { source: 'sensor.grid', target: 'sensor.home' },
      { source: 'sensor.home', target: 'sensor.tv' },
    ],
  });

const flush = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
};

const content = (c: SankeyChartConfig) => JSON.parse(JSON.stringify(c));

describe('sankey-chart-editor', () => {
  let editor: SankeyChartEditor;
  let fired: SankeyChartConfig[];
  let toasts: { message: string; action?: { action: () => void } }[];

  const bridge = () => getEditorBridge(fired[fired.length - 1]) as SankeyEditorBridge;

  beforeEach(() => {
    editor = document.createElement('sankey-chart-editor') as SankeyChartEditor;
    editor.hass = mockHass() as unknown as HomeAssistant;
    fired = [];
    toasts = [];
    editor.addEventListener('config-changed', ev => fired.push((ev as CustomEvent).detail.config));
    editor.addEventListener('hass-notification', ev => toasts.push((ev as CustomEvent).detail));
  });

  afterEach(() => {
    editor.remove();
  });

  const open = async (initial = config()) => {
    editor.setConfig(initial);
    document.body.appendChild(editor);
    await flush();
  };

  it('delivers an active bridge once connected', async () => {
    editor.setConfig(config());
    await flush();
    expect(fired).toHaveLength(0);

    document.body.appendChild(editor);
    await flush();
    expect(fired).toHaveLength(1);
    expect(content(fired[0])).toEqual(content(config()));
    expect(bridge().active).toBe(true);
  });

  it('treats configs carrying its bridge as echoes', async () => {
    await open();
    editor.setConfig(deepFreeze({ ...fired[0] }));
    await flush();
    expect(fired).toHaveLength(1);
  });

  it('re-delivers when the dialog hands back an older copy without the bridge', async () => {
    await open();
    editor.setConfig(content(fired[0]));
    await flush();
    expect(fired).toHaveLength(2);
    expect(getEditorBridge(fired[1])).toBe(getEditorBridge(fired[0]));

    editor.setConfig(fired[1]);
    await flush();
    expect(fired).toHaveLength(2);
  });

  it('does not loop when the host always drops the symbol', async () => {
    editor.addEventListener('config-changed', ev => {
      const stripped = content((ev as CustomEvent).detail.config);
      Promise.resolve().then(() => editor.setConfig(stripped));
    });
    await open();
    for (let i = 0; i < 5; i++) await flush();
    expect(fired).toHaveLength(3);
  });

  it('starts a new bridge for a config from YAML and delivers it when shown again', async () => {
    await open();
    const first = bridge();
    editor.remove();
    expect(first.active).toBe(false);

    editor.setConfig({ ...config(), title: 'From YAML' });
    await flush();
    expect(fired).toHaveLength(1);

    document.body.appendChild(editor);
    await flush();
    expect(fired).toHaveLength(2);
    expect(fired[1].title).toBe('From YAML');
    expect(bridge()).not.toBe(first);
    expect(bridge().active).toBe(true);
    expect(first.active).toBe(false);
  });

  it('moves nodes and reports dropped links with an undo toast', async () => {
    await open();
    bridge().dispatch({ type: 'move_node', id: 'sensor.home', section: 2 });
    const moved = fired[fired.length - 1];
    expect(moved.nodes!.find(n => n.id === 'sensor.home')!.section).toBe(2);
    expect(moved.links).toEqual([{ source: 'sensor.grid', target: 'sensor.home' }]);
    expect(getEditorBridge(moved)).toBe(getEditorBridge(fired[0]));
    expect(toasts).toHaveLength(1);

    toasts[0].action!.action();
    expect(content(fired[fired.length - 1])).toEqual(content(config()));
  });

  it('adds links from the preview and selects them', async () => {
    await open();
    bridge().dispatch({ type: 'add_link', source: 'sensor.grid', target: 'sensor.tv' });
    expect(fired[fired.length - 1].links).toHaveLength(3);
    expect(bridge().selection).toEqual({ type: 'link', source: 'sensor.grid', target: 'sensor.tv' });
  });

  it('ignores selections of unknown nodes and clears removed ones', async () => {
    await open();
    bridge().dispatch({ type: 'select', selection: { type: 'node', id: 'sensor.home' } });
    bridge().dispatch({ type: 'select', selection: { type: 'node', id: 'sensor.nope' } });
    expect(bridge().selection).toEqual({ type: 'node', id: 'sensor.home' });

    bridge().dispatch({ type: 'remove', selection: { type: 'node', id: 'sensor.home' } });
    expect(bridge().selection).toBeUndefined();
    expect(fired[fired.length - 1].nodes!.map(n => n.id)).toEqual(['sensor.grid', 'sensor.tv']);
    expect(fired[fired.length - 1].links).toEqual([]);

    bridge().dispatch({ type: 'undo' });
    expect(content(fired[fired.length - 1])).toEqual(content(config()));
    expect(bridge().selection).toEqual({ type: 'node', id: 'sensor.home' });
  });

  it('renders every view', async () => {
    await open();
    const root = editor.shadowRoot!;
    await editor.updateComplete;
    const sections = root.querySelector('sankey-chart-sections-editor') as HTMLElement & { updateComplete: Promise<unknown> };
    await sections.updateComplete;
    expect(sections.shadowRoot!.textContent).toContain('Section 3');

    bridge().dispatch({ type: 'select', selection: { type: 'node', id: 'sensor.home' } });
    await editor.updateComplete;
    const node = root.querySelector('sankey-chart-node-editor') as HTMLElement & { updateComplete: Promise<unknown> };
    await node.updateComplete;
    expect(node.shadowRoot!.textContent).toContain('Outgoing links');

    bridge().dispatch({ type: 'select', selection: { type: 'link', source: 'sensor.home', target: 'sensor.tv' } });
    await editor.updateComplete;
    expect(root.querySelector('sankey-chart-link-editor')).not.toBeNull();

    bridge().dispatch({ type: 'add_node', section: 3, link_from: 'sensor.tv' });
    await editor.updateComplete;
    const add = root.querySelector('sankey-chart-add-node-editor') as HTMLElement & { updateComplete: Promise<unknown> };
    await add.updateComplete;
    expect(add.shadowRoot!.textContent).toContain('Section 4 (new)');

    editor.setConfig({ type: 'custom:sankey-chart', autoconfig: {} });
    await editor.updateComplete;
    expect(root.querySelector('sankey-chart-add-node-editor')).toBeNull();
    expect(root.textContent).toContain('Customize');
  });

  type View = HTMLElement & { updateComplete: Promise<unknown>; shadowRoot: ShadowRoot };
  const view = async (tag: string): Promise<View> => {
    await editor.updateComplete;
    const el = editor.shadowRoot!.querySelector(tag) as View;
    await el.updateComplete;
    return el;
  };
  const UNDO_TOAST_CLOSE = { id: 'sankey-chart-editor-undo', message: '', duration: 0 };

  it('ignores the toast undo and closes the toast once the editor is detached', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const hostToasts: Record<string, unknown>[] = [];
    host.addEventListener('hass-notification', ev => hostToasts.push((ev as CustomEvent).detail));
    editor.setConfig(config());
    shadow.appendChild(editor);
    await flush();

    bridge().dispatch({ type: 'remove', selection: { type: 'node', id: 'sensor.home' } });
    expect(hostToasts).toHaveLength(1);
    const count = fired.length;
    editor.remove();
    expect(hostToasts[1]).toEqual(UNDO_TOAST_CLOSE);
    (hostToasts[0].action as { action: () => void }).action();
    expect(fired).toHaveLength(count);

    // The undo history survives a trip through the code editor
    shadow.appendChild(editor);
    await flush();
    bridge().dispatch({ type: 'undo' });
    expect(content(fired[fired.length - 1])).toEqual(content(config()));
    host.remove();
  });

  it('closes the toast when a newer change makes its undo stale', async () => {
    await open();
    bridge().dispatch({ type: 'remove', selection: { type: 'node', id: 'sensor.tv' } });
    expect(toasts).toHaveLength(1);
    editor.edit(current => ({ config: { ...current, title: 'New' } }), { undo: 'options:title' });
    expect(toasts[1]).toEqual(UNDO_TOAST_CLOSE);
    const count = fired.length;
    toasts[0].action!.action();
    expect(fired).toHaveLength(count);
  });

  it('names the nodes a removal leaves without links they need', async () => {
    await open(
      deepFreeze({
        type: 'custom:sankey-chart',
        nodes: [{ id: 'sensor.grid' }, { id: 'p', type: 'passthrough', section: 1 }, { id: 'sensor.tv', section: 2 }],
        links: [
          { source: 'sensor.grid', target: 'p' },
          { source: 'p', target: 'sensor.tv' },
        ],
      }),
    );
    bridge().dispatch({ type: 'remove', selection: { type: 'node', id: 'sensor.tv' } });
    expect(toasts[0].message).toMatch(/^Removed .+\. p now needs a link\.$/);
    const sections = await view('sankey-chart-sections-editor');
    expect(sections.shadowRoot.textContent).toContain('Needs an incoming and an outgoing link');

    bridge().dispatch({ type: 'select', selection: { type: 'node', id: 'p' } });
    const node = await view('sankey-chart-node-editor');
    expect(node.shadowRoot.querySelector('ha-alert[alert-type="warning"]')).not.toBeNull();
  });

  it('resets the node view when coming back to a renamed node', async () => {
    await open(
      deepFreeze({
        type: 'custom:sankey-chart',
        nodes: [{ id: 'sensor.grid' }, { id: 'p1', type: 'passthrough', section: 1 }, { id: 'p2', type: 'passthrough', section: 1 }],
      }),
    );
    type Form = HTMLElement & { data: Record<string, unknown> };
    const form = (el: View) => el.shadowRoot.querySelector('ha-form') as Form;
    const change = (el: View, patch: Record<string, unknown>) =>
      form(el).dispatchEvent(new CustomEvent('value-changed', { detail: { value: { ...form(el).data, ...patch } } }));
    const error = (el: View) => el.shadowRoot.querySelector('ha-alert[alert-type="error"]');

    bridge().dispatch({ type: 'select', selection: { type: 'node', id: 'p1' } });
    change(await view('sankey-chart-node-editor'), { id: 'p1x' });
    expect(bridge().selection).toEqual({ type: 'node', id: 'p1x' });

    bridge().dispatch({ type: 'select', selection: { type: 'node', id: 'p2' } });
    change(await view('sankey-chart-node-editor'), { id: '' });
    expect(error(await view('sankey-chart-node-editor'))).not.toBeNull();

    bridge().dispatch({ type: 'select', selection: { type: 'node', id: 'p1x' } });
    const el = await view('sankey-chart-node-editor');
    expect(error(el)).toBeNull();
    expect(form(el).data.id).toBe('p1x');
  });

  it('scrolls a newly opened view to its top, but not after a rename or a preview click', async () => {
    const scroll = jest.fn();
    // jsdom does not implement it
    Element.prototype.scrollIntoView = scroll;
    try {
      await open();
      editor.select({ type: 'node', id: 'sensor.home' });
      await editor.updateComplete;
      expect(scroll).toHaveBeenCalledTimes(1);
      expect((scroll.mock.instances[0] as Element).className).toBe('anchor');

      editor.edit(
        current => ({
          config: updateNode(current, 'sensor.home', { id: 'sensor.house' }).config,
          select: { type: 'node', id: 'sensor.house' },
        }),
        { undo: true },
      );
      await editor.updateComplete;
      expect(scroll).toHaveBeenCalledTimes(1);

      // on phones the editor sits above the preview; scrolling would hide what was clicked
      bridge().dispatch({ type: 'select', selection: { type: 'node', id: 'sensor.tv' } });
      await editor.updateComplete;
      expect(scroll).toHaveBeenCalledTimes(1);

      editor.select({ type: 'node', id: 'sensor.grid' });
      await editor.updateComplete;
      expect(scroll).toHaveBeenCalledTimes(2);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it('maps preview links onto __auto hops a pasted print_yaml config declares', async () => {
    const hop = 'sensor.x__passthrough_1__auto';
    await open(
      deepFreeze({
        type: 'custom:sankey-chart',
        nodes: [{ id: 'sensor.a' }, { id: hop, section: 1, type: 'passthrough' }, { id: 'sensor.x', section: 2 }],
        links: [
          { source: 'sensor.a', target: hop },
          { source: hop, target: 'sensor.x' },
        ],
      }),
    );
    // the preview collapses the hop and reports the link it draws
    bridge().dispatch({ type: 'select', selection: { type: 'link', source: 'sensor.a', target: 'sensor.x' } });
    expect(bridge().selection).toEqual({ type: 'link', source: 'sensor.a', target: hop });

    bridge().dispatch({ type: 'remove', selection: { type: 'link', source: 'sensor.a', target: 'sensor.x' } });
    expect(fired[fired.length - 1].links).toEqual([{ source: hop, target: 'sensor.x' }]);
  });

  it('drops a preview focus request when the action changed nothing', async () => {
    await open();
    bridge().keepPreviewFocus();
    // nothing to undo, so no rebuilt preview will take the focus
    bridge().dispatch({ type: 'undo' });
    expect(bridge().takePreviewFocus()).toBe(false);
  });

  it('lets go of the bridge while detached', async () => {
    await open();
    const detached = bridge();
    editor.remove();
    expect(detached.active).toBe(false);
    detached.setActive(true);
    detached.dispatch({ type: 'select', selection: { type: 'node', id: 'sensor.home' } });
    expect(detached.selection).toBeUndefined();

    document.body.appendChild(editor);
    detached.dispatch({ type: 'select', selection: { type: 'node', id: 'sensor.home' } });
    expect(detached.selection).toEqual({ type: 'node', id: 'sensor.home' });
  });

  it('keeps the add view on its section when the preview inserts one before it', async () => {
    await open(deepFreeze({ ...config(), sections: [{}, {}, {}, {}] }));
    bridge().dispatch({ type: 'add_node', section: 3 });
    bridge().dispatch({ type: 'move_node', id: 'sensor.tv', section: 1, new_section: true });
    await editor.updateComplete;
    const add = (await view('sankey-chart-add-node-editor')) as unknown as { section: number };
    expect(add.section).toBe(4);
  });

  it('ignores view selections of missing nodes', async () => {
    const broken = { source: 'sensor.home', target: 'sensor.typo' };
    await open(deepFreeze({ ...config(), links: [...config().links!, broken] }));
    editor.select({ type: 'link', ...broken });
    editor.select({ type: 'node', id: 'sensor.typo' });
    expect(bridge().selection).toEqual({ type: 'link', ...broken });

    const link = await view('sankey-chart-link-editor');
    expect(link.shadowRoot.querySelectorAll('button.chip')).toHaveLength(1);
    expect(link.shadowRoot.querySelector('.chip.missing')!.textContent).toContain('Node not found');
  });

  describe('autoconfig switch', () => {
    const toggle = () =>
      Array.from(editor.shadowRoot!.querySelectorAll('ha-form')).find(
        f => (f as unknown as { schema: { name: string }[] }).schema?.[0]?.name === 'autoconfig',
      ) as HTMLElement;
    const setAutoconfig = async (autoconfig: boolean) => {
      await editor.updateComplete;
      toggle().dispatchEvent(new CustomEvent('value-changed', { detail: { value: { autoconfig } } }));
      await editor.updateComplete;
    };
    const customize = () => editor.shadowRoot!.querySelector('.customize ha-button') as HTMLElement & { disabled: boolean };

    it('keeps the generated chart when turned off, and forgets it when the options change', async () => {
      await open(deepFreeze({ type: 'custom:sankey-chart', autoconfig: { mode: 'power' } }) as SankeyChartConfig);
      bridge().reportGenerated({ nodes: [{ id: 'sensor.power', section: 0 }], links: [], sections: [{}] });

      await setAutoconfig(false);
      const manual = fired[fired.length - 1];
      expect(manual.autoconfig).toBeUndefined();
      expect(manual.nodes).toEqual([{ id: 'sensor.power', section: 0 }]);
      expect('unit_prefix' in manual).toBe(false);

      await setAutoconfig(true);
      expect(fired[fired.length - 1].autoconfig).toEqual({});
      expect(customize().disabled).toBe(true);

      bridge().reportGenerated({ nodes: [{ id: 'sensor.energy', section: 0 }], links: [], sections: [{}] });
      await editor.updateComplete;
      expect(customize().disabled).toBe(false);
    });

    it('warns when turned off before the preview built the chart', async () => {
      await open(deepFreeze({ type: 'custom:sankey-chart', autoconfig: {} }) as SankeyChartConfig);
      await setAutoconfig(false);
      expect(fired[fired.length - 1].autoconfig).toBeUndefined();
      expect(toasts[toasts.length - 1].message).toBe('Turned off autoconfig. The chart is empty until you add nodes.');
    });
  });
});

describe('trCount', () => {
  afterEach(() => localStorage.removeItem('selectedLanguage'));

  it('uses the English plural forms for languages without their own translation', () => {
    expect(trCount('editor.node_count', 1)).toBe('1 node');
    expect(trCount('editor.node_count', 0)).toBe('0 nodes');
    localStorage.setItem('selectedLanguage', '"ja"');
    expect(trCount('editor.node_count', 1)).toBe('1 node');
    localStorage.setItem('selectedLanguage', '"uk"');
    expect(trCount('editor.node_count', 21)).toBe('21 nodes');
    localStorage.setItem('selectedLanguage', '"pl"');
    expect(trCount('editor.node_count', 2)).toBe('2 nodes');
  });
});

describe('options form', () => {
  const manual = deepFreeze({ type: 'x', height: 300, nodes: [] }) as SankeyChartConfig;

  it('shows defaults but writes only the changed keys', () => {
    const data = optionsData(manual, normalizeConfig(manual));
    expect(data.height).toBe(300);
    expect(data.min_box_size).toBe(3);
    const result = applyOptionsChange(manual, data, { ...data, show_names: true });
    expect(result.config).toEqual({ type: 'x', height: 300, nodes: [], show_names: true });
  });

  it('deletes cleared keys', () => {
    const data = optionsData(manual, normalizeConfig(manual));
    expect(applyOptionsChange(manual, data, { ...data, height: undefined }).config).toEqual({ type: 'x', nodes: [] });
  });

  it('keeps the energy date picker and a time period exclusive', () => {
    const withDate = deepFreeze({ ...manual, energy_date_selection: true });
    const data = optionsData(withDate, normalizeConfig(withDate));
    const result = applyOptionsChange(withDate, data, { ...data, time_period_from: 'now/d' });
    expect(result.config.energy_date_selection).toBeUndefined();
    expect(result.config.time_period_from).toBe('now/d');

    const withPeriod = deepFreeze({ ...manual, time_period_from: 'now/d', time_period_to: 'now' });
    const periodData = optionsData(withPeriod, normalizeConfig(withPeriod));
    const enabled = applyOptionsChange(withPeriod, periodData, { ...periodData, energy_date_selection: true });
    expect(enabled.config.energy_date_selection).toBe(true);
    expect('time_period_from' in enabled.config).toBe(false);
    expect('time_period_to' in enabled.config).toBe(false);
  });

  it('writes an explicit empty unit prefix', () => {
    const auto = deepFreeze({ type: 'x', autoconfig: {} }) as SankeyChartConfig;
    const data = optionsData(auto, normalizeConfig(auto));
    expect(data.unit_prefix).toBe('k');
    expect(applyOptionsChange(auto, data, { ...data, unit_prefix: 'none' }).config.unit_prefix).toBe('');
  });

  it('keeps the time period fields in place when the date picker turns off', () => {
    const withDate = deepFreeze({ ...manual, energy_date_selection: true });
    const names = (data: Record<string, unknown>) => {
      const time = optionsSchema(data).find((item: { title?: string }) => item.title === 'Time period');
      return time.schema.map((item: { name: string; type?: string }) => item.name || item.type);
    };
    const before = names(optionsData(withDate, normalizeConfig(withDate)));
    const after = names(optionsData(manual, normalizeConfig(manual)));
    expect(before.slice(0, after.length)).toEqual(after);
  });

  it('only stores autoconfig options that differ from their defaults', () => {
    const auto = deepFreeze({ type: 'x', autoconfig: { group_by_area: false } }) as SankeyChartConfig;
    const data = autoconfigData(auto);
    expect(data.group_by_floor).toBe(true);
    const result = applyAutoconfigChange(auto, data, { ...data, group_by_area: true, mode: 'power' });
    expect(result.config.autoconfig).toEqual({ mode: 'power' });
  });
});
