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
