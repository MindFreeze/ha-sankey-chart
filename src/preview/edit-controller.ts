import '../localize/register-editor';
import { localize } from '../localize/localize';
import { autoPassthroughId, getBoxName, isAutoPassthrough } from '../utils';
import { selectionEquals } from '../editor-bridge';
import type { EditController, EditorBridge, EditRender, PreviewAction, PreviewSelection } from '../editor-bridge';
import type { Chart } from '../chart';
import type { Box, Config, Link, Section } from '../types';
import type { SectionEditProps } from '../section';
import { boxAtAlong, columnForDrop, isNoopDrop, nodeDropTarget } from './geometry';
import type { ColumnGeom, NodeDropTarget } from './geometry';
import { linkPath, renderEditBackground, renderEditForeground } from './edit-layer';
import type { EditLayerProps, GhostLink, LinkDropTarget } from './edit-layer';
import { collapseAutoPassthroughs } from './graph';
import { adoptEditStyles } from './styles';

const DRAG_THRESHOLD = { mouse: 4, other: 10 };
const LINK_TARGET_PAD = 8;
const POINTER_FOCUS_WINDOW = 500;
const GHOST_BOX_SIZE = 14;
const MIN_GHOST_BOX_SIZE = 4;

type DragState = { pointerId: number; box: Box; section: number; across: number; along: number } & (
  | { type: 'move'; target?: NodeDropTarget }
  | { type: 'link'; target?: LinkDropTarget }
);

type PressState = { pointerId: number; x: number; y: number; threshold: number } & (
  | { type: 'node'; box: Box; section: number }
  | { type: 'link'; source: string; target: string }
  | { type: 'background' }
);

export class ChartEditController implements EditController {
  private _dragState?: DragState;
  private _editRendered = false;
  // the focus ring only shows for keyboard use; these tell a pointer or script focus apart
  private _lastPointerDown = 0;
  private _refocusing = false;
  private _subscribedBridge?: EditorBridge;
  private _bridgeHighlight?: string;
  private _press?: PressState;
  private _rawLinks: Link[] = [];
  private _sectionOf = new Map<string, number>();
  private _autoTarget = new Map<string, string>();
  private _boxIndex = new Map<string, { box: Box; column: ColumnGeom }>();
  private _columns: ColumnGeom[] = [];

  constructor(private readonly host: Chart) {}

  private get editBridge(): EditorBridge | undefined {
    return this.host.editBridge;
  }

  private get config(): Config {
    return this.host.config;
  }

  private get vertical(): boolean {
    return this.host.vertical;
  }

  private get _drag(): DragState | undefined {
    return this._dragState;
  }

  private set _drag(drag: DragState | undefined) {
    if (drag === this._dragState) return;
    this._dragState = drag;
    this.host._editRevision++;
  }

  private get _svg(): SVGSVGElement | null {
    return this.host.renderRoot.querySelector<SVGSVGElement>('svg.chart') ?? null;
  }

  get dragging(): boolean {
    return !!this._dragState;
  }

  hostConnected(): void {
    adoptEditStyles(this.host.renderRoot);
    this._syncBridgeSubscription();
  }

  hostDisconnected(): void {
    this._syncBridgeSubscription();
  }

  hostUpdated(): void {
    this._syncBridgeSubscription();
    if (!this.host._editMode) return;
    this._syncBridgeHighlight();
    if (!this._editRendered) {
      this._editRendered = true;
      if (this.editBridge?.takePreviewFocus()) {
        // the new card is not laid out yet, and an element without a box cannot take focus
        requestAnimationFrame(() => {
          this._refocusing = true;
          try {
            this._svg?.focus({ preventScroll: true });
          } finally {
            this._refocusing = false;
          }
        });
      }
    }
  }

  private _syncBridgeHighlight(): void {
    const highlight = this.host._editing ? this.editBridge?.highlight : undefined;
    if (highlight === this._bridgeHighlight) return;
    const conf = highlight ? this._boxIndex.get(highlight)?.box.config : undefined;
    if (highlight && !conf) return;
    this._bridgeHighlight = highlight;
    this.host._handleMouseLeave();
    if (conf) {
      this.host.highlightPath(conf);
    }
    this.host.highlightedEntities = [...this.host.highlightedEntities];
  }

  private _syncBridgeSubscription(): void {
    const bridge = this.host.isConnected ? this.editBridge : undefined;
    if (bridge === this._subscribedBridge) return;
    this._subscribedBridge?.removeEventListener('change', this._onBridgeChange);
    bridge?.addEventListener('change', this._onBridgeChange);
    this._subscribedBridge = bridge;
  }

