// import '../dist/ha-sankey-chart';
import { HomeAssistant } from 'custom-card-helpers';
import '../src/ha-sankey-chart';
import '../src/chart';
import type { Chart } from '../src/chart';
import * as utils from '../src/utils';
import SankeyChart from '../src/ha-sankey-chart';
import type { SankeyChartConfig } from '../src/types';
import mockHass from './__mocks__/hass.mock';
import { LitElement, html } from 'lit';

const hass = mockHass({
  ent1: {
    entity_id: 'ent1',
    state: '2',
    attributes: {
      unit_of_measurement: 'W',
    },
  },
  ent2: {
    entity_id: 'ent2',
    state: '1',
    attributes: {
      unit_of_measurement: 'W',
    },
  },
  ent3: {
    entity_id: 'ent3',
    state: '1',
    attributes: {
      unit_of_measurement: 'W',
    },
  },
});

const ROOT_TAG = 'sankey-chart';

describe('SankeyChart', () => {
  let sankeyChart: SankeyChart;

  beforeEach(() => {
    sankeyChart = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    sankeyChart.hass = hass as HomeAssistant;
  });

  afterEach(() => {
    sankeyChart.remove();
  });

  it('matches a simple snapshot', async () => {
    const config: SankeyChartConfig = {
      type: '',
      nodes: [
        {
          id: 'ent1',
          section: 0,
          type: 'entity',
          name: '',
        },
        {
          id: 'ent2',
          section: 1,
          type: 'entity',
          name: '',
        },
        {
          id: 'ent3',
          section: 1,
          type: 'entity',
          name: '',
        },
      ],
      links: [
        { source: 'ent1', target: 'ent2' },
        { source: 'ent1', target: 'ent3' },
      ],
      sections: [
        {},
        {},
      ],
    };
    sankeyChart.setConfig(config, true);
    document.body.appendChild(sankeyChart);
    await sankeyChart.updateComplete;
    expect(sankeyChart.shadowRoot?.innerHTML.replace(/<!--.*-->/g, '')).toMatchSnapshot();

    // Wait for the sankey-chart-base component to finish updating
    const sankeyChartBase = sankeyChart.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    expect(sankeyChartBase).not.toBeNull();

    expect(sankeyChartBase.shadowRoot?.innerHTML.replace(/<!--.*-->/g, '')).toMatchSnapshot();
  });

  it('honors box_thickness and connection_margin in rendered SVG', async () => {
    const config: SankeyChartConfig = {
      type: '',
      box_thickness: 5,
      connection_margin: 8,
      nodes: [
        { id: 'ent1', section: 0, type: 'entity', name: '' },
        { id: 'ent2', section: 1, type: 'entity', name: '' },
      ],
      links: [{ source: 'ent1', target: 'ent2' }],
      sections: [{}, {}],
    };
    sankeyChart.setConfig(config, true);
    document.body.appendChild(sankeyChart);
    await sankeyChart.updateComplete;
    const base = sankeyChart.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;

    // First color bar: width should match box_thickness (5px), not the 15px default.
    const colorBars = base.shadowRoot?.querySelectorAll('rect.color-bar');
    expect(colorBars && colorBars.length).toBe(2);
    expect(colorBars![0].getAttribute('width')).toBe('5');
    // Second section's color bar sits at the right edge — its x marks the end
    // of section 0, which is where farEdge is measured against.
    const nextSectionX = Number(colorBars![1].getAttribute('x'));

    // Connector path: nearEdge = box_thickness + connection_margin = 13;
    // farEdge = nextSectionX - connection_margin.
    const path = base.shadowRoot?.querySelector('g.connectors path');
    const d = path?.getAttribute('d') || '';
    const moveTo = d.match(/^M([\d.]+),/);
    expect(moveTo).not.toBeNull();
    expect(Number(moveTo![1])).toBe(13);
    const lineTo = d.match(/L([\d.]+),/);
    expect(lineTo).not.toBeNull();
    expect(Number(lineTo![1])).toBe(nextSectionX - 8);
  });

  it('collapses the color bar when box_thickness is 0', async () => {
    const config: SankeyChartConfig = {
      type: '',
      box_thickness: 0,
      nodes: [
        { id: 'ent1', section: 0, type: 'entity', name: '' },
        { id: 'ent2', section: 1, type: 'entity', name: '' },
      ],
      links: [{ source: 'ent1', target: 'ent2' }],
      sections: [{}, {}],
    };
    sankeyChart.setConfig(config, true);
    document.body.appendChild(sankeyChart);
    await sankeyChart.updateComplete;
    const base = sankeyChart.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;

    const colorBar = base.shadowRoot?.querySelector('rect.color-bar');
    expect(colorBar?.getAttribute('width')).toBe('0');
    // With default connection_margin (0), the connector starts at the box's
    // right edge — which, with thickness 0, is the section's left edge (x=0).
    const path = base.shadowRoot?.querySelector('g.connectors path');
    expect(path?.getAttribute('d')).toMatch(/^M0,/);
  });
});

