import { selectionEquals } from '../editor-bridge';
import type { EditorBridge, GeneratedConfig, PreviewAction, PreviewSelection } from '../editor-bridge';
import type { Chart } from '../chart';
import type { Config } from '../types';
import { ChartEditController } from './edit-controller';
import { collapseAutoPassthroughs, sectionConfigs } from './graph';

/**
 * Two-way channel between the visual editor and the preview card.
 * Fires `change` when editor state the preview renders (active, selection,
 * highlight) changes, and `generated` when the card reports an autoconfig graph.
 */
const REFOCUS_WINDOW = 2000;

export class SankeyEditorBridge extends EventTarget implements EditorBridge {
  private _active = false;
  private _selection?: PreviewSelection;
  private _highlight?: string;
  private _generated?: GeneratedConfig;
  private _owner?: Element;
  private _refocusUntil = 0;
  private _onAction?: (action: PreviewAction) => void;

  /** Last width the preview card rendered at; reading it again from a rebuilt card resets its scroll. */
  public previewWidth?: number;

  /** Whether the preview shows its focus ring: only after keyboard use, also across rebuilds. */
  public focusRing = false;

  constructor(onAction?: (action: PreviewAction) => void) {
    super();
    this._onAction = onAction;
  }

  // HA's deepEqual compares objects with their own valueOf, so bridges compare by identity
  // instead of walking into the preview card element they point to.
  public valueOf(): this {
    return this;
  }

  /** The editor drops its handler while detached, so a saved config does not keep it alive. */
  public setHandler(onAction?: (action: PreviewAction) => void): void {
    this._onAction = onAction;
  }

  public get active(): boolean {
    return this._active;
  }

  public get selection(): PreviewSelection | undefined {
    return this._selection;
  }

  public get highlight(): string | undefined {
    return this._highlight;
  }

  public get generated(): GeneratedConfig | undefined {
    return this._generated;
  }

  public setActive(active: boolean): void {
    if (this._active === active) return;
    this._active = active;
    this._changed();
  }

  public setSelection(selection?: PreviewSelection): void {
    if (selectionEquals(this._selection, selection)) return;
    this._selection = selection;
    this._changed();
  }

  public setHighlight(nodeId?: string): void {
    if (this._highlight === nodeId) return;
    this._highlight = nodeId;
    this._changed();
  }

  public dispatch(action: PreviewAction): void {
    if (this._active) {
      this._onAction?.(action);
    }
  }

  public reportGenerated({ nodes, links, sections }: GeneratedConfig): void {
    this._generated = { ...collapseAutoPassthroughs(nodes, links), sections };
    this.dispatchEvent(new Event('generated'));
  }

  public reportPasted(config: Config): void {
    this.reportGenerated({ nodes: config.nodes, links: config.links, sections: sectionConfigs(config.sections) });
  }

  /**
   * Only one card may edit through the bridge. On save HA renders the
   * dashboard's own card with the preview's config while the dialog is open.
   */
  public claim(card: Element): boolean {
    if (this._owner && this._owner !== card && this._owner.isConnected) return false;
    this._owner = card;
    return true;
  }

  public release(card: Element): void {
    if (this._owner === card) {
      this._owner = undefined;
    }
  }

  // HA replaces the preview card on every change, which drops keyboard focus.
  public keepPreviewFocus(): void {
    this._refocusUntil = Date.now() + REFOCUS_WINDOW;
  }

  public takePreviewFocus(): boolean {
    const refocus = Date.now() < this._refocusUntil;
    this._refocusUntil = 0;
    return refocus;
  }

  public createEditController(host: Chart): ChartEditController {
    return new ChartEditController(host);
  }

  private _changed(): void {
    this.dispatchEvent(new Event('change'));
  }
}