  private _onBridgeChange = (): void => {
    if (!this.host._editing) {
      this._press = undefined;
      this._drag = undefined;
    }
    this._syncBridgeHighlight();
    this.host._editRevision++;
  };

  // Every section index gets a column while editing, so empty ones can take drops.
  sectionsForEditing(sections: Section[]): Section[] {
    const byIndex = new Map<number, Section>();
    sections.forEach((s, i) => byIndex.set(s.index ?? i, s));
    const count = Math.max(1, ...Array.from(byIndex.keys()).map(i => i + 1));
    return Array.from({ length: count }, (_, i) => byIndex.get(i) ?? { index: i, entities: [] });
  }

  ghostSize(sectionSize: number, boxCount: number, ghostCount: number): number {
    const realCount = boxCount - ghostCount;
    const free = sectionSize - (boxCount - 1) * this.config.min_box_distance - realCount * this.config.min_box_size;
    const budget = realCount ? free / 2 : free;
    return Math.max(MIN_GHOST_BOX_SIZE, Math.min(GHOST_BOX_SIZE, Math.floor(budget / ghostCount)));
  }

  // Grows the chart along its boxes while editing until hidden nodes fit at full size.
  // A vertical chart that grows wider than the card is scaled down to fit (see styles).
  sectionSize(sections: Section[]): number {
    const { min_state, min_box_distance, height } = this.config;
    return sections.reduce((size, section) => {
      let real = 0;
      let ghosts = 0;
      section.entities.forEach(entityConf => {
        const { state } = this.host._getMemoizedState(entityConf);
        if (state && state >= min_state) {
          real++;
        } else if (!isAutoPassthrough(entityConf)) {
          ghosts++;
        }
      });
      if (!ghosts) return size;
      const needed = ghosts * GHOST_BOX_SIZE + (real + ghosts - 1) * min_box_distance;
      return Math.max(size, real ? needed * 2 : needed);
    }, this.vertical ? this.host.width - 32 : height);
  }

  prepare(): EditRender {
    const { section, layer } = this._prepareEdit();
    return {
      section,
      background: renderEditBackground(layer),
      foreground: renderEditForeground(layer),
      onPointerDown: this._onSvgPointerDown,
      onPointerMove: this._onPointerMove,
      onPointerUp: this._onPointerUp,
      onPointerCancel: this._onPointerCancel,
      onTouchStart: this._onTouchStart,
      onKeyDown: this._onKeyDown,
      onFocus: this._onFocus,
    };
  }

  indexLinks(): void {
    const { nodes, links } = this.config;
    this._rawLinks = collapseAutoPassthroughs(nodes, links).links;
    this._sectionOf = new Map(nodes.map(n => [n.id, n.section ?? 0]));
    const auto = new Set(nodes.filter(isAutoPassthrough).map(n => n.id));
    const onward = new Map<string, string>();
    links.forEach(l => {
      if (auto.has(l.source)) onward.set(l.source, l.target);
    });
    this._autoTarget.clear();
    auto.forEach(id => {
      let target = id;
      const seen = new Set<string>();
      while (auto.has(target) && onward.has(target) && !seen.has(target)) {
        seen.add(target);
        target = onward.get(target)!;
      }
      if (!auto.has(target)) {
        this._autoTarget.set(id, target);
      }
    });
  }

  private _linkFlow(source: string, target: string): number {
    return this.host.connections
      .filter(
        c =>
          (c.parent.id === source || c.passthroughs.some(p => p.id === source)) &&
          (c.child.id === target || c.passthroughs.some(p => p.id === target)),
      )
      .reduce((sum, c) => sum + c.state, 0);
  }

  // A raw link is drawn by the regular connectors only if it has a flow and
  // every synthetic hop on its way is on screen.
  private _linkRendered(link: Link, sourceSection: number, targetSection: number): boolean {
    if (this._linkFlow(link.source, link.target) <= 0) return false;
    for (let i = sourceSection + 1; i < targetSection; i++) {
      if (!this._boxIndex.has(autoPassthroughId(link.target, i))) return false;
    }
    return true;
  }

  private _isLinkCandidate(source: string, target: string): boolean {
    const s = this._boxIndex.get(source);
    const t = this._boxIndex.get(target);
    if (!s || !t || isAutoPassthrough(t.box.config) || t.column.section <= s.column.section) return false;
    return !this._rawLinks.some(l => l.source === source && l.target === target);
  }