describe('Missing entities', () => {
  let element: SankeyChart;

  beforeEach(() => {
    element = document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    element.hass = hass as HomeAssistant;
  });

  test('treats missing entity as 0 when ignore_missing_entities is true', () => {
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      ignore_missing_entities: true,
      nodes: [
        {
          id: 'sensor.missing',
          section: 0,
          type: 'entity',
          name: '',
        },
        {
          id: 'sensor.ent2',
          section: 1,
          type: 'entity',
          name: '',
        },
      ],
      links: [
        { source: 'sensor.missing', target: 'sensor.ent2' },
      ],
      sections: [
        {},
        {},
      ],
    };

    element.setConfig(config, true);
    // Should not throw
    expect(() => element.requestUpdate()).not.toThrow();
  });
});

describe('Link value (connection entity)', () => {
  const valueHass = mockHass({
    'sensor.parent': {
      entity_id: 'sensor.parent',
      state: '100',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.child': {
      entity_id: 'sensor.child',
      state: '100',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.cap': {
      entity_id: 'sensor.cap',
      state: '30',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.parent_a': {
      entity_id: 'sensor.parent_a',
      state: '100',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.parent_b': {
      entity_id: 'sensor.parent_b',
      state: '100',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.target': {
      entity_id: 'sensor.target',
      state: '200',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.cap_a': {
      entity_id: 'sensor.cap_a',
      state: '10',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.cap_b': {
      entity_id: 'sensor.cap_b',
      state: '20',
      attributes: { unit_of_measurement: 'W' },
    },
  });

  async function renderChart(config: SankeyChartConfig) {
    const element = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    element.hass = valueHass as HomeAssistant;
    element.setConfig(config, true);
    document.body.appendChild(element);
    await element.updateComplete;
    const base = element.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { element, base, connections: (base as any).connections as Array<any> };
  }

  it('caps a cross-section link by its value sensor', async () => {
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.parent', section: 0, type: 'entity', name: '' },
        { id: 'sensor.child', section: 2, type: 'entity', name: '' },
      ],
      links: [
        { source: 'sensor.parent', target: 'sensor.child', value: 'sensor.cap' },
      ],
      sections: [{}, {}, {}],
    };
    const { connections, element } = await renderChart(config);
    const conn = connections.find(
      c => c.parent.id === 'sensor.parent' && c.child.id === 'sensor.child',
    );
    expect(conn).toBeDefined();
    expect(conn.connection_entity_id).toBe('sensor.cap');
    expect(conn.state).toBe(30);
    element.remove();
  });

  it('caps an adjacent-section link by its value sensor (regression guard)', async () => {
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.parent', section: 0, type: 'entity', name: '' },
        { id: 'sensor.child', section: 1, type: 'entity', name: '' },
      ],
      links: [
        { source: 'sensor.parent', target: 'sensor.child', value: 'sensor.cap' },
      ],
      sections: [{}, {}],
    };
    const { connections, element } = await renderChart(config);
    const conn = connections.find(
      c => c.parent.id === 'sensor.parent' && c.child.id === 'sensor.child',
    );
    expect(conn).toBeDefined();
    expect(conn.connection_entity_id).toBe('sensor.cap');
    expect(conn.state).toBe(30);
    element.remove();
  });

  it('caps two parallel cross-gap flows independently when sharing a passthrough chain', async () => {
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.parent_a', section: 0, type: 'entity', name: '' },
        { id: 'sensor.parent_b', section: 0, type: 'entity', name: '' },
        { id: 'sensor.target', section: 2, type: 'entity', name: '' },
      ],
      links: [
        { source: 'sensor.parent_a', target: 'sensor.target', value: 'sensor.cap_a' },
        { source: 'sensor.parent_b', target: 'sensor.target', value: 'sensor.cap_b' },
      ],
      sections: [{}, {}, {}],
    };
    const { connections, element } = await renderChart(config);
    const connA = connections.find(
      c => c.parent.id === 'sensor.parent_a' && c.child.id === 'sensor.target',
    );
    const connB = connections.find(
      c => c.parent.id === 'sensor.parent_b' && c.child.id === 'sensor.target',
    );
    expect(connA).toBeDefined();
    expect(connB).toBeDefined();
    expect(connA.connection_entity_id).toBe('sensor.cap_a');
    expect(connB.connection_entity_id).toBe('sensor.cap_b');
    expect(connA.state).toBe(10);
    expect(connB.state).toBe(20);
    element.remove();
  });
});

