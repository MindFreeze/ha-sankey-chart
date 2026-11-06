import { HomeAssistant } from 'custom-card-helpers';
import { LitElement, html, nothing, TemplateResult, CSSResultGroup, css, PropertyValues } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import { repeat } from 'lit/directives/repeat';
import { styleMap } from 'lit/directives/style-map';
import type { Node, SankeyChartConfig, SectionConfig } from '../types';
import {
  addNode,
  getSectionCount,
  incompleteNodes,
  insertSection,
  outgoing,
  removeSection,
  sectionNodes,
  updateSectionConfig,
} from './config-ops';
import type { EditorController } from './controller';
import {
  changedKeys,
  isEmptyValue,
  isMissingEntity,
  nodeEntityId,
  nodeName,
  nodeSwatch,
  nodeType,
  renderNodeIcon,
  sectionLabel,
  tr,
  trCount,
  typeLabel,
} from './helpers';
import { grid, sortBySelector, sortDirSelector } from './options';
import { editorStyles } from './styles';

const SECTION_KEYS = ['sort_by', 'sort_dir', 'sort_group_by_parent', 'min_width'];

const sectionSchema = () => [
  grid([
    { name: 'sort_by', selector: sortBySelector() },
    { name: 'sort_dir', selector: sortDirSelector() },
    { name: 'min_width', selector: { number: { mode: 'box', min: 0, unit_of_measurement: 'px' } } },
    { name: 'sort_group_by_parent', selector: { boolean: {} } },
  ]),
];

const sectionFieldLabel = (schema: { name: string }) => tr(`editor.fields.section.${schema.name}`);

// ha-entity-picker can render as a compact "add" button since HA 2025.x;
// older versions only understand a labelled picker.
const pickerSupportsAddButton = (): boolean =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  !!(customElements.get('ha-entity-picker') as any)?.elementProperties?.has?.('addButton');

