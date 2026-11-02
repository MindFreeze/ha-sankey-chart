import type { HomeAssistant } from 'custom-card-helpers';
import { Chart } from '../src/chart';
import { handleAction } from '../src/handle-actions';
import type { EntityConfigInternal } from '../src/types';

describe('handleAction', () => {
  it('uses entity_id for the default more-info action when the node id is synthetic', async () => {
    const chart = document.createElement('sankey-chart-base') as Chart;
    let entityId: string | undefined;
    chart.addEventListener('hass-more-info', event => {
      entityId = (event as CustomEvent<{ entityId: string }>).detail.entityId;
    });

    await handleAction(
      chart,
      {} as HomeAssistant,
      { id: 'custom_node', entity_id: 'sensor.real', children: [] } as EntityConfigInternal,
      'tap',
    );

    expect(entityId).toBe('sensor.real');
  });

  it('uses the node id for carbon nodes whose entity_id is a source declaration', async () => {
    const chart = document.createElement('sankey-chart-base') as Chart;
    let entityId: string | undefined;
    chart.addEventListener('hass-more-info', event => {
      entityId = (event as CustomEvent<{ entityId: string }>).detail.entityId;
    });

    await handleAction(
      chart,
      {} as HomeAssistant,
      {
        id: 'carbon_node',
        entity_id: 'sensor.grid',
        type: 'high_carbon_energy',
        children: [],
      } as EntityConfigInternal,
      'tap',
    );

    expect(entityId).toBe('carbon_node');
  });
});
