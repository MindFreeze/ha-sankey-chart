import { HomeAssistant } from 'custom-card-helpers';
import { LitElement, html, TemplateResult, css, CSSResultGroup } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property } from 'lit/decorators';
import { EntityConfigOrStr } from '../types';
import { localize } from '../localize/localize';

const schema = [
  { name: 'entity_id', selector: { entity: {} } },
  { name: 'name', selector: { text: {} } },
];

@customElement('sankey-chart-entity-editor')
export class SankeyChartEntityEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public entity!: EntityConfigOrStr;
  @property({ attribute: false }) public onClose!: () => void;
  @property({ attribute: false }) public onChange!: (c: EntityConfigOrStr) => void;

  private _valueChanged(ev: CustomEvent): void {
    this.onChange(ev.detail.value);
  }

  private _computeLabel = (schema: { name: string }) => {
    return localize('editor.fields.' + schema.name);
  };

  protected render(): TemplateResult | void {
    const data = typeof this.entity === 'string' ? { entity_id: this.entity } : this.entity;
    return html`
      <div class="header">
        <ha-icon-button .label=${this.hass!.localize('ui.common.back')} @click=${this.onClose}>
          <ha-icon .icon=${'mdi:arrow-left'} />
        </ha-icon-button>
        <h2>${localize('editor.entity_editor')}</h2>
      </div>
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      />
    `;
  }

  static get styles(): CSSResultGroup {
    return css`
      .header {
        display: flex;
        align-items: center;
      }
      .header ha-icon {
        display: flex;
      }
    `;
  }
}
