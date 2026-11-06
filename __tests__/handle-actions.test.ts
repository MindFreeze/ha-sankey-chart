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
  it('performs the action written by the HA action editor', async () => {
    const chart = document.createElement('sankey-chart-base') as Chart;
    const callService = jest.fn();

    await handleAction(
      chart,
      { callService } as unknown as HomeAssistant,
      {
        id: 'node',
        children: [],
        tap_action: {
          action: 'perform-action',
          perform_action: 'light.toggle',
          data: { brightness: 5 },
          target: { entity_id: 'light.kitchen' },
        },
      } as EntityConfigInternal,
      'tap',
    );

    expect(callService).toHaveBeenCalledWith('light', 'toggle', { brightness: 5 }, { entity_id: 'light.kitchen' });
  });
  it('accepts either action key like HA, and says so when none is set', async () => {
    const chart = document.createElement('sankey-chart-base') as Chart;
    const callService = jest.fn();
    const localize = jest.fn((key: string) => (key.endsWith('no_action') ? 'No action' : ''));
    const toasts: unknown[] = [];
    chart.addEventListener('hass-notification', event => toasts.push((event as CustomEvent).detail));
    const hass = { callService, localize } as unknown as HomeAssistant;
    const node = (tap_action: unknown) => ({ id: 'node', children: [], tap_action } as EntityConfigInternal);

    await handleAction(chart, hass, node({ action: 'perform-action', service: 'light.toggle' }), 'tap');
    expect(callService).toHaveBeenCalledWith('light', 'toggle', undefined, undefined);

    // what HA's action editor writes before an action is picked
    await handleAction(chart, hass, node({ action: 'perform-action', perform_action: '' }), 'tap');
    expect(callService).toHaveBeenCalledTimes(1);
    expect(toasts).toEqual([{ message: 'No action' }]);
  });
});
