import { HomeAssistant } from 'custom-card-helpers';
import { LitElement, html, nothing, TemplateResult, CSSResultGroup, css } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property } from 'lit/decorators';
import { styleMap } from 'lit/directives/style-map';
import type { SankeyChartConfig } from '../types';
import { findLink, findNode, updateLink } from './config-ops';
import type { EditorController } from './controller';
import { common, nodeName, nodeSwatch, tr } from './helpers';
import { editorStyles } from './styles';

@customElement('sankey-chart-link-editor')
export class SankeyChartLinkEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public config!: SankeyChartConfig;
  @property({ attribute: false }) public source!: string;
  @property({ attribute: false }) public target!: string;
  @property({ attribute: false }) public ctrl!: EditorController;
  @property({ attribute: false }) public canUndo = false;

  protected render(): TemplateResult | typeof nothing {
    const link = findLink(this.config, this.source, this.target);
    if (!link) return nothing;
    const { hass } = this;
    const sourceName = nodeName(hass, findNode(this.config, link.source), link.source);
    const targetName = nodeName(hass, findNode(this.config, link.target), link.target);
    return html`
      <div class="view">
        <div class="header">
          <ha-icon-button .label=${common(hass, 'back')} @click=${() => this.ctrl.select(undefined)}>
            <ha-icon class="flip-rtl" .icon=${'mdi:arrow-left'}></ha-icon>
          </ha-icon-button>
          <div class="titles">
            <span class="title">${tr('editor.link.title')}</span>
            <span class="secondary">${tr('editor.link.summary', { source: sourceName, target: targetName })}</span>
          </div>
          ${this.canUndo
            ? html`
                <ha-icon-button .label=${common(hass, 'undo')} @click=${() => this.ctrl.undo()}>
                  <ha-icon class="flip-rtl" .icon=${'mdi:undo'}></ha-icon>
                </ha-icon-button>
              `
            : nothing}
          <ha-icon-button
            .label=${common(hass, 'delete')}
            @click=${() => this.ctrl.removeLink(link.source, link.target)}
          >
            <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
          </ha-icon-button>
        </div>
        <div class="ends">
          ${this._renderChip(link.source, sourceName)}
          <ha-icon class="flip-rtl" .icon=${'mdi:arrow-right'}></ha-icon>
          ${this._renderChip(link.target, targetName)}
        </div>
        <div>
          <ha-entity-picker
            allow-custom-entity
            .hass=${hass}
            .value=${link.value ?? ''}
            .label=${tr('editor.link.connection_entity')}
            @value-changed=${this._connectionChanged}
          ></ha-entity-picker>
          <p class="note">${tr('editor.link.connection_helper')}</p>
        </div>
      </div>
    `;
  }

  private _renderChip(id: string, name: string): TemplateResult {
    const node = findNode(this.config, id);
    if (!node) {
      return html`
        <span class="chip missing" .title=${id}>
          <span class="swatch"></span>
          <span>${name} · ${tr('editor.links.missing_node')}</span>
        </span>
      `;
    }
    return html`
      <button
        class="chip"
        .title=${id}
        @click=${() => this.ctrl.select({ type: 'node', id })}
        @mouseenter=${() => this.ctrl.highlight(id)}
        @mouseleave=${() => this.ctrl.highlight(undefined)}
      >
        <span class="swatch" style=${styleMap({ background: nodeSwatch(node) })}></span>
        <span>${name}</span>
      </button>
    `;
  }

  private _connectionChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = (ev.detail.value as string | undefined) || undefined;
    const { source, target } = this;
    this.ctrl.edit(config => ({ config: updateLink(config, source, target, { value }) }), { undo: true });
  }

  static get styles(): CSSResultGroup {
    return [
      editorStyles,
      css`
        .ends {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          color: var(--secondary-text-color);
        }
        ha-entity-picker {
          display: block;
        }
        .note {
          margin-top: 8px;
        }
        .chip.missing,
        .chip.missing:hover {
          cursor: default;
          background: none;
          color: var(--error-color);
        }
        .chip.missing .swatch {
          background: var(--divider-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-link-editor': SankeyChartLinkEditor;
  }
}
