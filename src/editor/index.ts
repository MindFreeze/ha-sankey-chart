/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult, css, CSSResultGroup, nothing, PropertyValues } from 'lit';
import { HomeAssistant, fireEvent, LovelaceCardEditor, LovelaceConfig } from 'custom-card-helpers';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property, state } from 'lit/decorators';
import {
  EDITOR_BRIDGE,
  GeneratedConfig,
  getEditorBridge,
  PreviewAction,
  PreviewSelection,
  selectionEquals,
} from '../editor-bridge';
import { SankeyEditorBridge } from '../preview/bridge';
import type { SankeyChartConfig } from '../types';
import { isAutoPassthrough, normalizeConfig } from '../utils';
import {
  addLink,
  autoconfigToManual,
  deepEqual,
  ensureV4,
  findLink,
  findNode,
  isAutoconfig,
  moveNode,
  MoveNodeOptions,
  orphanedNodes,
  outgoing,
  removeLink,
  removeNode,
} from './config-ops';
import type { Edit, EditOptions, EditorController, EditResult } from './controller';
import { changedKeys, common, formatList, memoizeOne, nodeName, tr, trCount } from './helpers';
import {
  applyAutoconfigChange,
  applyOptionsChange,
  autoconfigData,
  autoconfigSchema,
  AUTOCONFIG_DEFAULTS,
  computeHelper,
  computeLabel,
  OPTION_KEYS,
  optionsData,
  optionsSchema,
} from './options';
import { editorStyles } from './styles';
import './add-node';
import './link';
import './node';
import './sections';

const MAX_UNDO = 30;

// Bounds re-delivering the bridge when a host keeps handing back configs without it.
const MAX_REDELIVERIES = 2;

// Keys the card editor dialog manages in its own tabs, which undo must not revert.
const HOST_KEYS = ['visibility', 'grid_options', 'layout_options', 'view_layout'];

const DOCS_URL = 'https://github.com/MindFreeze/ha-sankey-chart/blob/master/README.md';

const TOAST_ID = 'sankey-chart-editor-undo';
const TOAST_DURATION = 5000;

const AUTOCONFIG_TOGGLE = [{ name: 'autoconfig', selector: { boolean: {} } }];

interface UndoEntry {
  config: SankeyChartConfig;
  selection?: PreviewSelection;
}

interface AddNodeView {
  section: number;
  linkFrom?: string;
}

const selectionExists = (config: SankeyChartConfig, selection: PreviewSelection): boolean =>
  selection.type === 'node'
    ? !!findNode(config, selection.id)
    : !!findLink(config, selection.source, selection.target);

const sameContent = (a: SankeyChartConfig, b: SankeyChartConfig): boolean => JSON.stringify(a) === JSON.stringify(b);

// The preview draws a chain of `__auto` passthroughs as one link, also when a
// config pasted from print_yaml declares those hops as real nodes.
const resolveSelection = (config: SankeyChartConfig, selection: PreviewSelection): PreviewSelection | undefined => {
  if (selection.type === 'node' || findLink(config, selection.source, selection.target)) return selection;
  const { source, target } = selection;
  const reaches = (id: string, seen: Set<string>): boolean => {
    if (id === target) return true;
    const node = findNode(config, id);
    if (!node || !isAutoPassthrough(node) || seen.has(id)) return false;
    seen.add(id);
    return outgoing(config, id).some(link => reaches(link.target, seen));
  };
  const first = outgoing(config, source).find(link => reaches(link.target, new Set()));
  return first ? { type: 'link', source, target: first.target } : undefined;
};

// The top-level element around `el`, which is where Home Assistant listens for toasts
const documentHost = (el: Element): Element => {
  let host = el;
  for (let root = host.getRootNode(); root instanceof ShadowRoot; root = host.getRootNode()) {
    host = root.host;
  }
  return host;
};