  private _rawLinkForSegment(parent: Box, child: Box): { source: string; target: string } | undefined {
    const target = this._autoTarget.get(child.id) ?? child.id;
    if (!isAutoPassthrough(parent.config)) {
      return { source: parent.id, target };
    }
    // a shared synthetic hop carries every flow into `target`; pick the biggest
    const parentSection = this._sectionOf.get(parent.id) ?? 0;
    let best: Link | undefined;
    let bestFlow = -1;
    this._rawLinks.forEach(l => {
      if (l.target !== target || (this._sectionOf.get(l.source) ?? 0) >= parentSection) return;
      const flow = this._linkFlow(l.source, l.target);
      if (flow > bestFlow) {
        best = l;
        bestFlow = flow;
      }
    });
    return best ? { source: best.source, target: best.target } : undefined;
  }

  private _prepareEdit(): { section: SectionEditProps; layer: EditLayerProps } {
    const { box_thickness } = this.config;
    const selection = this.editBridge?.selection;
    const drag = this._drag;

    this._boxIndex.clear();
    this._columns = this.host.sections.map((s, i) => {
      const column: ColumnGeom = {
        section: s.config.index ?? i,
        near: s.offset,
        far: s.offset + s.size,
        barNear: s.offset,
        barFar: s.offset + box_thickness,
        boxes: s.boxes.map(b => ({
          id: b.id,
          start: b.top,
          end: b.top + b.size,
          ...(isAutoPassthrough(b.config) ? { locked: true } : {}),
        })),
        sorted: (s.config.sort_by || this.config.sort_by) === 'state',
      };
      s.boxes.forEach(box => this._boxIndex.set(box.id, { box, column }));
      return column;
    });
    const lastSection = this._columns[this._columns.length - 1]?.section ?? 0;

    const selectedLink = selection?.type === 'link' ? selection : undefined;
    const isLinkSelected = (source: string, target: string) =>
      !!selectedLink && selectedLink.source === source && selectedLink.target === target;
    const center = (b: Box) => b.top + b.size / 2;

    const ghostLinks: GhostLink[] = [];
    this._rawLinks.forEach(link => {
      const s = this._boxIndex.get(link.source);
      const t = this._boxIndex.get(link.target);
      if (!s || !t || t.column.section <= s.column.section) return;
      if (!s.box.ghost && !t.box.ghost && this._linkRendered(link, s.column.section, t.column.section)) return;
      ghostLinks.push({
        source: link.source,
        target: link.target,
        d: linkPath(this.vertical, [s.column.barFar, center(s.box)], [t.column.barNear, center(t.box)]),
        selected: isLinkSelected(link.source, link.target),
      });
    });

    const linkCandidates = new Set<string>();
    if (drag?.type === 'link') {
      this._boxIndex.forEach((_, id) => {
        if (this._isLinkCandidate(drag.box.id, id)) linkCandidates.add(id);
      });
    }

    let link: EditLayerProps['link'];
    if (drag?.type === 'link') {
      const source = this._boxIndex.get(drag.box.id);
      const target = drag.target?.type === 'node' ? this._boxIndex.get(drag.target.box.id) : undefined;
      if (source) {
        link = {
          from: [source.column.barFar, center(source.box)],
          to: target ? [target.column.barNear, center(target.box)] : [drag.across, drag.along],
          target: drag.target,
        };
      }
    }

    const section: SectionEditProps = {
      selectedNode: selection?.type === 'node' ? selection.id : undefined,
      draggingNode: drag?.type === 'move' ? drag.box.id : undefined,
      linkSource: drag?.type === 'link' ? drag.box.id : undefined,
      linkCandidates,
      linkHover: drag?.type === 'link' && drag.target?.type === 'node' ? drag.target.box.id : undefined,
      hiddenTitle: localize('editor.preview.hidden_node'),
      missingTitle: localize('editor.preview.entity_not_found'),
      linkHandleTitle: localize('editor.preview.link_handle'),
      canLink: box =>
        !isAutoPassthrough(box.config) && (this._boxIndex.get(box.id)?.column.section ?? lastSection) < lastSection,
      isSegmentSelected: (parent, child) => {
        if (!selectedLink) return false;
        const { source, target } = selectedLink;
        const parentOnPath =
          parent.id === source ||
          (this._autoTarget.get(parent.id) === target &&
            (this._sectionOf.get(parent.id) ?? 0) > (this._sectionOf.get(source) ?? 0));
        return parentOnPath && (child.id === target || this._autoTarget.get(child.id) === target);
      },
      onBoxPointerDown: this._onBoxPointerDown,
      onHandlePointerDown: this._onHandlePointerDown,
      onSegmentPointerDown: this._onSegmentPointerDown,
    };

    const layer: EditLayerProps = {
      vertical: this.vertical,
      alongSize: this.host._sectionSize,
      columns: this._columns,
      ghostLinks,
      move:
        drag?.type === 'move'
          ? {
              box: drag.box,
              name: getBoxName(this.host.hass, drag.box),
              across: drag.across,
              along: drag.along,
              target: drag.target,
              thickness: box_thickness,
            }
          : undefined,
      link,
      strings: {
        dropHere: localize('editor.preview.drop_here'),
        addNode: localize('editor.preview.add_node'),
        newSection: localize('editor.preview.new_section'),
      },
      onAddNode: sectionIndex => this._dispatch({ type: 'add_node', section: sectionIndex }),
      onGhostLinkPointerDown: this._onGhostLinkPointerDown,
    };

    return { section, layer };
  }

