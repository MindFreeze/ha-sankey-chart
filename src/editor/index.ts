/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult, css, CSSResultGroup, nothing } from 'lit';
import { HomeAssistant, fireEvent, LovelaceCardEditor, LovelaceConfig } from 'custom-card-helpers';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import { repeat } from 'lit/directives/repeat';
import { SankeyChartConfig, SectionConfig } from '../types';
import { localize } from '../localize/localize';
import { normalizeConfig } from '../utils';
import './section';
import './entity';
import { EntityConfigOrStr } from '../types';
import { UNIT_PREFIXES } from '../const';

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
    } else {
      this._config = { ...ev.detail.value };
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

  private _handleEntityChange = (entityConf: EntityConfigOrStr): void => {
    this._editEntity({
      detail: { value: entityConf },
      target: { section: this._entityConfig?.sectionIndex, index: this._entityConfig?.entityIndex },
    });
    this._entityConfig = { ...this._entityConfig!, entity: entityConf };
  };

  private _handleSectionChange = (index: number, sectionConf: SectionConfig): void => {
    this._config = {
      ...this._config!,
      sections: this._config?.sections?.map((section, i) => (i === index ? sectionConf : section)),
    };
    this._updateConfig();
  };

  private _updateConfig(): void {
    fireEvent(this, 'config-changed', { config: this._config });
  }

  private _computeSchema() {
    return [
      // {
      //   type: 'grid',
      //   name: '',
      //   schema: [
      //     { name: 'autoconfig', selector: { boolean: {} } },
      //     { name: 'autoconfig.print_yaml', selector: { boolean: {} } },
      //   ],
      // },
      { name: 'title', selector: { text: {} } },
      { name: 'show_names', selector: { boolean: {} } },
      { name: 'show_icons', selector: { boolean: {} } },
      { name: 'show_states', selector: { boolean: {} } },
      { name: 'show_units', selector: { boolean: {} } },
      { name: 'energy_date_selection', selector: { boolean: {} } },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'wide', selector: { boolean: {} } },
          { name: 'height', selector: { number: { mode: 'box', unit_of_measurement: 'px' } } },
          { name: 'min_box_height', selector: { number: { mode: 'box', unit_of_measurement: 'px' } } },
          { name: 'min_box_distance', selector: { number: { mode: 'box', unit_of_measurement: 'px' } } },
        ],
      },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'min_state', selector: { number: { mode: 'box', min: 0., step: 'any' } } },
          { name: 'static_scale', selector: { number: { mode: 'box' } } },
          { name: 'round', selector: { number: { mode: 'box', unit_of_measurement: localize('editor.decimals') } } },
          { name: 'throttle', selector: { number: { mode: 'box', unit_of_measurement: 'ms' } } },
          {
            name: 'unit_prefix',
            selector: {
              select: {
                mode: 'dropdown',
                options: [{ value: '' }, ...Object.keys(UNIT_PREFIXES).map(key => ({ value: key, label: key }))],
              },
            },
          },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }) => {
    return localize('editor.fields.' + schema.name);
  };

  protected render(): TemplateResult | void {
    if (!this.hass || !this._helpers) {
      return html``;
    }

    const isMetric = this.hass.config.unit_system.length == "km";
    const config = normalizeConfig(this._config || ({} as SankeyChartConfig), isMetric);
    const { autoconfig } = config;
    const sections: SectionConfig[] = config.sections || [];

    if (this._entityConfig) {
      return html`
        <sankey-chart-entity-editor
          .hass=${this.hass}
          .entity=${this._entityConfig.entity}
          .onChange=${this._handleEntityChange}
          .onClose=${() => {
            this._entityConfig = undefined;
          }}
        ></sankey-chart-entity-editor>
      `;
    }

    return html`
      <div class="card-config">
        <div class="options">
          <div class="autoconfig">
            <ha-formfield .label=${localize('editor.fields.autoconfig')}>
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
              ? html`<ha-formfield .label=${localize('editor.fields.print_yaml')}>
                  <ha-switch
                    .checked=${!!autoconfig?.print_yaml}
                    .configValue=${(conf, print_yaml) => ({ ...conf, autoconfig: { print_yaml } })}
                    @change=${this._valueChanged}
                  ></ha-switch>
                </ha-formfield>`
              : nothing}
          </div>

          <ha-form
            .hass=${this.hass}
            .data=${config}
            .schema=${this._computeSchema()}
            .computeLabel=${this._computeLabel}
            @value-changed=${this._valueChanged}
          ></ha-form>
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
        ${repeat(
          sections,
          (s, i) => i,
          (section, sectionIndex) =>
            html`
              <sankey-chart-section-editor
                .hass=${this.hass}
                .section=${section}
                .index=${sectionIndex}
                .onConfigEntity=${this._configEntity.bind(this, sectionIndex)}
                .onChange=${this._handleSectionChange.bind(this, sectionIndex)}
                .onChangeEntity=${this._editEntity.bind(this)}
                .onAddEntity=${this._addEntity.bind(this)}
              ></sankey-chart-section-editor>
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
      .autoconfig {
        display: flex;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      .sections {
        display: flex;
        flex-direction: column;
        margin-bottom: 20px;
      }
      ha-formfield {
          padding-bottom: 8px;
      }
    `;
  }
}