@customElement('sankey-chart-editor')
export class SankeyChartEditor extends LitElement implements LovelaceCardEditor, EditorController {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public lovelace?: LovelaceConfig;
  @state() private _config?: SankeyChartConfig;
  @state() private _selection?: PreviewSelection;
  @state() private _addNode?: AddNodeView;
  @state() private _undoStack: UndoEntry[] = [];
  @state() private _generated?: GeneratedConfig;
  @state() private _helpers?: unknown;
  // HA before 2026.2 drops configs that differ only by the Symbol, so the preview may never get it
  @state() private _bridgeDelivered = false;

  private _bridge?: SankeyEditorBridge;
  // Last config Home Assistant gave us, which is what the preview card renders
  private _received?: SankeyChartConfig;
  private _fired?: SankeyChartConfig;
  private _redeliveries = 0;
  private _undoKey?: string;
  // The graph the preview reported for autoconfig options that changed since
  private _staleGenerated?: GeneratedConfig;
  private _toastEntry?: UndoEntry;
  private _toastHost?: Element;
  private _toastUntil = 0;
  private _scrollToView = false;
  // set while handling a preview action, whose user keeps working in the preview
  private _fromPreview = false;
  private _bridgeEvents?: AbortController;
  private _initialized = false;

  private _v4 = memoizeOne((config: SankeyChartConfig) => ensureV4(config));
  private _defaults = memoizeOne((config: SankeyChartConfig, isMetric: boolean) => normalizeConfig(config, isMetric));
  private _optionsData = memoizeOne(optionsData);
  private _optionsSchema = memoizeOne((convert: unknown, energyDate: unknown) =>
    optionsSchema({ convert_units_to: convert, energy_date_selection: energyDate }),
  );
  private _autoconfigData = memoizeOne(autoconfigData);
  private _toggleData = memoizeOne((autoconfig: boolean) => ({ autoconfig }));
  private _autoconfigSchema = memoizeOne(autoconfigSchema);

  public setConfig(config: SankeyChartConfig): void {
    const own = !!this._bridge && getEditorBridge(config) === this._bridge;
    // HA can pass the same config twice in a row
    if (!own && config === this._received) return;
    this._received = config;
    if (own) {
      this._redeliveries = 0;
      this._bridgeDelivered = true;
      this._config = config;
      this._validateSelection();
      return;
    }
    if (this._bridge && this._fired && sameContent(config, this._fired)) {
      // A copy of a config we fired, without the Symbol: the dialog re-rendered
      // with its older config, or the host drops Symbols. Retry a few times only.
      this._config = config;
      if (this._redeliveries < MAX_REDELIVERIES) {
        this._redeliveries++;
        this._deliverBridge();
      }
      return;
    }

    this._closeToast();
    this._detachBridge();
    this._bridge?.setActive(false);
    const bridge = new SankeyEditorBridge();
    this._bridge = bridge;
    this._bridgeDelivered = false;
    this._redeliveries = 0;
    if (this.isConnected) this._attachBridge();
    this._selection = undefined;
    this._addNode = undefined;
    this._undoStack = [];
    this._undoKey = undefined;
    this._generated = undefined;
    this._staleGenerated = undefined;
    this._config = config;
    this._deliverBridge();
    this._loadHelpers();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._attachBridge();
    this._syncGenerated();
    this._deliverBridge();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._closeToast();
    this._bridge?.setHighlight(undefined);
    this._detachBridge();
  }

  // HA keeps saved configs, and so their bridge, around; a closed editor must not stay reachable from it
  private _attachBridge(): void {
    const bridge = this._bridge;
    if (!bridge) return;
    this._bridgeEvents?.abort();
    this._bridgeEvents = new AbortController();
    bridge.setHandler(action => this._previewAction(bridge, action));
    bridge.addEventListener(
      'generated',
      () => {
        if (bridge === this._bridge) this._syncGenerated();
      },
      { signal: this._bridgeEvents.signal },
    );
    bridge.setActive(true);
  }

  private _detachBridge(): void {
    this._bridgeEvents?.abort();
    this._bridgeEvents = undefined;
    this._bridge?.setHandler(undefined);
    this._bridge?.setActive(false);
  }

