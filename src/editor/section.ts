import { HomeAssistant } from 'custom-card-helpers';
import { LitElement, html, TemplateResult, css, CSSResultGroup } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property } from 'lit/decorators';
import { SectionConfig } from '../types';
import { localize } from '../localize/localize';
import { repeat } from 'lit/directives/repeat';
import { getEntityId } from '../utils';

@customElement('sankey-chart-section-editor')
class SankeyChartSectionEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public section!: SectionConfig;
  @property({ attribute: false }) public index!: number;
  @property({ attribute: false }) public onChange!: (sectionConf: SectionConfig) => void;
  @property({ attribute: false }) public onConfigEntity!: (entityIndex: number) => void;
  @property({ attribute: false }) public onChangeEntity!: (ev: CustomEvent) => void;
  @property({ attribute: false }) public onAddEntity!: (ev: CustomEvent) => void;

  private _valueChanged(ev: CustomEvent): void {
    const { value } = ev.detail;
    this.onChange({ ...value, sort_by: value.sort_by || undefined, sort_dir: value.sort_dir || undefined });
  }

  private _computeSchema = () => {
    return [
      { name: 'min_width', selector: { text: {} } },
      {
        type: 'grid',
        name: '',
        schema: [
          {
            name: 'sort_by',
            selector: {
              select: {
                mode: 'dropdown',
                options: [{ value: '' }, { value: 'state', label: localize('editor.sort_by.state') }],
              },
            },
          },
          {
            name: 'sort_dir',
            selector: {
              select: {
                mode: 'dropdown',
                options: [
                  { value: '' },
                  { value: 'desc', label: localize('editor.sort_dir.desc') },
                  { value: 'asc', label: localize('editor.sort_dir.asc') },
                ],
              },
            },
          },
          { name: 'sort_group_by_parent', selector: { boolean: {} } },
        ],
      },
    ];
  };

  private _computeLabel = (schema: { name: string }) => {
    return localize('editor.fields.section.' + schema.name);
  };

  protected render(): TemplateResult | void {
    return html`
      <ha-card class="section">
        <ha-expansion-panel
          .header=${localize('editor.section') + ` ${this.index + 1}`}
          .secondary=${localize('editor.section_options')}
          .leftChevron=${true}
        >
          <br />
          <ha-form
            .hass=${this.hass}
            .data=${this.section}
            .schema=${this._computeSchema()}
            .computeLabel=${this._computeLabel}
            @value-changed=${this._valueChanged}
          ></ha-form>
          <br />
        </ha-expansion-panel>

        <div class="entities">
          ${repeat(
            this.section.entities,
            entityConf => this.index + getEntityId(entityConf),
            (entityConf, i) => html`
              <div class="entity">
                <div class="handle">
                  <ha-icon .icon=${'mdi:drag'}></ha-icon>
                </div>
                <ha-entity-picker
                  allow-custom-entity
                  .hass=${this.hass}
                  .value=${getEntityId(entityConf)}
                  .section=${this.index}
                  .index=${i}
                  @value-changed=${this.onChangeEntity}
                ></ha-entity-picker>
                <ha-icon-button
                  .label=${this.hass!.localize('ui.components.entity.entity-picker.edit')}
                  class="edit-icon"
                  @click=${() => this.onConfigEntity(i)}
                >
                  <ha-icon .icon=${'mdi:pencil'}></ha-icon>
                </ha-icon-button>
              </div>
            `,
          )}
        </div>
        <ha-entity-picker
          allow-custom-entity
          class="add-entity"
          .hass=${this.hass}
          .section=${this.index}
          @value-changed=${this.onAddEntity}
        ></ha-entity-picker>
      </ha-card>
    `;
  }

  static get styles(): CSSResultGroup {
    return css`
      .section {
        margin-bottom: 16px;
        padding: 0 10px 10px;
      }
      .add-entity {
        display: block;
        margin-left: 31px;
        margin-right: 36px;
        margin-inline-start: 31px;
        margin-inline-end: 36px;
        direction: var(--direction);
      }
      .entity {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }

      .entity .handle {
        visibility: hidden;
        padding-right: 8px;
        cursor: move;
        padding-inline-end: 8px;
        padding-inline-start: initial;
        direction: var(--direction);
      }
      .entity .handle > * {
        pointer-events: none;
      }

      .entity ha-entity-picker {
        flex-grow: 1;
      }

      .edit-icon {
        --mdc-icon-button-size: 36px;
        /* color: var(--secondary-text-color); */
      }
    `;
  }
}

export default SankeyChartSectionEditor;
