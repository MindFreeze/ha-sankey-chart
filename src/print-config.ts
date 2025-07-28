import { LitElement, html, TemplateResult, PropertyValues } from 'lit';
import { customElement, property, query } from 'lit/decorators';
import { HomeAssistant } from 'custom-card-helpers';
import type { Config } from './types';

@customElement('sankey-chart-print-config')
export class PrintConfig extends LitElement {
  public hass!: HomeAssistant;
  @property({ attribute: false }) public config!: Config;

  @query('ha-yaml-editor')
  private yamlEditor!: HTMLTextAreaElement;

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config || !this.hass) {
      return false;
    }
    return changedProps.has('config');
  }

  firstUpdated() {
    // @ts-ignore
    this.yamlEditor.setValue(this.config);
  }

  protected render(): TemplateResult | void {
    return html`<ha-yaml-editor read-only></ha-yaml-editor>`;
  }
}

export default PrintConfig;
