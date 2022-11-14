// import '../dist/ha-sankey-chart';
import { HomeAssistant } from 'custom-card-helpers';
import '../src/ha-sankey-chart';
import { SankeyChart } from '../src/ha-sankey-chart';
import { SankeyChartConfig } from '../src/types';

const hass = {
  states: {
    ent1: {
      entity_id: 'ent1',
      state: 2,
      attributes: {
        unit_of_measurement: 'W',
      },
    },
    ent2: {
      entity_id: 'ent2',
      state: 1,
      attributes: {
        unit_of_measurement: 'W',
      },
    },
    ent3: {
      entity_id: 'ent3',
      state: 1,
      attributes: {
        unit_of_measurement: 'W',
      },
    },
  },
};

describe('SankeyChart', () => {
  const ROOT_TAG = 'sankey-chart';
  let sankeyChart: SankeyChart;

  beforeEach(() => {
    sankeyChart = window.document.createElement(ROOT_TAG) as SankeyChart;
    // @ts-ignore
    sankeyChart.hass = hass as HomeAssistant;
    document.body.appendChild(sankeyChart);
  });

  afterEach(() => {
    document.body.getElementsByTagName(ROOT_TAG)[0].remove();
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
    sankeyChart.setConfig(config);
    await sankeyChart.updateComplete;

    expect(sankeyChart.shadowRoot?.innerHTML.replace(/<!--.+-->/g, '')).toMatchSnapshot();
  });
});
