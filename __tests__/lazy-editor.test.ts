import SankeyChart from '../src/ha-sankey-chart';

describe('lazy editor', () => {
  it('does not load the editor with the card', () => {
    expect(customElements.get('sankey-chart')).toBeDefined();
    expect(customElements.get('sankey-chart-editor')).toBeUndefined();
  });

  it('loads the editor once, without defining the card again', async () => {
    const define = jest.spyOn(customElements, 'define');
    const editor = (await SankeyChart.getConfigElement()) as unknown as HTMLElement;
    expect(editor.localName).toBe('sankey-chart-editor');

    const tags = define.mock.calls.map(([tag]) => tag);
    expect(tags).toContain('sankey-chart-editor');
    expect(tags).not.toContain('sankey-chart');
    expect(tags).not.toContain('sankey-chart-base');

    await SankeyChart.getConfigElement();
    expect(define).toHaveBeenCalledTimes(tags.length);
    define.mockRestore();
  });
});