@customElement('sankey-chart-sections-editor')
export class SankeyChartSectionsEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public config!: SankeyChartConfig;
  @property({ attribute: false }) public ctrl!: EditorController;
  @state() private _expanded = new Set<number>();

  private _schema = sectionSchema();

  protected willUpdate(changed: PropertyValues): void {
    const previous = changed.get('config') as SankeyChartConfig | undefined;
    // open option panels are kept by index, which a section inserted elsewhere shifts
    if (previous && getSectionCount(previous) !== getSectionCount(this.config)) {
      this._expanded = new Set();
    }
  }

  protected render(): TemplateResult {
    const count = getSectionCount(this.config);
    const incomplete = new Set(incompleteNodes(this.config).map(node => node.id));
    return html`
      ${Array.from({ length: Math.max(count, 1) }, (_, index) => this._renderSection(index, index < count, incomplete))}
      <div class="add-section">
        <ha-button appearance="plain" @click=${this._addSection}>${tr('editor.add_section')}</ha-button>
      </div>
    `;
  }

  private _renderSection(index: number, exists: boolean, incomplete: Set<string>): TemplateResult {
    const nodes = sectionNodes(this.config, index);
    const sectionConfig: SectionConfig = this.config.sections?.[index] ?? {};
    const hasOptions = Object.keys(sectionConfig).some(key => sectionConfig[key] !== undefined);
    const expanded = this._expanded.has(index);
    const section = sectionLabel(index);
    return html`
      <div class="block">
        <div class="block-header">
          <div class="titles">
            <span class="title" role="heading" aria-level="3">${section}</span>
            <span class="secondary">${trCount('editor.node_count', nodes.length)}</span>
          </div>
          <ha-icon-button
            class=${hasOptions || expanded ? 'active' : ''}
            .label=${tr(expanded ? 'editor.hide_section_options' : 'editor.show_section_options', { section })}
            @click=${() => this._toggleOptions(index)}
          >
            <ha-icon .icon=${'mdi:tune-variant'}></ha-icon>
          </ha-icon-button>
          ${exists
            ? html`
                <ha-icon-button
                  .label=${tr('editor.delete_section', { section })}
                  @click=${() => this._removeSection(index)}
                >
                  <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
                </ha-icon-button>
              `
            : nothing}
        </div>
        ${expanded
          ? html`
              <div class="block-body">
                <ha-form
                  .hass=${this.hass}
                  .data=${sectionConfig}
                  .schema=${this._schema}
                  .computeLabel=${sectionFieldLabel}
                  @value-changed=${(ev: CustomEvent) => this._sectionChanged(index, sectionConfig, ev)}
                ></ha-form>
              </div>
            `
          : nothing}
        ${this._renderRows(index, nodes, incomplete)}
        ${this._renderAddPicker(index)}
      </div>
    `;
  }

  private _renderRows(index: number, nodes: Node[], incomplete: Set<string>): TemplateResult {
    if (!nodes.length) {
      return html`<div class="empty">${tr('editor.empty_section')}</div>`;
    }
    const sortable = nodes.length > 1 && !!customElements.get('ha-sortable');
    const rows = html`
      <div class="rows">
        ${repeat(
          nodes,
          node => node.id,
          node => this._renderRow(node, sortable, incomplete.has(node.id)),
        )}
      </div>
    `;
    if (!sortable) return rows;
    return html`
      <ha-sortable handle-selector=".handle" @item-moved=${(ev: CustomEvent) => this._rowMoved(index, nodes, ev)}>
        ${rows}
      </ha-sortable>
    `;
  }

  private _renderRow(node: Node, sortable: boolean, incomplete: boolean): TemplateResult {
    const { hass } = this;
    const type = nodeType(node);
    const name = nodeName(hass, node);
    const links = outgoing(this.config, node.id).length;
    const missing = isMissingEntity(hass, node);
    const secondary = missing
      ? `${nodeEntityId(node)} · ${tr('editor.entity_not_found')}`
      : incomplete
      ? `${typeLabel(type)} · ${tr(`editor.incomplete.${type}`)}`
      : [nodeEntityId(node), type === 'entity' ? '' : typeLabel(type)].filter(Boolean).join(' · ');
    return html`
      <div
        class="row"
        @click=${() => this._select(node.id)}
        @mouseenter=${() => this.ctrl.highlight(node.id)}
        @mouseleave=${() => this.ctrl.highlight(undefined)}
      >
        ${sortable
          ? html`<div class="handle" @click=${(ev: Event) => ev.stopPropagation()}>
              <ha-icon .icon=${'mdi:drag'}></ha-icon>
            </div>`
          : nothing}
        <span class="swatch" style=${styleMap({ background: nodeSwatch(node) })}></span>
        ${incomplete
          ? html`<ha-icon class="node-icon missing" .icon=${'mdi:alert-circle-outline'}></ha-icon>`
          : renderNodeIcon(hass, node)}
        <button class="info" type="button">
          <span class="primary">${name}</span>
          <span class="secondary ${missing || incomplete ? 'error-text' : ''}">${secondary}</span>
        </button>
        ${links
          ? html`<span class="badge" title=${trCount('editor.links.outgoing_count', links)}>
              <ha-icon class="flip-rtl" .icon=${'mdi:arrow-right'}></ha-icon>${links}
            </span>`
          : nothing}
        <ha-icon-button
          .label=${tr('editor.delete_node', { name })}
          @click=${(ev: Event) => {
            ev.stopPropagation();
            this.ctrl.removeNode(node.id);
          }}
        >
          <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
        </ha-icon-button>
      </div>
    `;
  }

  private _renderAddPicker(index: number): TemplateResult {
    const label = tr('editor.add_node');
    const addButton = pickerSupportsAddButton();
    return html`
      <div class="block-footer add">
        <ha-entity-picker
          class=${addButton ? '' : 'wide'}
          allow-custom-entity
          ?add-button=${addButton}
          .addButtonLabel=${label}
          .label=${addButton ? undefined : label}
          .hass=${this.hass}
          @value-changed=${(ev: CustomEvent) => this._addNode(index, ev)}
        ></ha-entity-picker>
        <ha-button appearance="plain" @click=${() => this.ctrl.openAddNode(index)}>
          ${tr('editor.add_other_type')}
        </ha-button>
      </div>
    `;
  }

  private _select(id: string): void {
    this.ctrl.highlight(undefined);
    this.ctrl.select({ type: 'node', id });
  }

  private _toggleOptions(index: number): void {
    const expanded = new Set(this._expanded);
    if (expanded.has(index)) {
      expanded.delete(index);
    } else {
      expanded.add(index);
    }
    this._expanded = expanded;
  }

  private _sectionChanged(index: number, data: SectionConfig, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as Record<string, unknown>;
    const changed = changedKeys(data as Record<string, unknown>, value, SECTION_KEYS);
    if (!changed.length) return;
    const next: Record<string, unknown> = { ...data };
    changed.forEach(key => {
      if (isEmptyValue(value[key])) {
        delete next[key];
      } else {
        next[key] = value[key];
      }
    });
    this.ctrl.edit(config => ({ config: updateSectionConfig(config, index, next as SectionConfig) }), {
      undo: `section:${index}:${changed.join(',')}`,
    });
  }

  private _addNode(index: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const id = ev.detail.value as string | undefined;
    (ev.target as HTMLInputElement).value = '';
    if (!id) return;
    this.ctrl.edit(config => ({ config: addNode(config, { id, section: index }).config }), { undo: true });
  }

  private _addSection(): void {
    this._expanded = new Set();
    this.ctrl.edit(config => ({ config: insertSection(config, Math.max(getSectionCount(config), 1)) }), {
      undo: true,
    });
  }

  private _removeSection(index: number): void {
    this._expanded = new Set();
    this.ctrl.edit(
      config => {
        const result = removeSection(config, index);
        const removed = result.removedNodes.length;
        return {
          config: result.config,
          toast: removed
            ? trCount('editor.toast.section_removed', removed, { section: sectionLabel(index) })
            : tr('editor.toast.empty_section_removed', { section: sectionLabel(index) }),
        };
      },
      { undo: true },
    );
  }

  private _rowMoved(index: number, nodes: Node[], ev: CustomEvent): void {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const moved = nodes[oldIndex];
    if (!moved) return;
    const rest = nodes.filter((_, i) => i !== oldIndex);
    this.ctrl.moveNode(moved.id, index, { before: rest[newIndex]?.id });
  }

  static get styles(): CSSResultGroup {
    return [
      editorStyles,
      css`
        :host {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        ha-icon-button.active {
          color: var(--primary-color);
        }
        .add-section {
          display: flex;
        }
        .block-footer.add {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .add ha-entity-picker.wide {
          flex: 1 1 100%;
          min-width: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-sections-editor': SankeyChartSectionsEditor;
  }
}
