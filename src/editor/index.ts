/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult, css, CSSResultGroup, nothing } from 'lit';
import { HomeAssistant, fireEvent, LovelaceCardEditor, LovelaceConfig } from 'custom-card-helpers';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import { repeat } from 'lit/directives/repeat';
import { EntityConfig, SankeyChartConfig, SectionConfig } from '../types';
import { localize } from '../localize/localize';
import { getEntityId } from '../utils';
import './entity';
import { EntityConfigOrStr } from '../types';

@customElement('sankey-chart-editor')
export class SankeyChartEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public lovelace?: LovelaceConfig;
  @state() private _config?: SankeyChartConfig;
  @state() private _helpers?: any;
  @state() private _entityConfig?: { sectionIndex: number; entityIndex: number; entity: EntityConfigOrStr };
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

  private _initialize(): void {
    if (this.hass === undefined) return;
    if (this._config === undefined) return;
    if (this._helpers === undefined) return;
    this._initialized = true;

    if (!customElements.get('ha-form')) {
      (customElements.get('hui-button-card') as any)?.getConfigElement();
    }
    if (!customElements.get('ha-entity-picker')) {
      (customElements.get('hui-entities-card') as any)?.getConfigElement();
    }
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
    this._updateConfig();
  }

  private _addEntity(ev): void {
    const value = ev.detail.value;
    if (value === '') {
      return;
    }
    const target = ev.target;
    if (typeof target.section === 'number') {
      const sections: SectionConfig[] = this._config?.sections || [];
      this._config = {
        ...this._config!,
        sections: sections.map((section, i) =>
          i === target.section
            ? {
                ...section,
                entities: [...section.entities, value],
              }
            : section,
        ),
      };
    }
    ev.target.value = '';
    this._updateConfig();
  }

  private _editEntity(ev): void {
    const { value } = ev.detail;
    const newConf = typeof value === 'string' ? { entity_id: value } : value;
    const target = ev.target;
    if (typeof target.section === 'number' && typeof target.index === 'number') {
      const sections: SectionConfig[] = this._config?.sections || [];
      this._config = {
        ...this._config!,
        sections: sections.map((section, i) => {
          if (i !== target.section) {
            return section;
          }
          const existing = section.entities[target.index];
          const newVal = typeof existing === 'string' ? newConf : { ...existing, ...newConf };
          return {
            ...section,
            entities: newConf?.entity_id
              ? [...section.entities.slice(0, target.index), newVal, ...section.entities.slice(target.index + 1)]
              : section.entities.filter((e, i) => i !== target.index),
          };
        }),
      };
    }
    this._updateConfig();
  }

  private _configEntity(sectionIndex: number, entityIndex: number): void {
    const sections: SectionConfig[] = this._config?.sections || [];
    this._entityConfig = { sectionIndex, entityIndex, entity: sections[sectionIndex].entities[entityIndex] };
  }

  private _handleEntityConfig(entityConf: EntityConfig): void {
    this._editEntity({
      detail: { value: entityConf },
      target: { section: this._entityConfig?.sectionIndex, index: this._entityConfig?.entityIndex },
    });
  }

  private _updateConfig(): void {
    fireEvent(this, 'config-changed', { config: this._config });
  }

  protected render(): TemplateResult | void {
    if (!this.hass || !this._helpers) {
      return html``;
    }

    const config = this._config || ({} as SankeyChartConfig);
    const { autoconfig } = config;
    const sections: SectionConfig[] = config.sections || [];

    if (this._entityConfig) {
      return html`
        <sankey-chart-entity-editor
          .hass=${this.hass}
          .entity=${this._entityConfig.entity}
          .onChange=${this._handleEntityConfig.bind(this)}
          .onClose=${() => {
            this._entityConfig = undefined;
          }}
        />
      `;
    }

    return html`
      <div class="card-config">
        <div class="options">
          <h3>${localize('editor.autoconfig')}</h3>
          <ha-formfield .label=${localize('editor.enable')}>
            <ha-switch
              .checked=${!!autoconfig}
              .configValue=${(conf, val: boolean) => {
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
          ${autoconfig
            ? html`<ha-formfield .label=${localize('editor.print')}>
                <ha-switch
                  .checked=${!!autoconfig?.print_yaml}
                  .configValue=${(conf, print_yaml) => ({ ...conf, autoconfig: { print_yaml } })}
                  @change=${this._valueChanged}
                ></ha-switch>
              </ha-formfield>`
            : nothing}
        </div>
        ${autoconfig ? nothing : this._renderSections(sections)}
        <p>${localize('editor.yaml_disclaimer')}</p>
        <p>
          <a href="https://github.com/MindFreeze/ha-sankey-chart/blob/master/README.md">${localize('editor.docs')}</a>
        </p>
      </div>
    `;
  }

  private _renderSections(sections: SectionConfig[]): TemplateResult {
    return html`
      <div class="sections">
        <h3>${localize('editor.sections')}</h3>
        ${sections.map(
          (section, sectionIndex) =>
            html`
              <ha-card .header=${localize('editor.section') + ` ${sectionIndex + 1}`} class="section">
                <div class="entities">
                  ${repeat(
                    section.entities,
                    entityConf => sectionIndex + getEntityId(entityConf),
                    (entityConf, i) => html`
                      <div class="entity">
                        <div class="handle">
                          <ha-icon .icon=${'mdi:drag'} />
                        </div>
                        <ha-entity-picker
                          allow-custom-entity
                          hideClearIcon
                          .hass=${this.hass}
                          .value=${getEntityId(entityConf)}
                          .section=${sectionIndex}
                          .index=${i}
                          @value-changed=${this._editEntity}
                        ></ha-entity-picker>
                        <ha-icon-button
                          .label=${this.hass!.localize('ui.components.entity.entity-picker.edit')}
                          class="edit-icon"
                          @click=${() => this._configEntity(sectionIndex, i)}
                        >
                          <ha-icon .icon=${'mdi:pencil'} />
                        </ha-icon-button>
                      </div>
                    `,
                  )}
                </div>
                <ha-entity-picker
                  class="add-entity"
                  .hass=${this.hass}
                  .section=${sectionIndex}
                  @value-changed=${this._addEntity}
                ></ha-entity-picker>
              </ha-card>
            `,
        )}
        <ha-actions>
          <mwc-button
            ?raised=${false}
            .configValue=${conf => ({ ...conf, sections: [...conf.sections, { entities: [] }] })}
            @click=${this._valueChanged}
          >
            ${localize('editor.add_section')}
          </mwc-button>
        </ha-actions>
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return css`
      .card-config {
        padding: 16px;
      }
      .options {
        display: grid;
        margin-bottom: 20px;
      }
      .sections {
        display: flex;
        flex-direction: column;
        margin-bottom: 20px;
      }
      .section {
        margin-bottom: 16px;
        padding: 0 10px 10px;
      }
      ha-formfield {
        padding-bottom: 8px;
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
