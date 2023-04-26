import { HomeAssistant } from 'custom-card-helpers';
import { LitElement, html, TemplateResult, css, CSSResultGroup } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property } from 'lit/decorators';
import { EntityConfigOrStr } from '../types';
import { localize } from '../localize/localize';
import { repeat } from 'lit/directives/repeat';

const schema = [
  {
    name: 'type',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'entity', label: localize('editor.entity_types.entity') },
          { value: 'remaining_parent_state', label: localize('editor.entity_types.remaining_parent_state') },
          { value: 'remaining_child_state', label: localize('editor.entity_types.remaining_child_state') },
          { value: 'passthrough', label: localize('editor.entity_types.passthrough') },
        ],
      },
    },
  },
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

  private _editChild(ev) {
    const {
      detail: { value },
      target,
    } = ev;
    const conf = typeof this.entity === 'string' ? { entity_id: this.entity } : this.entity;
    let children = conf.children ?? [];
    if (typeof target?.index === 'number') {
      if (value) {
        children[target.index] = value;
      } else {
        children = children.filter((_, i) => i !== target.index);
      }
    } else if (value) {
      children = [...children, value];
      target.value = '';
    }
    this.onChange({ ...conf, children });
  }

  protected render(): TemplateResult | void {
    const data = typeof this.entity === 'string' ? { entity_id: this.entity } : this.entity;
    return html`
      <div class="header">
        <ha-icon-button .label=${this.hass!.localize('ui.common.back')} @click=${this.onClose}>
          <ha-icon .icon=${'mdi:arrow-left'} />
        </ha-icon-button>
        <h2>${localize('editor.entity_editor')}</h2>
      </div>
      <div>
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${schema}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._valueChanged}
        ></ha-form>

        <ha-card class="children" .header=${localize('editor.fields.children')}>
          ${repeat(
            data.children || [],
            entityId => entityId,
            (entityId, i) => html`
              <div class="child">
                <ha-entity-picker
                  allow-custom-entity
                  hideClearIcon
                  .hass=${this.hass}
                  .value=${entityId}
                  .index=${i}
                  @value-changed=${this._editChild}
                ></ha-entity-picker>
              </div>
            `,
          )}
          <ha-entity-picker class="add-entity" .hass=${this.hass} @value-changed=${this._editChild}></ha-entity-picker>
        </ha-card>
      </div>
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
      .children {
        margin-top: 10px;
        padding: 0 10px 10px;
      }
      .child {
        margin-bottom: 8px;
      }
    `;
  }
}
