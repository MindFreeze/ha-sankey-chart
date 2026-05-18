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
    // The internal `Config.sections[*].entities` is derived from `nodes`/`links`
    // via convertNodesToSections. If it ends up in the pasted-back YAML,
    // normalizeConfig's v3 detection (sections[*].entities truthy) triggers
    // migrateV3Config, which discards the v4 nodes/links and rebuilds them
    // from undefined entity_ids — see #356.
    const { sections, autoconfig, ...rest } = this.config;
    const printable: Record<string, unknown> = {
      ...rest,
      sections: sections.map(({ entities: _entities, ...sectionConfig }) => sectionConfig),
    };
    if (autoconfig) {
      printable.autoconfig = { ...autoconfig, print_yaml: false };
    }
    // @ts-ignore
    this.yamlEditor.setValue(printable);
  }

  protected render(): TemplateResult | void {
    return html`<ha-yaml-editor read-only></ha-yaml-editor>`;
  }
}

export default PrintConfig;