  /**
   * The preview only gets the bridge through a config we fire. A macrotask
   * runs after any dialog render that is already queued, which would
   * otherwise overwrite this config with the one the dialog had.
   */
  private _deliverBridge(): void {
    const bridge = this._bridge;
    const config = this._config;
    if (!bridge || !config || !this.isConnected) return;
    setTimeout(() => {
      if (bridge !== this._bridge || config !== this._config || !this.isConnected) return;
      if (getEditorBridge(this._received) === bridge) return;
      this._fire(config);
    }, 0);
  }

  private get _working(): SankeyChartConfig {
    return this._v4(this._config!);
  }

  private _fire(config: SankeyChartConfig): void {
    const next = { ...config, [EDITOR_BRIDGE]: this._bridge } as SankeyChartConfig;
    Object.keys(next).forEach(key => {
      if (next[key] === undefined) delete next[key];
    });
    if (this._config && !deepEqual(this._config.autoconfig, next.autoconfig)) {
      // The preview builds a new graph for the new options
      this._staleGenerated = this._bridge?.generated;
      this._generated = undefined;
    }
    this._config = next;
    this._fired = next;
    fireEvent(this, 'config-changed', { config: next });
  }

  private _syncGenerated(): void {
    const generated = this._bridge?.generated;
    this._generated = generated === this._staleGenerated ? undefined : generated;
  }

  // ---- EditorController ----

  public edit(edit: Edit, options: EditOptions = {}): EditResult {
    // A detached editor no longer feeds the dialog, which would leave the two out of sync
    if (!this.isConnected || !this._config) return { config: this._config as SankeyChartConfig };
    const before = this._working;
    const result = edit(before);
    const changed = result.config !== before;
    let pushed = false;
    if (changed) {
      if (options.undo) pushed = this._pushUndo(before, options.undo);
      this._fire(result.config);
    }
    if (result.select !== undefined) {
      this._setSelection(result.select ?? undefined);
    }
    this._validateSelection();
    if (changed && result.toast) {
      this._toast(this._withOrphans(result.toast, before, result.config));
    } else if (pushed) {
      // The toast could no longer undo its own change
      this._closeToast();
    }
    return result;
  }

  public select(selection?: PreviewSelection): void {
    if (selection && (!this._config || !selectionExists(this._working, selection))) return;
    this._setSelection(selection);
  }

  public highlight(nodeId?: string): void {
    this._bridge?.setHighlight(nodeId);
  }

  public openAddNode(section: number, linkFrom?: string): void {
    if (!this._config) return;
    this._setSelection(undefined);
    this._addNode = { section, linkFrom: linkFrom && findNode(this._working, linkFrom) ? linkFrom : undefined };
    this._scrollToView = true;
  }

  public closeAddNode(): void {
    this._addNode = undefined;
  }

  public undo(): void {
    const entry = this._undoStack[this._undoStack.length - 1];
    if (!entry || !this.isConnected) return;
    this._closeToast();
    this._undoStack = this._undoStack.slice(0, -1);
    this._undoKey = undefined;
    const current = this._working;
    const restored: SankeyChartConfig = { ...entry.config };
    HOST_KEYS.forEach(key => {
      if (key in current) {
        restored[key] = current[key];
      } else {
        delete restored[key];
      }
    });
    this._fire(restored);
    this._addNode = undefined;
    this._setSelection(entry.selection);
    this._validateSelection();
  }

  public removeNode(id: string): void {
    // the row that set it is gone and never reports mouseleave
    this._bridge?.setHighlight(undefined);
    this.edit(
      config => {
        const node = findNode(config, id);
        return {
          config: removeNode(config, id).config,
          toast: tr('editor.toast.node_removed', { name: nodeName(this.hass, node, id) }),
        };
      },
      { undo: true },
    );
  }

  public removeLink(source: string, target: string): void {
    this._bridge?.setHighlight(undefined);
    this.edit(
      config => ({
        config: removeLink(config, source, target),
        toast: tr('editor.toast.link_removed', {
          source: nodeName(this.hass, findNode(config, source), source),
          target: nodeName(this.hass, findNode(config, target), target),
        }),
      }),
      { undo: true },
    );
  }

