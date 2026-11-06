import { HomeAssistant } from 'custom-card-helpers';
import { LitElement, html, nothing, TemplateResult, CSSResultGroup, css, PropertyValues } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import { styleMap } from 'lit/directives/style-map';
import { supportsEntityNameSelector } from '../entity-name';
import type { Link, Node, NodeType, SankeyChartConfig } from '../types';
import {
  addLink,
  findNode,
  getSectionCount,
  incoming,
  incompleteNodes,
  nodeSection,
  outgoing,
  readsEntity,
  sectionNodes,
  updateLink,
  updateNode,
} from './config-ops';
import type { EditorController } from './controller';
import {
  changedKeys,
  common,
  isEmptyValue,
  memoizeOne,
  NODE_TYPES,
  nodeEntityId,
  nodeName,
  nodeSwatch,
  nodeType,
  sectionLabel,
  tr,
  typeLabel,
} from './helpers';
import { computeHelper, computeLabel, grid, group, labelledOptions, select } from './options';
import { editorStyles } from './styles';

/* eslint-disable @typescript-eslint/no-explicit-any */

type NameField = 'entity_name' | 'text' | 'yaml';

// Coalesces typing into one undo step per field and visit of a node.
let editSession = 0;

const reconcile = (name: 'children_sum' | 'parents_sum') => ({
  type: 'expandable',
  name,
  title: tr(`editor.fields.${name}`),
  schema: [
    grid([
      {
        name: 'should_be',
        selector: select(labelledOptions(['equal', 'equal_or_less', 'equal_or_more'], v => `editor.reconcile.${v}`)),
      },
      {
        name: 'reconcile_to',
        selector: select(labelledOptions(['min', 'max', 'mean', 'latest'], v => `editor.reconcile.${v}`)),
      },
    ]),
  ],
});

const mainSchema = memoizeOne(
  (
    type: NodeType,
    idIsEntity: boolean,
    nameField: NameField,
    colorField: boolean,
    sections: number,
    appendable: boolean,
    entityId: string,
  ) => [
    { name: 'type', required: true, selector: select(NODE_TYPES.map(value => ({ value, label: typeLabel(value) }))) },
    { name: 'id', required: true, selector: idIsEntity ? { entity: {} } : { text: {} } },
    ...(nameField === 'entity_name'
      ? [{ name: 'name', selector: { entity_name: {} }, context: { entity: '_entity' } }]
      : nameField === 'text'
      ? [{ name: 'name', selector: { text: {} } }]
      : []),
    grid([
      { name: 'icon', selector: { icon: {} }, context: { icon_entity: '_entity' } },
      ...(colorField ? [{ name: 'color', selector: { text: {} } }] : []),
    ]),
    {
      name: 'section',
      required: true,
      selector: select([
        ...Array.from({ length: sections }, (_, i) => ({ value: String(i), label: sectionLabel(i) })),
        ...(appendable ? [{ value: String(sections), label: tr('editor.new_section') }] : []),
      ]),
    },
    ...(type === 'entity'
      ? [
          grid([
            {
              name: 'attribute',
              selector: { attribute: { entity_id: entityId } },
              context: { filter_entity: '_entity' },
            },
            { name: 'unit_of_measurement', selector: { text: {} } },
          ]),
        ]
      : []),
  ],
);

const moreSchema = memoizeOne((type: NodeType) => [
  group('advanced', 'mdi:cog-outline', [
    ...(readsEntity(type)
      ? [
          { name: 'entity_id', selector: { entity: {} } },
          { name: 'add_entities', selector: { entity: { multiple: true } } },
        ]
      : []),
    ...(type === 'entity' ? [{ name: 'subtract_entities', selector: { entity: { multiple: true } } }] : []),
    reconcile('children_sum'),
    reconcile('parents_sum'),
    ...(type === 'entity' ? [{ name: 'filters', selector: { object: {} } }] : []),
  ]),
  // The card has no hold gesture, and a double tap without its own action does the tap action
  group('interactions', 'mdi:gesture-tap', [
    { name: 'tap_action', selector: { ui_action: { default_action: 'more-info' } } },
    { name: 'double_tap_action', selector: { ui_action: {} } },
  ]),
]);