  private _dispatch(action: PreviewAction): void {
    const bridge = this.editBridge;
    if (!bridge) return;
    if (action.type !== 'select' && action.type !== 'add_node' && this.host.shadowRoot?.activeElement === this._svg) {
      bridge.keepPreviewFocus();
    }
    bridge.dispatch(action);
  }

  private _select(selection?: PreviewSelection): void {
    if (!selectionEquals(selection, this.editBridge?.selection)) {
      this._dispatch({ type: 'select', selection });
    }
  }

  private _pointerAxes(ev: PointerEvent): { across: number; along: number } {
    let x = 0;
    let y = 0;
    const ctm = this._svg?.getScreenCTM?.();
    if (ctm) {
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
      x = p.x;
      y = p.y;
    }
    return this.vertical ? { across: y, along: x } : { across: x, along: y };
  }

  private _setFocusRing(show: boolean): void {
    const bridge = this.editBridge;
    if (!bridge || bridge.focusRing === show) return;
    bridge.focusRing = show;
    this.host._editRevision++;
  }

  private _notePointer(): void {
    this._lastPointerDown = Date.now();
    this._setFocusRing(false);
  }

  private _onFocus = (): void => {
    // a rebuilt preview keeps the ring of the one it replaces, and a focus right after a press came from the pointer
    if (this._refocusing || Date.now() - this._lastPointerDown < POINTER_FOCUS_WINDOW) return;
    this._setFocusRing(true);
  };

  private _capturePointer(ev: PointerEvent): void {
    this._notePointer();
    try {
      this._svg?.setPointerCapture(ev.pointerId);
    } catch (_err) {
      // the pointer may already be gone
    }
    this._svg?.focus({ preventScroll: true });
  }

  // a second finger must not hijack or end the gesture in progress
  private _isBusy(ev: PointerEvent): boolean {
    return ev.button !== 0 || !!this._press || !!this._drag;
  }

  private _isActivePointer(ev: PointerEvent): boolean {
    return (this._drag ?? this._press)?.pointerId === ev.pointerId;
  }

  private _pressAt(ev: PointerEvent) {
    return {
      pointerId: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      threshold: ev.pointerType === 'mouse' ? DRAG_THRESHOLD.mouse : DRAG_THRESHOLD.other,
    };
  }

  private _onBoxPointerDown = (ev: PointerEvent, box: Box): void => {
    if (this._isBusy(ev) || isAutoPassthrough(box.config)) return;
    ev.stopPropagation();
    const section = this._boxIndex.get(box.id)?.column.section ?? 0;
    this._capturePointer(ev);
    this._press = { type: 'node', box, section, ...this._pressAt(ev) };
  };

  private _onHandlePointerDown = (ev: PointerEvent, box: Box): void => {
    if (this._isBusy(ev)) return;
    ev.stopPropagation();
    ev.preventDefault();
    this._capturePointer(ev);
    this.host._handleMouseLeave();
    const section = this._boxIndex.get(box.id)?.column.section ?? 0;
    this._drag = { type: 'link', pointerId: ev.pointerId, box, section, ...this._pointerAxes(ev) };
  };

