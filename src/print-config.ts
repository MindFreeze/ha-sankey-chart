import { LitElement, html, TemplateResult, PropertyValues } from 'lit';
import { until } from 'lit/directives/until.js';
import { customElement, property } from 'lit/decorators';
import { HomeAssistant } from 'custom-card-helpers';
import type { Config } from './types';
import { renderError } from './utils';

@customElement('sankey-chart-print-config')
export class PrintConfig extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public config!: Config;

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config || !this.hass) {
      return false;
    }
    return changedProps.has('config');
  }

  protected render(): TemplateResult | void {
    return html`${until(renderError('', this.config, this.hass))}`
  }
}

export default PrintConfig;
