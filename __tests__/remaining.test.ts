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
      nodes: [
        {
          id: 'sensor.test_power',
          section: 0,
          type: 'entity',
          name: 'Total',
          color: 'var(--warning-color)',
        },
        {
          id: 'tt',
          section: 1,
          type: 'remaining_child_state',
          name: 'Total\nAll\nAll\nAll\nAll\nAll\nIDK\nIDK\nIDK\nIDK\nIDK\nIDK\nIDK\nIDK\nIDK',
          color: {
            'darkslateblue': { to: 10.1 },
            'var(--warning-color)': { from: 10.1 },
          },
        },
        {
          id: 'sensor.test_power1',
          section: 2,
          type: 'entity',
          name: 'Varmtvann\nBlaa',
        },
        {
          id: 'sensor.test_power2',
          section: 2,
          type: 'entity',
          name: 'Avfukter',
          unit_of_measurement: 'В',
        },
        {
          id: 'sensor.test_power4',
          section: 2,
          type: 'entity',
          name: '',
        },
        {
          id: 'Annet',
          section: 2,
          type: 'remaining_child_state',
          name: 'Annet',
        },
        {
          id: 'switch.plug_158d00022adfd9',
          section: 3,
          type: 'entity',
          name: '',
          attribute: 'load_power',
          unit_of_measurement: 'Wh',
          tap_action: {
            action: 'toggle',
          },
        },
        {
          id: 'sensor.test_power3',
          section: 4,
          type: 'entity',
          name: '',
          color: {
            'red': { to: 14000 },
          },
        },
      ],
      links: [
        { source: 'sensor.test_power', target: 'tt' },
        { source: 'sensor.test_power', target: 'sensor.test_power3' },
        { source: 'sensor.test_power', target: 'Annet' },
        { source: 'tt', target: 'sensor.test_power1' },
        { source: 'tt', target: 'sensor.test_power2' },
        { source: 'tt', target: 'sensor.test_power4' },
        { source: 'sensor.test_power1', target: 'sensor.test_power3' },
        { source: 'sensor.test_power2', target: 'sensor.test_power3' },
        { source: 'sensor.test_power4', target: 'sensor.test_power3' },
        { source: 'Annet', target: 'sensor.test_power3' },
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