describe('Node filters + entity_id (sign-split signed sensors)', () => {
  // Power-mode autoconfig surfaces grid export / battery charge by attaching
  // a sibling node that reads the same signed stat_rate but flips its sign
  // (multiply:-1) before the positive clamp. See #357.
  const signedHass = mockHass({
    'sensor.signed_pos': {
      entity_id: 'sensor.signed_pos',
      state: '1000',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.signed_neg': {
      entity_id: 'sensor.signed_neg',
      state: '-500',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.sink': {
      entity_id: 'sensor.sink',
      state: '0',
      attributes: { unit_of_measurement: 'W' },
    },
  });

  async function renderSignedChart(config: SankeyChartConfig) {
    const element = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    element.hass = signedHass as HomeAssistant;
    element.setConfig(config, true);
    document.body.appendChild(element);
    await element.updateComplete;
    const base = element.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;
    return { element, base };
  }

  it('reads via entity_id and applies multiply:-1 filter (negative → positive)', async () => {
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      nodes: [
        // Synthetic node id; entity_id points at a signed sensor reading -500.
        // After multiply:-1 the raw value becomes +500, then the positive clamp keeps it.
        {
          id: 'sensor.signed_neg__to_auto',
          entity_id: 'sensor.signed_neg',
          filters: [{ multiply: -1 }],
          section: 0,
          type: 'entity',
          name: '',
        },
        { id: 'sensor.sink', section: 1, type: 'entity', name: '' },
      ],
      links: [{ source: 'sensor.signed_neg__to_auto', target: 'sensor.sink' }],
      sections: [{}, {}],
    };
    const { base, element } = await renderSignedChart(config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections = (base as any).sections as Array<any>;
    const sourceBox = sections[0].boxes.find(
      (b: { id: string }) => b.id === 'sensor.signed_neg__to_auto',
    );
    expect(sourceBox).toBeDefined();
    expect(sourceBox.state).toBe(500);
    element.remove();
  });
});

