// import '../dist/ha-sankey-chart';
import { HomeAssistant } from 'custom-card-helpers';
import '../src/ha-sankey-chart';
import '../src/chart';
import SankeyChart from '../src/ha-sankey-chart';
import type { SankeyChartConfig } from '../src/types';
import mockHass from './__mocks__/hass.mock';
import { LitElement } from 'lit';

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