  public moveNode(id: string, section: number, options?: MoveNodeOptions): void {
    const before = this._config;
    this.edit(
      config => {
        const moved = moveNode(config, id, section, options);
        const dropped = moved.removedLinks.length;
        return { config: moved.config, toast: dropped ? trCount('editor.toast.links_dropped', dropped) : undefined };
      },
      { undo: true },
    );
    // a section inserted at or before the add view's target shifts it
    if (options?.newSection && this._addNode && section <= this._addNode.section && this._config !== before) {
      this._addNode = { ...this._addNode, section: this._addNode.section + 1 };
    }
  }

  // ---- internals ----

  /** Whether it added an entry, rather than merging into the last one. */
  private _pushUndo(config: SankeyChartConfig, key: true | string): boolean {
    if (typeof key === 'string' && key === this._undoKey && this._undoStack.length) return false;
    this._undoKey = typeof key === 'string' ? key : undefined;
    this._undoStack = [...this._undoStack, { config, selection: this._selection }].slice(-MAX_UNDO);
    return true;
  }

  private _withOrphans(message: string, before: SankeyChartConfig, after: SankeyChartConfig): string {
    const orphaned = orphanedNodes(before, after);
    if (!orphaned.length) return message;
    const names = formatList(orphaned.map(node => nodeName(this.hass, node)));
    return `${message} ${trCount('editor.toast.incomplete', orphaned.length, { names })}`;
  }

  private _toast(message: string): void {
    const entry = this._undoStack[this._undoStack.length - 1];
    this._toastEntry = entry;
    this._toastHost = documentHost(this);
    this._toastUntil = Date.now() + TOAST_DURATION;
    // Typed loosely: the shared event type predates toast ids
    const detail = {
      id: TOAST_ID,
      message,
      action: entry
        ? {
            text: common(this.hass, 'undo'),
            action: () => {
              // Only undo the change this toast is about
              if (this._toastEntry !== entry || this._undoStack[this._undoStack.length - 1] !== entry) return;
              this._toastEntry = undefined;
              this.undo();
            },
          }
        : undefined,
      duration: TOAST_DURATION,
    };
    fireEvent(this, 'hass-notification', detail);
  }

  private _closeToast(): void {
    const host = this._toastHost;
    if (!this._toastEntry) return;
    this._toastEntry = undefined;
    this._toastHost = undefined;
    // Older Home Assistant versions show one toast at a time and would close another one
    if (host?.isConnected && Date.now() < this._toastUntil) {
      const detail = { id: TOAST_ID, message: '', duration: 0 };
      fireEvent(host as HTMLElement, 'hass-notification', detail);
    }
  }

  private _setSelection(selection?: PreviewSelection): void {
    if (selection) this._addNode = undefined;
    const previous = this._selection;
    // A rename swaps the selected node for its new id and keeps the view in place
    const renamed = previous?.type === 'node' && selection?.type === 'node' && !findNode(this._working, previous.id);
    // on phones the editor sits above the preview, and scrolling to it would hide the preview
    if (selection && !renamed && !this._fromPreview && !selectionEquals(previous, selection)) this._scrollToView = true;
    this._selection = selection;
    this._bridge?.setHighlight(undefined);
    this._bridge?.setSelection(selection);
  }

  private _validateSelection(): void {
    if (!this._config) return;
    const config = this._working;
    const auto = isAutoconfig(config);
    if (this._selection && (auto || !selectionExists(config, this._selection))) {
      this._setSelection(undefined);
    }
    if (this._addNode && auto) {
      this._addNode = undefined;
    } else if (this._addNode?.linkFrom && !findNode(config, this._addNode.linkFrom)) {
      this._addNode = { section: this._addNode.section };
    }
  }

  private _previewAction(bridge: SankeyEditorBridge, action: PreviewAction): void {
    if (bridge !== this._bridge || !this._config) return;
    const before = this._config;
    this._fromPreview = true;
    try {
      this._applyPreviewAction(action);
    } finally {
      this._fromPreview = false;
    }
    // no rebuilt preview will take the focus the preview asked to keep
    if (this._config === before) bridge.takePreviewFocus();
  }

