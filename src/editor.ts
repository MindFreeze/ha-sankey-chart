/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult, css, CSSResultGroup } from 'lit';
import { HomeAssistant, fireEvent, LovelaceCardEditor, ActionConfig } from 'custom-card-helpers';

import { SankeyChartConfig } from './types';
import { customElement, property, state } from 'lit/decorators';
import { localize } from './localize/localize';

type MutateConfigFn = (config: SankeyChartConfig) => SankeyChartConfig;

@customElement('sankey-chart-editor')
export class SankeyChartEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SankeyChartConfig;
  @state() private _helpers?: any;
  private _initialized = false;

  public setConfig(config: SankeyChartConfig): void {
    this._config = config;

    this.loadCardHelpers();
  }

  protected shouldUpdate(): boolean {
    if (!this._initialized) {
      this._initialize();
    }

    return true;
  }

  protected render(): TemplateResult | void {
    if (!this.hass || !this._helpers) {
      return html``;
    }

    // The climate more-info has ha-switch and paper-dropdown-menu elements that are lazy loaded unless explicitly done here
    // this._helpers.importMoreInfoControl('climate');

    // You can restrict on domain type
    // const entities = Object.keys(this.hass.states).filter(eid => eid.substr(0, eid.indexOf('.')) === 'sun');

    return html`
      <div class="card-config">
        <div class="values">
          <h3>${localize('editor.autoconfig')}</h3>
          <ha-formfield .label=${localize('editor.enable')}>
            <ha-switch
              .checked=${!!this._config?.autoconfig}
              .configValue=${(conf, val) => {
                const newConf = { ...conf };
                if (val && !conf.autoconfig) {
                  newConf.autoconfig = { print_yaml: false };
                } else if (!val && conf.autoconfig) {
                  delete newConf.autoconfig;
                }
                return newConf;
              }}
              @change=${this._valueChanged}
            ></ha-switch>
          </ha-formfield>
          <ha-formfield .label=${localize('editor.print')}>
            <ha-switch
              .checked=${!!this._config?.autoconfig?.print_yaml}
              .configValue=${(conf, print_yaml) => ({ ...conf, autoconfig: { print_yaml } })}
              @change=${this._valueChanged}
            ></ha-switch>
          </ha-formfield>
        </div>
        <p>${localize('editor.yaml_disclaimer')}</p>
        <p><a href="https://github.com/MindFreeze/ha-sankey-chart/blob/master/README.md">Documentation</a></p>
      </div>
    `;
  }

  private _initialize(): void {
    if (this.hass === undefined) return;
    if (this._config === undefined) return;
    if (this._helpers === undefined) return;
    this._initialized = true;
  }

  private async loadCardHelpers(): Promise<void> {
    this._helpers = await (window as any).loadCardHelpers();
  }

  private _valueChanged(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    if (target.configValue) {
      if (typeof target.configValue === 'function') {
        this._config = target.configValue(this._config, target.checked !== undefined ? target.checked : target.value);
      } else if (target.value === '') {
        const tmpConfig = { ...this._config };
        delete tmpConfig[target.configValue];
        this._config = tmpConfig;
      } else {
        this._config = {
          ...this._config,
          [target.configValue]: target.checked !== undefined ? target.checked : target.value,
        };
      }
    }
    fireEvent(this, 'config-changed', { config: this._config });
  }

  static get styles(): CSSResultGroup {
    return css`
      .card-config {
        padding: 16px;
        background: var(--secondary-background-color);
      }
      .values {
        display: grid;
        margin-bottom: 20px;
      }
      ha-formfield {
        padding-bottom: 8px;
      }
    `;
  }
}
