import SankeyChart from '../src/ha-sankey-chart';

jest.mock('../src/editor/index', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

it('asks for a reload when the editor chunk fails to load', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(SankeyChart.getConfigElement()).rejects.toThrow(/Reload the page.*Failed to fetch/);
  expect(customElements.get('sankey-chart-editor')).toBeUndefined();
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});