  private _onSegmentPointerDown = (ev: PointerEvent, parent: Box, child: Box): void => {
    if (this._isBusy(ev)) return;
    const link = this._rawLinkForSegment(parent, child);
    if (!link) return;
    ev.stopPropagation();
    this._capturePointer(ev);
    this._press = { type: 'link', ...link, ...this._pressAt(ev) };
  };

  private _onGhostLinkPointerDown = (ev: PointerEvent, link: GhostLink): void => {
    if (this._isBusy(ev)) return;
    ev.stopPropagation();
    this._capturePointer(ev);
    this._press = { type: 'link', source: link.source, target: link.target, ...this._pressAt(ev) };
  };

  private _onSvgPointerDown = (ev: PointerEvent): void => {
    this._notePointer();
    if (this._isBusy(ev)) return;
    this._capturePointer(ev);
    this._press = { type: 'background', ...this._pressAt(ev) };
  };

  // touch-action is ignored on inner SVG elements, so stop the pan that would cancel a drag
  private _onTouchStart = {
    handleEvent: (ev: TouchEvent): void => {
      if (this._drag || this._press?.type === 'node') {
        ev.preventDefault();
      }
    },
    passive: false,
  };

  private _onPointerMove = (ev: PointerEvent): void => {
    if (!this._isActivePointer(ev)) return;
    const press = this._press;
    if (press && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) >= press.threshold) {
      this._press = undefined;
      if (press.type === 'node') {
        this.host._handleMouseLeave();
        this._drag = {
          type: 'move',
          pointerId: press.pointerId,
          box: press.box,
          section: press.section,
          ...this._pointerAxes(ev),
        };
      }
    }
    const drag = this._drag;
    if (!drag) return;
    ev.preventDefault();
    const { across, along } = this._pointerAxes(ev);
    if (drag.type === 'move') {
      const target = nodeDropTarget(this._columns, across, along, drag.box.id);
      this._drag = {
        ...drag,
        across,
        along,
        target: target && !isNoopDrop(this._columns, drag.box.id, drag.section, target) ? target : undefined,
      };
    } else {
      this._drag = { ...drag, across, along, target: this._linkDropTarget(drag.box.id, drag.section, across, along) };
    }
  };

  private _linkDropTarget(source: string, sourceSection: number, across: number, along: number): LinkDropTarget | undefined {
    const column = columnForDrop(this._columns, across);
    if (!column || column.section <= sourceSection) return undefined;
    const hit = boxAtAlong(column, along, LINK_TARGET_PAD);
    if (!hit) {
      return { type: 'new_node', section: column.section };
    }
    const entry = this._boxIndex.get(hit.id);
    return entry && this._isLinkCandidate(source, hit.id) ? { type: 'node', box: entry.box } : undefined;
  }

  private _onPointerUp = (ev: PointerEvent): void => {
    if (!this._isActivePointer(ev)) return;
    const press = this._press;
    const drag = this._drag;
    this._press = undefined;
    this._drag = undefined;
    if (drag) {
      this._finishDrag(drag);
    } else if (press?.type === 'node') {
      this._select({ type: 'node', id: press.box.id });
    } else if (press?.type === 'link') {
      this._select({ type: 'link', source: press.source, target: press.target });
    } else if (press) {
      this._select(undefined);
    }
  };

  private _onPointerCancel = (ev: PointerEvent): void => {
    if (!this._isActivePointer(ev)) return;
    this._press = undefined;
    this._drag = undefined;
  };

  private _finishDrag(drag: DragState): void {
    if (!drag.target) return;
    if (drag.type === 'move') {
      const { target } = drag;
      this._dispatch({
        type: 'move_node',
        id: drag.box.id,
        section: target.section,
        ...(target.type === 'section' && target.before ? { before: target.before } : {}),
        ...(target.type === 'new_section' ? { new_section: true } : {}),
      });
    } else if (drag.target.type === 'node') {
      this._dispatch({ type: 'add_link', source: drag.box.id, target: drag.target.box.id });
    } else {
      this._dispatch({ type: 'add_node', section: drag.target.section, link_from: drag.box.id });
    }
  }

  private _onKeyDown = (ev: KeyboardEvent): void => {
    this._setFocusRing(true);
    const selection = this.editBridge?.selection;
    if (ev.key === 'Escape') {
      if (this._drag || this._press) {
        this._press = undefined;
        this._drag = undefined;
      } else if (selection) {
        this._select(undefined);
      } else {
        return;
      }
    } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && selection) {
      this._dispatch({ type: 'remove', selection });
    } else if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'z') {
      this._dispatch({ type: 'undo' });
    } else {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  };
}
