import type { LitElement } from 'lit';
import SankeyChart from '../src/ha-sankey-chart';
import { localize } from '../src/localize/localize';

describe('lazy editor', () => {
  it('does not load the editor with the card', () => {
    expect(customElements.get('sankey-chart')).toBeDefined();
    expect(customElements.get('sankey-chart-editor')).toBeUndefined();
    const base = customElements.get('sankey-chart-base') as unknown as typeof LitElement;
    const css = base.elementStyles.map(String).join('');
    expect(css).toContain('.chart');
    expect(css).not.toContain('drop-column');
    expect(localize('common.loading')).toBe('Loading...');
    expect(localize('editor.preview.add_node')).toBeUndefined();
  });

  it('loads the editor once, without defining the card again', async () => {
    const define = jest.spyOn(customElements, 'define');
    const editor = (await SankeyChart.getConfigElement()) as unknown as HTMLElement;
    expect(editor.localName).toBe('sankey-chart-editor');
    expect(localize('editor.preview.add_node')).toBe('Add node');

    const tags = define.mock.calls.map(([tag]) => tag);
    expect(tags).toContain('sankey-chart-editor');
    expect(tags).not.toContain('sankey-chart');
    expect(tags).not.toContain('sankey-chart-base');

    await SankeyChart.getConfigElement();
    expect(define).toHaveBeenCalledTimes(tags.length);
    define.mockRestore();
  });
});