  private _applyPreviewAction(action: PreviewAction): void {
    const config = this._working;
    switch (action.type) {
      case 'select': {
        if (!action.selection) {
          this._addNode = undefined;
          this._setSelection(undefined);
          break;
        }
        const selection = resolveSelection(config, action.selection);
        if (selection && selectionExists(config, selection)) {
          this._setSelection(selection);
        }
        break;
      }
      case 'move_node':
        this.moveNode(action.id, action.section, { before: action.before, newSection: action.new_section });
        break;
      case 'add_link': {
        const { source, target } = action;
        this.edit(
          current => {
            const next = addLink(current, source, target);
            return { config: next, select: next === current ? undefined : { type: 'link', source, target } };
          },
          { undo: true },
        );
        break;
      }
      case 'add_node':
        this.openAddNode(action.section, action.link_from);
        break;
      case 'remove': {
        const selection = resolveSelection(config, action.selection);
        if (selection?.type === 'node') {
          this.removeNode(selection.id);
        } else if (selection) {
          this.removeLink(selection.source, selection.target);
        }
        this._setSelection(undefined);
        break;
      }
      case 'undo':
        this.undo();
        break;
    }
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers) return;
    const load = (window as any).loadCardHelpers;
    this._helpers = load ? await load() : {};
  }

  protected shouldUpdate(): boolean {
    if (!this._initialized) {
      this._initialize();
    }
    return true;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (!this._scrollToView) return;
    this._scrollToView = false;
    // Views replace each other in place, so a new one can open scrolled past its header
    this.renderRoot.querySelector('.anchor')?.scrollIntoView?.({ block: 'nearest' });
  }

  // ha-form and ha-entity-picker are lazy loaded by HA; loading the editors
  // of two built-in cards makes sure they are defined.
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

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._helpers || !this._config) {
      return nothing;
    }
    const config = this._working;
    const canUndo = this._undoStack.length > 0;

    if (this._addNode) {
      return html`
        <div class="anchor"></div>
        <sankey-chart-add-node-editor
          .hass=${this.hass}
          .config=${config}
          .section=${this._addNode.section}
          .linkFrom=${this._addNode.linkFrom}
          .ctrl=${this}
        ></sankey-chart-add-node-editor>
      `;
    }
    const selection = this._selection;
    if (selection?.type === 'node') {
      return html`
        <div class="anchor"></div>
        <sankey-chart-node-editor
          .hass=${this.hass}
          .config=${config}
          .nodeId=${selection.id}
          .ctrl=${this}
          .canUndo=${canUndo}
        ></sankey-chart-node-editor>
      `;
    }
    if (selection?.type === 'link') {
      return html`
        <div class="anchor"></div>
        <sankey-chart-link-editor
          .hass=${this.hass}
          .config=${config}
          .source=${selection.source}
          .target=${selection.target}
          .ctrl=${this}
          .canUndo=${canUndo}
        ></sankey-chart-link-editor>
      `;
    }
    return this._renderMain(config, canUndo);
  }

  private _renderMain(config: SankeyChartConfig, canUndo: boolean): TemplateResult {
    const auto = isAutoconfig(config);
    const isMetric = (this.hass.config?.unit_system?.length as string) === 'km';
    const data = this._optionsData(config, this._defaults(config, isMetric));
    const undo = canUndo
      ? html`
          <ha-icon-button .label=${common(this.hass, 'undo')} @click=${() => this.undo()}>
            <ha-icon class="flip-rtl" .icon=${'mdi:undo'}></ha-icon>
          </ha-icon-button>
        `
      : nothing;
    // Turning autoconfig on replaces the manual nodes, so in manual mode the
    // switch sits below them, away from the undo button.
    const toggle = html`
      <ha-form
        .hass=${this.hass}
        .data=${this._toggleData(auto)}
        .schema=${AUTOCONFIG_TOGGLE}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._autoconfigToggled}
      ></ha-form>
    `;
    return html`
      <div class="view">
        ${auto
          ? html`
              <div class="toolbar">${toggle}${undo}</div>
              ${this._renderAutoconfig(config)}
            `
          : html`
              <div class="toolbar">
                ${this._bridgeDelivered
                  ? html`<ha-alert alert-type="info">${tr('editor.preview_hint')}</ha-alert>`
                  : html`<span class="toolbar-spacer"></span>`}
                ${undo}
              </div>
              <sankey-chart-sections-editor
                .hass=${this.hass}
                .config=${config}
                .ctrl=${this}
              ></sankey-chart-sections-editor>
              ${toggle}
            `}
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${this._optionsSchema(data.convert_units_to, data.energy_date_selection)}
          .computeLabel=${computeLabel}
          .computeHelper=${computeHelper}
          @value-changed=${(ev: CustomEvent) => this._optionsChanged(data, ev)}
        ></ha-form>
        <a class="docs" href=${DOCS_URL} target="_blank" rel="noreferrer">${tr('editor.docs')}</a>
      </div>
    `;
  }

  private _renderAutoconfig(config: SankeyChartConfig): TemplateResult {
    const data = this._autoconfigData(config);
    const generated = this._generated;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._autoconfigSchema(data.mode)}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${(ev: CustomEvent) => this._autoconfigChanged(data, ev)}
      ></ha-form>
      <div class="block">
        <div class="block-body customize">
          <p class="note">${tr('editor.autoconfig.customize_help')}</p>
          ${generated ? nothing : html`<p class="note">${tr('editor.autoconfig.waiting')}</p>`}
          <div class="actions">
            <ha-button .disabled=${!generated} @click=${this._customize}>
              ${tr('editor.autoconfig.customize')}
            </ha-button>
          </div>
        </div>
      </div>
    `;
  }

  private _autoconfigToggled(ev: CustomEvent): void {
    ev.stopPropagation();
    const enable = !!(ev.detail.value as { autoconfig?: boolean }).autoconfig;
    const generated = this._generated;
    this.edit(
      config => {
        if (enable === isAutoconfig(config)) return { config };
        if (!enable) {
          if (generated) return { config: autoconfigToManual(config, generated), select: null };
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { autoconfig: _autoconfig, ...manual } = config;
          return {
            config: manual,
            select: null,
            toast: manual.nodes?.length ? undefined : tr('editor.toast.autoconfig_off'),
          };
        }
        const { nodes, links, sections: _sections, ...rest } = config;
        return {
          config: { ...rest, autoconfig: {} },
          select: null,
          toast: nodes?.length || links?.length ? tr('editor.toast.manual_cleared') : undefined,
        };
      },
      { undo: true },
    );
  }

  private _autoconfigChanged(data: Record<string, unknown>, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as Record<string, unknown>;
    const changed = changedKeys(data, value, Object.keys(AUTOCONFIG_DEFAULTS));
    if (!changed.length) return;
    this.edit(config => ({ config: applyAutoconfigChange(config, data, value).config }), {
      undo: `autoconfig:${changed.join(',')}`,
    });
  }

  private _customize(): void {
    const generated = this._generated;
    if (!generated) return;
    this.edit(config => ({ config: autoconfigToManual(config, generated), select: null }), { undo: true });
  }

  private _optionsChanged(data: Record<string, unknown>, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as Record<string, unknown>;
    const changed = changedKeys(data, value, [...OPTION_KEYS]);
    if (!changed.length) return;
    this.edit(config => ({ config: applyOptionsChange(config, data, value).config }), {
      undo: `options:${changed.join(',')}`,
    });
  }

  static get styles(): CSSResultGroup {
    return [
      editorStyles,
      css`
        .toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toolbar ha-form,
        .toolbar ha-alert,
        .toolbar-spacer {
          flex: 1;
          min-width: 0;
        }
        .customize {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 12px;
        }
        .docs {
          align-self: flex-start;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sankey-chart-editor': SankeyChartEditor;
  }
}