describe('Connection tooltip', () => {
  const tooltipHass = mockHass({
    'sensor.grid': {
      entity_id: 'sensor.grid',
      state: '300',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.house': {
      entity_id: 'sensor.house',
      state: '200',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.battery': {
      entity_id: 'sensor.battery',
      state: '100',
      attributes: { unit_of_measurement: 'W' },
    },
  });

  it('renders a title on each connection with source, target and value', async () => {
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.grid', section: 0, type: 'entity', name: 'Grid' },
        { id: 'sensor.house', section: 1, type: 'entity', name: 'House' },
        { id: 'sensor.battery', section: 1, type: 'entity', name: 'Battery' },
      ],
      links: [
        { source: 'sensor.grid', target: 'sensor.house' },
        { source: 'sensor.grid', target: 'sensor.battery' },
      ],
      sections: [{}, {}],
    };
    const element = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    element.hass = tooltipHass as HomeAssistant;
    element.setConfig(config, true);
    document.body.appendChild(element);
    await element.updateComplete;
    const base = element.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;

    // Grid (300W) feeds House first (200W), leaving 100W for Battery.
    const titles = Array.from(
      base.shadowRoot?.querySelectorAll('g.connectors path title') ?? [],
    ).map(t => t.textContent);
    expect(titles).toEqual(['Grid → House: 200W', 'Grid → Battery: 100W']);
    element.remove();
  });

  it('collapses multi-line node names into a single-line tooltip', async () => {
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.grid', section: 0, type: 'entity', name: 'Power\nMeter' },
        { id: 'sensor.house', section: 1, type: 'entity', name: 'Main\nHouse' },
      ],
      links: [{ source: 'sensor.grid', target: 'sensor.house' }],
      sections: [{}, {}],
    };
    const element = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    element.hass = tooltipHass as HomeAssistant;
    element.setConfig(config, true);
    document.body.appendChild(element);
    await element.updateComplete;
    const base = element.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;

    const title = base.shadowRoot?.querySelector('g.connectors path title')?.textContent;
    expect(title).toBe('Power Meter → Main House: 200W');
    element.remove();
  });

  it('scales the tooltip value with the box label under unit_prefix: auto', async () => {
    const autoHass = mockHass({
      'sensor.grid': {
        entity_id: 'sensor.grid',
        state: '2500',
        attributes: { unit_of_measurement: 'W' },
      },
      'sensor.house': {
        entity_id: 'sensor.house',
        state: '2500',
        attributes: { unit_of_measurement: 'W' },
      },
    });
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      unit_prefix: 'auto',
      round: 1,
      nodes: [
        { id: 'sensor.grid', section: 0, type: 'entity', name: 'Grid' },
        { id: 'sensor.house', section: 1, type: 'entity', name: 'House' },
      ],
      links: [{ source: 'sensor.grid', target: 'sensor.house' }],
      sections: [{}, {}],
    };
    const element = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    element.hass = autoHass as HomeAssistant;
    element.setConfig(config, true);
    document.body.appendChild(element);
    await element.updateComplete;
    const base = element.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;

    // 2500 W auto-scales to 2.5 kW; the tooltip must match the box label, not
    // show the raw base-unit value (2500W).
    const title = base.shadowRoot?.querySelector('g.connectors path title')?.textContent;
    const boxTitle = base.shadowRoot?.querySelector('g.box title')?.textContent;
    expect(title).toBe('Grid → House: 2.5kW');
    expect(boxTitle).toContain('2.5kW');
    element.remove();
  });
});

