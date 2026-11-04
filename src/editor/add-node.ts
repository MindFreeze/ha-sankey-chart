import { HomeAssistant } from 'custom-card-helpers';
import { LitElement, html, nothing, TemplateResult, CSSResultGroup, css, PropertyValues } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import type { Node, NodeType, SankeyChartConfig } from '../types';
import { addLink, addNode, findNode, getSectionCount, readsEntity, uniqueNodeId } from './config-ops';
import type { EditorController } from './controller';
import { common, memoizeOne, NODE_TYPES, nodeName, sectionLabel, tr, typeLabel } from './helpers';
import { computeLabel, select } from './options';
import { editorStyles } from './styles';

const SUGGESTED_IDS: Partial<Record<NodeType, string>> = {
  passthrough: 'passthrough',
  remaining_parent_state: 'other',
  remaining_child_state: 'discrepancy',
};

const TYPE_SCHEMA = [
  { name: 'type', required: true, selector: select(NODE_TYPES.map(value => ({ value, label: typeLabel(value) }))) },
];

const ID_SCHEMA = [
  { name: 'id', required: true, selector: { text: {} } },
  { name: 'name', selector: { text: {} } },
];

@customElement('sankey-chart-add-node-editor')
export class SankeyChartAddNodeEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public config!: SankeyChartConfig;
  @property({ attribute: false }) public section = 0;
  @property({ attribute: false }) public linkFrom?: string;
  @property({ attribute: false }) public ctrl!: EditorController;

  @state() private _type: NodeType = 'entity';
  @state() private _id = '';
  @state() private _name = '';
  private _suggestedId?: string;
  private _typeData = memoizeOne((type: NodeType) => ({ type }));
  private _idData = memoizeOne((id: string, name: string) => ({ id, name }));

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('section') || changed.has('linkFrom')) {
      this._type = 'entity';
      this._id = '';
      this._name = '';
      this._suggestedId = undefined;
    }
  }

  protected render(): TemplateResult {
    const { hass } = this;
    const target =
      this.section < getSectionCount(this.config)
        ? sectionLabel(this.section)
        : tr('editor.section_n_new', { n: this.section + 1 });
    const from = this.linkFrom ? findNode(this.config, this.linkFrom) : undefined;
    return html`
      <div class="view">
        <div class="header">
          <ha-icon-button .label=${common(hass, 'back')} @click=${() => this.ctrl.closeAddNode()}>
            <ha-icon class="flip-rtl" .icon=${'mdi:arrow-left'}></ha-icon>
          </ha-icon-button>
          <div class="titles">
            <span class="title">${tr('editor.add_node')}</span>
            <span class="secondary">${target}</span>
          </div>
        </div>
        ${from ? html`<p class="note">${tr('editor.add_node_linked', { name: nodeName(hass, from) })}</p>` : nothing}
        <ha-form
          .hass=${hass}
          .data=${this._typeData(this._type)}
          .schema=${TYPE_SCHEMA}
          .computeLabel=${computeLabel}
          @value-changed=${this._typeChanged}
        ></ha-form>
        ${readsEntity(this._type)
          ? html`
              <ha-entity-picker
                allow-custom-entity
                .hass=${hass}
                .value=${this._id}
                .label=${tr('editor.fields.entity')}
                @value-changed=${this._entityPicked}
              ></ha-entity-picker>
            `
          : html`
              <ha-form
                .hass=${hass}
                .data=${this._idData(this._id, this._name)}
                .schema=${ID_SCHEMA}
                .computeLabel=${computeLabel}
                @value-changed=${this._idChanged}
              ></ha-form>
            `}
        <div class="actions">
          <ha-button .disabled=${!this._id.trim()} @click=${this._add}>${common(hass, 'add')}</ha-button>
        </div>
      </div>
    `;
  }

  private _typeChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const type = ((ev.detail.value as { type?: NodeType }).type || 'entity') as NodeType;
    if (type === this._type) return;
    const wasEntity = readsEntity(this._type);
    this._type = type;
    if (readsEntity(type)) {
      if (!wasEntity) this._id = '';
      this._suggestedId = undefined;
    } else if (wasEntity || this._id === this._suggestedId || !this._id) {
      this._suggestedId = uniqueNodeId(this.config, SUGGESTED_IDS[type] ?? type);
      this._id = this._suggestedId;
    }
  }

  private _entityPicked(ev: CustomEvent): void {
    ev.stopPropagation();
    this._id = (ev.detail.value as string | undefined) ?? '';
  }

  private _idChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as { id?: string; name?: string };
    this._id = value.id ?? '';
    this._name = value.name ?? '';
  }

  private _add(): void {
    const id = this._id.trim();
    if (!id) return;
    const node: Node = { id, section: this.section };
    if (this._type !== 'entity') node.type = this._type;
    // the name field only shows for types that do not read an entity
    if (!readsEntity(this._type) && this._name.trim()) node.name = this._name.trim();
    const { linkFrom } = this;
    this.ctrl.edit(
      config => {
        const added = addNode(config, node);
        return {
          config: linkFrom ? addLink(added.config, linkFrom, added.id) : added.config,
          select: { type: 'node', id: added.id },
        };
      },
      { undo: true },
    );
  }

  static get styles(): CSSResultGroup {
    return [
      editorStyles,
      css`
        ha-entity-picker {
          display: block;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-add-node-editor': SankeyChartAddNodeEditor;
  }
}
