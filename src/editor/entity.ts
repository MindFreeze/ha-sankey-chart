import { HomeAssistant, stateIcon } from 'custom-card-helpers';
import { LitElement, html, TemplateResult, css, CSSResultGroup } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property } from 'lit/decorators';
import { EntityConfig, EntityConfigOrStr } from '../types';
import { localize } from '../localize/localize';
import { repeat } from 'lit/directives/repeat';
import { DEFAULT_ENTITY_CONF } from '../const';

const computeSchema = (entityConf: EntityConfig, icon: string) => [
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
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'attribute', selector: { attribute: { entity_id: entityConf.entity_id } } },
      { name: 'unit_of_measurement', selector: { text: {} } },
    ],
  },
  { name: 'name', selector: { text: {} } },
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'icon', selector: { icon: { placeholder: icon } } },
      { name: 'color', selector: { text: {} } },
    ],
  },
  { name: 'tap_action', selector: { 'ui-action': {} } },
  { name: 'color_on_state', selector: { boolean: {} } },
  ...(entityConf.color_on_state
    ? [
        {
          name: 'color_limit',
          selector: { number: { mode: 'box', unit_of_measurement: entityConf.unit_of_measurement, min: 0., step: 'any' } },
        },
        { name: 'color_above', selector: { text: {} } },
        { name: 'color_below', selector: { text: {} } },
      ]
    : []),
];

@customElement('sankey-chart-entity-editor')
class SankeyChartEntityEditor extends LitElement {
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

  private _editChild(
    ev: CustomEvent & {
      target: {
        value: string;
        index: number;
      };
    },
  ) {
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

  private _getEntityIcon(entityId: string) {
    const entityState = this.hass.states[entityId];
    return entityState ? stateIcon(entityState) : undefined;
  }

  protected render(): TemplateResult | void {
    const conf = typeof this.entity === 'string' ? { entity_id: this.entity } : this.entity;
    const data = { ...DEFAULT_ENTITY_CONF, ...conf };

    const icon = data.icon || this._getEntityIcon(conf.entity_id);

    const schema = computeSchema(data, icon);
    return html`
      <div class="header">
        <ha-icon-button .label=${this.hass!.localize('ui.common.back')} @click=${this.onClose}>
          <ha-icon .icon=${'mdi:arrow-left'}></ha-icon>
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
          <ha-entity-picker
            class="add-entity"
            allow-custom-entity
            .hass=${this.hass}
            @value-changed=${this._editChild}
          ></ha-entity-picker>
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

export default SankeyChartEntityEditor;