const cleanValue = (key: string, value: unknown): unknown => {
  if (key === 'type' && value === 'entity') return undefined;
  if ((key === 'children_sum' || key === 'parents_sum') && value && typeof value === 'object') {
    const reconcileConfig: Record<string, unknown> = {};
    Object.keys(value).forEach(part => {
      if (!isEmptyValue(value[part])) reconcileConfig[part] = value[part];
    });
    return Object.keys(reconcileConfig).length ? reconcileConfig : undefined;
  }
  return isEmptyValue(value) ? undefined : value;
};

@customElement('sankey-chart-node-editor')
export class SankeyChartNodeEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public config!: SankeyChartConfig;
  @property({ attribute: false }) public nodeId!: string;
  @property({ attribute: false }) public ctrl!: EditorController;
  @property({ attribute: false }) public canUndo = false;

  // The typed id while it cannot be applied (empty or taken)
  @state() private _idDraft?: string;
  @state() private _error?: string;
  @state() private _openConnections = new Set<string>();

  private _session = ++editSession;
  // Replaced after each pick so the link pickers start empty again
  private _pickerData: Record<string, never> = {};
  private _renamedTo?: string;
  private _data: Record<string, unknown> = {};

  private _formData = memoizeOne(
    (node: Node, idDraft: string | undefined): Record<string, unknown> => ({
      ...node,
      type: nodeType(node),
      id: idDraft ?? node.id,
      section: String(nodeSection(node)),
      _entity: nodeEntityId(node),
    }),
  );

  protected willUpdate(changed: PropertyValues): void {
    if (!changed.has('nodeId')) return;
    const renamed = this.nodeId === this._renamedTo;
    this._renamedTo = undefined;
    if (renamed) return;
    this._session = ++editSession;
    this._idDraft = undefined;
    this._error = undefined;
    this._openConnections = new Set();
  }

  private _renderBack(): TemplateResult {
    return html`
      <ha-icon-button .label=${common(this.hass, 'back')} @click=${() => this.ctrl.select(undefined)}>
        <ha-icon class="flip-rtl" .icon=${'mdi:arrow-left'}></ha-icon>
      </ha-icon-button>
    `;
  }

  protected render(): TemplateResult {
    const node = findNode(this.config, this.nodeId);
    if (!node) {
      return html`
        <div class="view">
          <div class="header">
            ${this._renderBack()}
            <div class="titles"><span class="title">${tr('editor.links.missing_node')}</span></div>
          </div>
        </div>
      `;
    }
    const { hass } = this;
    const type = nodeType(node);
    const section = nodeSection(node);
    const sections = getSectionCount(this.config);
    const idIsEntity = readsEntity(type) && !node.entity_id;
    const nameField: NameField =
      type === 'entity' && supportsEntityNameSelector(hass)
        ? 'entity_name'
        : node.name === undefined || typeof node.name === 'string'
        ? 'text'
        : 'yaml';
    const colorField = node.color === undefined || typeof node.color === 'string';
    // A new section after the last one changes nothing for its only node
    const appendable = section < sections - 1 || sectionNodes(this.config, section).length > 1;
    const incomplete = incompleteNodes(this.config).some(n => n.id === node.id);
    this._data = this._formData(node, this._idDraft);

    return html`
      <div class="view">
        <div class="header">
          ${this._renderBack()}
          <div class="titles">
            <span class="title">${nodeName(hass, node)}</span>
            <span class="secondary">${typeLabel(type)} · ${sectionLabel(section)}</span>
          </div>
          ${this.canUndo
            ? html`
                <ha-icon-button .label=${common(hass, 'undo')} @click=${() => this.ctrl.undo()}>
                  <ha-icon class="flip-rtl" .icon=${'mdi:undo'}></ha-icon>
                </ha-icon-button>
              `
            : nothing}
          <ha-icon-button .label=${common(hass, 'delete')} @click=${() => this.ctrl.removeNode(node.id)}>
            <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
          </ha-icon-button>
        </div>
        ${this._error ? html`<ha-alert alert-type="error">${this._error}</ha-alert>` : nothing}
        ${incomplete
          ? html`
              <ha-alert alert-type="warning" .title=${tr(`editor.incomplete.${type}`)}>
                ${tr('editor.incomplete.alert')}
              </ha-alert>
            `
          : nothing}
        <ha-form
          .hass=${hass}
          .data=${this._data}
          .schema=${mainSchema(type, idIsEntity, nameField, colorField, sections, appendable, nodeEntityId(node))}
          .computeLabel=${computeLabel}
          .computeHelper=${computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
        ${nameField === 'yaml' ? html`<p class="note">${tr('editor.node.name_yaml')}</p>` : nothing}
        ${colorField ? nothing : html`<p class="note">${tr('editor.node.color_yaml')}</p>`}
        ${this._renderLinks(node)}
        <ha-form
          .hass=${hass}
          .data=${this._data}
          .schema=${moreSchema(type)}
          .computeLabel=${computeLabel}
          .computeHelper=${computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
      </div>
    `;
  }

  private _renderLinks(node: Node): TemplateResult {
    const nodes = this.config.nodes ?? [];
    const section = nodeSection(node);
    const out = outgoing(this.config, node.id);
    const inc = incoming(this.config, node.id);
    const later = nodes.filter(n => nodeSection(n) > section);
    const earlier = nodes.filter(n => nodeSection(n) < section);
    const targets = later.filter(n => !out.some(link => link.target === n.id));
    const sources = earlier.filter(n => !inc.some(link => link.source === n.id));
    return html`
      <div class="block">
        <div class="block-header"><span class="title">${tr('editor.links.outgoing')}</span></div>
        ${out.map(link => this._renderLinkRow(link, link.target, true))}
        ${this._renderAddLink(
          'target',
          targets,
          tr('editor.links.add_outgoing'),
          tr(later.length ? 'editor.links.all_linked_later' : 'editor.links.none_later'),
        )}
      </div>
      <div class="block">
        <div class="block-header"><span class="title">${tr('editor.links.incoming')}</span></div>
        ${inc.map(link => this._renderLinkRow(link, link.source, false))}
        ${this._renderAddLink(
          'source',
          sources,
          tr('editor.links.add_incoming'),
          tr(earlier.length ? 'editor.links.all_linked_earlier' : 'editor.links.none_earlier'),
        )}
      </div>
    `;
  }

  private _renderLinkRow(link: Link, otherId: string, isOutgoing: boolean): TemplateResult {
    const { hass } = this;
    const other = findNode(this.config, otherId);
    const key = `${link.source}\n${link.target}`;
    const showConnection = isOutgoing && (!!link.value || this._openConnections.has(key));
    const connection = link.value ? hass.states[link.value] : undefined;
    const otherName = nodeName(hass, other, otherId);
    const details = [
      other ? sectionLabel(nodeSection(other)) : tr('editor.links.missing_node'),
      link.value ? tr('editor.link.via', { name: connection?.attributes.friendly_name || link.value }) : '',
    ];
    return html`
      <div
        class="row"
        @click=${() => this.ctrl.select({ type: 'link', source: link.source, target: link.target })}
        @mouseenter=${() => this.ctrl.highlight(otherId)}
        @mouseleave=${() => this.ctrl.highlight(undefined)}
      >
        <ha-icon class="node-icon flip-rtl" .icon=${isOutgoing ? 'mdi:arrow-right' : 'mdi:arrow-left'}></ha-icon>
        <span class="swatch" style=${styleMap({ background: other ? nodeSwatch(other) : 'var(--divider-color)' })}></span>
        <button class="info" type="button">
          <span class="primary">${otherName}</span>
          <span class="secondary">${details.filter(Boolean).join(' · ')}</span>
        </button>
        ${isOutgoing && !link.value
          ? html`
              <ha-icon-button
                class=${showConnection ? 'active' : ''}
                .label=${tr('editor.links.connection_for', { name: otherName })}
                @click=${(ev: Event) => this._toggleConnection(ev, key)}
              >
                <ha-icon .icon=${'mdi:gauge'}></ha-icon>
              </ha-icon-button>
            `
          : nothing}
        <ha-icon-button
          .label=${tr(isOutgoing ? 'editor.links.remove_to' : 'editor.links.remove_from', { name: otherName })}
          @click=${(ev: Event) => {
            ev.stopPropagation();
            this.ctrl.removeLink(link.source, link.target);
          }}
        >
          <ha-icon .icon=${'mdi:close'}></ha-icon>
        </ha-icon-button>
      </div>
      ${showConnection
        ? html`
            <ha-entity-picker
              class="connection"
              allow-custom-entity
              .hass=${hass}
              .value=${link.value ?? ''}
              .label=${tr('editor.link.connection_entity')}
              @value-changed=${(ev: CustomEvent) => this._connectionChanged(ev, link)}
            ></ha-entity-picker>
          `
        : nothing}
    `;
  }

  private _renderAddLink(direction: 'source' | 'target', candidates: Node[], label: string, empty: string) {
    if (!candidates.length) {
      return html`<div class="empty">${empty}</div>`;
    }
    const names = candidates.map(node => nodeName(this.hass, node));
    const schema = [
      {
        name: direction,
        selector: select(
          candidates.map((node, i) => {
            // Nodes can share a name, for example two nodes reading one entity
            const unique = names.indexOf(names[i]) === names.lastIndexOf(names[i]);
            const name = unique ? names[i] : `${names[i]} (${node.id})`;
            return { value: node.id, label: `${name} · ${sectionLabel(nodeSection(node))}` };
          }),
        ),
      },
    ];
    return html`
      <ha-form
        class="block-footer"
        .hass=${this.hass}
        .data=${this._pickerData}
        .schema=${schema}
        .computeLabel=${() => label}
        @value-changed=${(ev: CustomEvent) => this._addLink(direction, ev)}
      ></ha-form>
    `;
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as Record<string, unknown>;
    const keys = changedKeys(this._data, value).filter(key => key !== '_entity');
    if (!keys.length) return;
    const id = this.nodeId;

    const patch: Partial<Node> = {};
    keys
      .filter(key => key !== 'id' && key !== 'section')
      .forEach(key => {
        patch[key] = cleanValue(key, value[key]);
      });
    if (Object.keys(patch).length) {
      this.ctrl.edit(config => ({ config: updateNode(config, id, patch).config }), {
        undo: `node:${this._session}:${Object.keys(patch).join(',')}`,
      });
    }
    if (keys.includes('section') && value.section !== undefined) {
      this.ctrl.moveNode(id, Number(value.section));
    }
    if (keys.includes('id')) {
      this._rename(value.id as string | undefined);
    }
  }

  private _rename(newId: string | undefined): void {
    const id = this.nodeId;
    const trimmed = newId?.trim();
    const result = this.ctrl.edit(
      config => {
        const renamed = updateNode(config, id, { id: trimmed });
        return renamed.error
          ? { config, error: renamed.error }
          : { config: renamed.config, select: { type: 'node', id: renamed.id } };
      },
      { undo: `rename:${this._session}` },
    );
    if (result.error) {
      this._idDraft = newId ?? '';
      this._error =
        result.error === 'duplicate_id' ? tr('editor.node.duplicate_id', { id: trimmed ?? '' }) : tr('editor.node.empty_id');
    } else {
      this._renamedTo = trimmed !== id ? trimmed : undefined;
      this._idDraft = undefined;
      this._error = undefined;
    }
  }

  private _addLink(direction: 'source' | 'target', ev: CustomEvent): void {
    ev.stopPropagation();
    const other = (ev.detail.value as Record<string, string | undefined>)?.[direction];
    if (!other) return;
    const id = this.nodeId;
    const [source, target] = direction === 'target' ? [id, other] : [other, id];
    this.ctrl.edit(config => ({ config: addLink(config, source, target) }), { undo: true });
    this._pickerData = {};
    this.requestUpdate();
  }

  private _toggleConnection(ev: Event, key: string): void {
    ev.stopPropagation();
    const open = new Set(this._openConnections);
    if (open.has(key)) {
      open.delete(key);
    } else {
      open.add(key);
    }
    this._openConnections = open;
  }

  private _connectionChanged(ev: CustomEvent, link: Link): void {
    ev.stopPropagation();
    const value = (ev.detail.value as string | undefined) || undefined;
    this.ctrl.edit(config => ({ config: updateLink(config, link.source, link.target, { value }) }), { undo: true });
  }

  static get styles(): CSSResultGroup {
    return [
      editorStyles,
      css`
        ha-icon-button.active {
          color: var(--primary-color);
        }
        .row .node-icon {
          --mdc-icon-size: 20px;
        }
        .connection {
          display: block;
          padding-block: 0 12px;
          padding-inline: 48px 12px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-node-editor': SankeyChartNodeEditor;
  }
}