describe('Passthrough with multiple outgoing links (#390)', () => {
  const fanoutHass = mockHass({
    'sensor.grid': { entity_id: 'sensor.grid', state: '1000', attributes: { unit_of_measurement: 'W' } },
    'sensor.solar': { entity_id: 'sensor.solar', state: '3000', attributes: { unit_of_measurement: 'W' } },
    'sensor.inverter': { entity_id: 'sensor.inverter', state: '3000', attributes: { unit_of_measurement: 'W' } },
    'sensor.home': { entity_id: 'sensor.home', state: '800', attributes: { unit_of_measurement: 'W' } },
    'sensor.battery_charge': {
      entity_id: 'sensor.battery_charge',
      state: '700',
      attributes: { unit_of_measurement: 'W' },
    },
  });

  // Mirrors the issue: a passthrough in the middle column feeding two
  // different targets in the next column. The passthrough is listed first in
  // its section so the grid gets first claim on home and battery (#394).
  const config: SankeyChartConfig = {
    type: 'custom:sankey-chart',
    nodes: [
      { id: 'sensor.solar', section: 0, type: 'entity', name: 'Solar' },
      { id: 'sensor.grid', section: 0, type: 'entity', name: 'Grid' },
      { id: 'import_passthrough', section: 1, type: 'passthrough' },
      { id: 'sensor.inverter', section: 1, type: 'entity', name: 'Inverter' },
      { id: 'sensor.home', section: 2, type: 'entity', name: 'House' },
      { id: 'sensor.battery_charge', section: 2, type: 'entity', name: 'Battery' },
    ],
    links: [
      { source: 'sensor.solar', target: 'sensor.inverter' },
      { source: 'sensor.grid', target: 'import_passthrough' },
      { source: 'import_passthrough', target: 'sensor.home' },
      { source: 'import_passthrough', target: 'sensor.battery_charge' },
      { source: 'sensor.inverter', target: 'sensor.home' },
      { source: 'sensor.inverter', target: 'sensor.battery_charge' },
    ],
  };

  async function renderChart(conf: SankeyChartConfig) {
    const element = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    element.hass = fanoutHass as HomeAssistant;
    element.setConfig(conf, true);
    document.body.appendChild(element);
    await element.updateComplete;
    const base = element.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;
    return { element, base };
  }

  it('creates a connection for every link out of the passthrough', async () => {
    // Render errors (e.g. "Missing connection") are caught and shown as an
    // error card; stub that out so a regression fails cleanly in jsdom.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const renderErrorSpy = jest.spyOn(utils, 'renderError').mockResolvedValue(html``);
    const { element, base } = await renderChart(config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { connections, sections } = base as any;

    expect(renderErrorSpy).not.toHaveBeenCalled();
    expect(base.shadowRoot?.querySelector('svg.chart')).not.toBeNull();

    const fromGrid = connections.filter(c => c.parent.id === 'sensor.grid');
    expect(fromGrid.map(c => [c.child.id, c.passthroughs.map(p => p.id), c.state])).toEqual([
      ['sensor.home', ['import_passthrough'], 800],
      ['sensor.battery_charge', ['import_passthrough'], 200],
    ]);
    const passthroughBox = sections[1].boxes.find(b => b.id === 'import_passthrough');
    expect(passthroughBox.state).toBe(1000);
    // solar→inverter, grid→passthrough, passthrough→home, passthrough→battery, inverter→battery
    expect(base.shadowRoot?.querySelectorAll('.connectors path').length).toBe(5);

    consoleSpy.mockRestore();
    renderErrorSpy.mockRestore();
    element.remove();
  });

  it('does not loop forever on a passthrough cycle', () => {
    const base = window.document.createElement('sankey-chart-base') as Chart;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (base as any).config = utils.normalizeConfig({
      ...config,
      nodes: [...config.nodes!, { id: 'loop_passthrough', section: 2, type: 'passthrough' }],
      links: [
        ...config.links!,
        { source: 'import_passthrough', target: 'loop_passthrough' },
        { source: 'loop_passthrough', target: 'import_passthrough' },
      ],
    });
    base.willUpdate(new Map([['config', undefined]]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { connections } = base as any;
    expect(connections.filter(c => c.parent.id === 'sensor.grid').map(c => c.child.id)).toEqual([
      'sensor.home',
      'sensor.battery_charge',
    ]);
  });
});

describe('Passthrough flow priority (#394)', () => {
  const priorityHass = mockHass({
    'sensor.solar': { entity_id: 'sensor.solar', state: '5000', attributes: { unit_of_measurement: 'W' } },
    'sensor.se': { entity_id: 'sensor.se', state: '3000', attributes: { unit_of_measurement: 'W' } },
    'sensor.pw3': { entity_id: 'sensor.pw3', state: '2000', attributes: { unit_of_measurement: 'W' } },
    'sensor.battery': { entity_id: 'sensor.battery', state: '1500', attributes: { unit_of_measurement: 'W' } },
    'sensor.home': { entity_id: 'sensor.home', state: '1500', attributes: { unit_of_measurement: 'W' } },
    'sensor.export': { entity_id: 'sensor.export', state: '5000', attributes: { unit_of_measurement: 'W' } },
    'sensor.a': { entity_id: 'sensor.a', state: '100', attributes: { unit_of_measurement: 'W' } },
    'sensor.b': { entity_id: 'sensor.b', state: '100', attributes: { unit_of_measurement: 'W' } },
    'sensor.x': { entity_id: 'sensor.x', state: '100', attributes: { unit_of_measurement: 'W' } },
    'sensor.y': { entity_id: 'sensor.y', state: '100', attributes: { unit_of_measurement: 'W' } },
  });

  async function renderConnections(conf: SankeyChartConfig) {
    const element = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    element.hass = priorityHass as HomeAssistant;
    element.setConfig(conf, true);
    document.body.appendChild(element);
    await element.updateComplete;
    const base = element.shadowRoot?.querySelector('sankey-chart-base') as LitElement;
    await base.updateComplete;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connections = (base as any).connections as Array<any>;
    const flow = (parent: string, child: string) =>
      connections.find(c => c.parent.id === parent && c.child.id === child)?.state;
    return { element, flow };
  }

  it("allocates a passthrough's flows at the passthrough's position", async () => {
    // Trimmed from the issue: the battery reaches home through a passthrough
    // listed after the solar inverters, so solar must feed home first.
    const { element, flow } = await renderConnections({
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.solar', section: 0, type: 'entity', name: 'Solar' },
        { id: 'sensor.battery', section: 0, type: 'entity', name: 'Battery' },
        { id: 'sensor.se', section: 1, type: 'entity', name: 'SE' },
        { id: 'sensor.pw3', section: 1, type: 'entity', name: 'PW3' },
        { id: 'battery_passthrough', section: 1, type: 'passthrough' },
        { id: 'sensor.home', section: 2, type: 'entity', name: 'House' },
        { id: 'sensor.export', section: 2, type: 'entity', name: 'Export' },
      ],
      links: [
        { source: 'sensor.solar', target: 'sensor.se' },
        { source: 'sensor.solar', target: 'sensor.pw3' },
        { source: 'sensor.battery', target: 'battery_passthrough' },
        { source: 'sensor.se', target: 'sensor.home' },
        { source: 'sensor.pw3', target: 'sensor.home' },
        { source: 'battery_passthrough', target: 'sensor.home' },
        { source: 'sensor.se', target: 'sensor.export' },
        { source: 'sensor.pw3', target: 'sensor.export' },
        { source: 'battery_passthrough', target: 'sensor.export' },
      ],
    });
    expect(flow('sensor.se', 'sensor.home')).toBe(1500);
    expect(flow('sensor.pw3', 'sensor.home')).toBe(0);
    expect(flow('sensor.battery', 'sensor.home')).toBe(0);
    expect(flow('sensor.se', 'sensor.export')).toBe(1500);
    expect(flow('sensor.pw3', 'sensor.export')).toBe(2000);
    expect(flow('sensor.battery', 'sensor.export')).toBe(1500);
    element.remove();
  });

  it("keeps a source's link order when one link goes through a passthrough", async () => {
    // The battery lists home (through a passthrough) before pw3, and neither
    // target has another source, so home must get the battery's power.
    const { element, flow } = await renderConnections({
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.battery', section: 0, type: 'entity', name: 'Battery' },
        { id: 'sensor.pw3', section: 1, type: 'entity', name: 'PW3' },
        { id: 'battery_passthrough', section: 1, type: 'passthrough' },
        { id: 'sensor.home', section: 2, type: 'entity', name: 'House' },
      ],
      links: [
        { source: 'sensor.battery', target: 'battery_passthrough' },
        { source: 'sensor.battery', target: 'sensor.pw3' },
        { source: 'battery_passthrough', target: 'sensor.home' },
      ],
    });
    expect(flow('sensor.battery', 'sensor.home')).toBe(1500);
    expect(flow('sensor.battery', 'sensor.pw3')).toBe(0);
    element.remove();
  });

  it("keeps each source's link order when it conflicts with target order", async () => {
    // a prefers y (through a passthrough ranked after x), b prefers x. Each
    // target's order favors the other source, so the two orders form a cycle.
    const { element, flow } = await renderConnections({
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.a', section: 0, type: 'entity', name: 'A' },
        { id: 'sensor.b', section: 0, type: 'entity', name: 'B' },
        { id: 'sensor.x', section: 1, type: 'entity', name: 'X' },
        { id: 'a_passthrough', section: 1, type: 'passthrough' },
        { id: 'sensor.y', section: 2, type: 'entity', name: 'Y' },
      ],
      links: [
        { source: 'sensor.a', target: 'a_passthrough' },
        { source: 'sensor.a', target: 'sensor.x' },
        { source: 'a_passthrough', target: 'sensor.y' },
        { source: 'sensor.b', target: 'sensor.x' },
        { source: 'sensor.b', target: 'sensor.y' },
      ],
    });
    expect(flow('sensor.a', 'sensor.y')).toBe(100);
    expect(flow('sensor.a', 'sensor.x')).toBe(0);
    expect(flow('sensor.b', 'sensor.x')).toBe(100);
    expect(flow('sensor.b', 'sensor.y')).toBe(0);
    element.remove();
  });

  it("keeps a cross-gap link at its source's position", async () => {
    // The auto-inserted passthrough is invisible to the user, so solar's
    // direct link to home still outranks the battery in the middle column.
    const { element, flow } = await renderConnections({
      type: 'custom:sankey-chart',
      nodes: [
        { id: 'sensor.solar', section: 0, type: 'entity', name: 'Solar' },
        { id: 'sensor.battery', section: 1, type: 'entity', name: 'Battery' },
        { id: 'sensor.home', section: 2, type: 'entity', name: 'House' },
      ],
      links: [
        { source: 'sensor.solar', target: 'sensor.home' },
        { source: 'sensor.battery', target: 'sensor.home' },
      ],
    });
    expect(flow('sensor.solar', 'sensor.home')).toBe(1500);
    expect(flow('sensor.battery', 'sensor.home')).toBe(0);
    element.remove();
  });
});
