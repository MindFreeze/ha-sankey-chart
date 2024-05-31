// import '../dist/ha-sankey-chart';
import { HomeAssistant } from 'custom-card-helpers';
import '../src/ha-sankey-chart';
import SankeyChart from '../src/ha-sankey-chart';
import { SankeyChartConfig } from '../src/types';
import mockHass from './__mocks__/hass.mock';
import { LitElement } from 'lit';

const hass = mockHass();

describe('SankeyChart with remaining type entities', () => {
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

  it('matches snapshot', async () => {
    const config: SankeyChartConfig = {
      type: 'custom:sankey-chart',
      title: 'Remaining test',
      show_states: true,
      min_state: 0.1,
      unit_prefix: 'k',
      round: 1,
      sections: [
        {
          entities: [
            {
              entity_id: 'sensor.test_power',
              name: 'Total',
              color: 'var(--warning-color)',
              children: ['tt', 'sensor.test_power3', 'Annet'],
            },
          ],
        },
        {
          entities: [
            {
              entity_id: 'tt',
              type: 'remaining_child_state',
              name: 'Total\nAll\nAll\nAll\nAll\nAll\nIDK\nIDK\nIDK\nIDK\nIDK\nIDK\nIDK\nIDK\nIDK',
              color: 'var(--warning-color)',
              children: ['sensor.test_power1', 'sensor.test_power2', 'sensor.test_power4'],
              color_on_state: true,
              color_limit: 10.1,
              color_below: 'darkslateblue',
            },
          ],
        },
        {
          entities: [
            {
              entity_id: 'sensor.test_power1',
              name: 'Varmtvann\nBlaa',
              children: ['sensor.test_power3'],
            },
            {
              entity_id: 'sensor.test_power2',
              name: 'Avfukter',
              unit_of_measurement: 'В',
              children: ['sensor.test_power3'],
            },
            {
              entity_id: 'sensor.test_power4',
              children: ['sensor.test_power3'],
            },
            {
              entity_id: 'Annet',
              type: 'remaining_child_state',
              name: 'Annet',
              children: ['sensor.test_power3'],
            },
          ],
        },
        {
          entities: [
            {
              entity_id: 'switch.plug_158d00022adfd9',
              attribute: 'load_power',
              unit_of_measurement: 'Wh',
              tap_action: {
                action: 'toggle',
              },
            },
          ],
        },
        {
          entities: [
            {
              entity_id: 'sensor.test_power3',
              color_below: 'red',
              color: 'red',
              color_limit: 14000,
            },
          ],
        },
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
