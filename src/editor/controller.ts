import type { PreviewSelection } from '../editor-bridge';
import type { SankeyChartConfig } from '../types';
import type { MoveNodeOptions } from './config-ops';

export interface EditResult {
  config: SankeyChartConfig;
  /** New selection; `null` clears it, `undefined` keeps the current one. */
  select?: PreviewSelection | null;
  /** Message for a destructive change; shown as a toast with an undo action. */
  toast?: string;
  error?: string;
}

export type Edit = (config: SankeyChartConfig) => EditResult;

export interface EditOptions {
  /**
   * `true` makes the change its own undo step. A string groups consecutive
   * changes with the same key (typing in one field) into a single step.
   */
  undo?: true | string;
}

/** What the views need from the editor. Edits always apply to its latest config. */
export interface EditorController {
  edit(edit: Edit, options?: EditOptions): EditResult;
  /** Ignores selections of nodes or links that do not exist. */
  select(selection?: PreviewSelection): void;
  highlight(nodeId?: string): void;
  openAddNode(section: number, linkFrom?: string): void;
  closeAddNode(): void;
  undo(): void;
  removeNode(id: string): void;
  removeLink(source: string, target: string): void;
  moveNode(id: string, section: number, options?: MoveNodeOptions): void;
}
