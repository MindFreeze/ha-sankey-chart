import type { ReactiveController, SVGTemplateResult } from 'lit';
import type { Chart } from './chart';
import type { SectionEditProps } from './section';
import type { Config, Link, Node, Section, SectionConfig } from './types';

// Like HA's PREVIEW_CLICK_CALLBACK: survives config spreads and deepFreeze, never serialized.
export const EDITOR_BRIDGE = Symbol('sankeyChartEditorBridge');

export type PreviewSelection = { type: 'node'; id: string } | { type: 'link'; source: string; target: string };

export type PreviewAction =
  | { type: 'select'; selection?: PreviewSelection }
  | { type: 'move_node'; id: string; section: number; before?: string; new_section?: boolean }
  | { type: 'add_link'; source: string; target: string }
  | { type: 'add_node'; section: number; link_from?: string }
  | { type: 'remove'; selection: PreviewSelection }
  | { type: 'undo' };

export interface GeneratedConfig {
  nodes: Node[];
  links: Link[];
  sections: SectionConfig[];
}

export const selectionEquals = (a?: PreviewSelection, b?: PreviewSelection): boolean => {
  if (!a || !b) return a === b;
  if (a.type === 'node' && b.type === 'node') return a.id === b.id;
  if (a.type === 'link' && b.type === 'link') return a.source === b.source && a.target === b.target;
  return false;
};

export interface EditorBridge extends EventTarget {
  readonly active: boolean;
  readonly selection?: PreviewSelection;
  readonly highlight?: string;
  focusRing: boolean;
  previewWidth?: number;
  claim(card: Element): boolean;
  release(card: Element): void;
  reportGenerated(config: GeneratedConfig): void;
  reportPasted(config: Config): void;
  dispatch(action: PreviewAction): void;
  keepPreviewFocus(): void;
  takePreviewFocus(): boolean;
  createEditController(host: Chart): EditController;
}

export interface EditRender {
  section: SectionEditProps;
  background: SVGTemplateResult;
  foreground: SVGTemplateResult;
  onPointerDown(ev: PointerEvent): void;
  onPointerMove(ev: PointerEvent): void;
  onPointerUp(ev: PointerEvent): void;
  onPointerCancel(ev: PointerEvent): void;
  onTouchStart: EventListenerObject & AddEventListenerOptions;
  onKeyDown(ev: KeyboardEvent): void;
  onFocus(): void;
}

export interface EditController extends ReactiveController {
  readonly dragging: boolean;
  indexLinks(): void;
  sectionsForEditing(sections: Section[]): Section[];
  sectionSize(sections: Section[]): number;
  ghostSize(sectionSize: number, boxCount: number, ghostCount: number): number;
  prepare(): EditRender;
}

export const getEditorBridge = (config: unknown): EditorBridge | undefined => {
  if (!config || typeof config !== 'object') return undefined;
  const bridge = (config as Record<symbol, unknown>)[EDITOR_BRIDGE];
  return bridge instanceof EventTarget && typeof (bridge as EditorBridge).createEditController === 'function'
    ? (bridge as EditorBridge)
    : undefined;
};
