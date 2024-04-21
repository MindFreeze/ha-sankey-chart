// import '../dist/ha-sankey-chart';
import { HomeAssistant } from 'custom-card-helpers';
import '../src/ha-sankey-chart';
import '../src/chart';
import SankeyChart from '../src/ha-sankey-chart';
import { SankeyChartConfig } from '../src/types';
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

describe('SankeyChart', () => {
  const ROOT_TAG = 'sankey-chart';
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
      sections: [
        {
          entities: [
            {
              entity_id: 'ent1',
              children: ['ent2', 'ent3'],
            },
          ],
        },
        { entities: ['ent2', 'ent3'] },
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
