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

  it('loads the editor and its strings on demand', async () => {
    const editor = (await SankeyChart.getConfigElement()) as unknown as HTMLElement;
    expect(editor.localName).toBe('sankey-chart-editor');
    expect(customElements.get('sankey-chart-editor')).toBeDefined();
    expect(localize('editor.preview.add_node')).toBe('Add node');
  });
});
