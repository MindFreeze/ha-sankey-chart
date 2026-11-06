// Preview editing geometry. "across" is the axis sections are laid out on (x when
// horizontal), "along" is the axis boxes are stacked on (y when horizontal).

export interface BoxGeom {
  id: string;
  start: number;
  end: number;
  locked?: boolean; // synthetic passthrough: drawn, but not a drop or link target
}

export interface ColumnGeom {
  section: number;
  near: number;
  far: number;
  barNear: number;
  barFar: number;
  boxes: BoxGeom[];
  sorted: boolean;
}

export type NodeDropTarget =
  | { type: 'section'; section: number; before?: string; marker?: number }
  | { type: 'new_section'; section: number; marker: number };

const GAP_BAND = 14;
const TRAILING_BAND_MIN = 16;
const MARKER_OFFSET = 3;

const barCenter = (c: ColumnGeom) => (c.barNear + c.barFar) / 2;

export function nearestColumn(columns: ColumnGeom[], across: number): ColumnGeom | undefined {
  let nearest: ColumnGeom | undefined;
  let best = Infinity;
  columns.forEach(c => {
    const distance = Math.abs(across - barCenter(c));
    if (distance < best) {
      best = distance;
      nearest = c;
    }
  });
  return nearest;
}

const emptyColumnAt = (columns: ColumnGeom[], across: number) =>
  columns.find(c => !c.boxes.length && across >= c.near && across < c.far);

/** Empty columns take drops anywhere on their placeholder, other columns by nearest bar. */
export function columnForDrop(columns: ColumnGeom[], across: number): ColumnGeom | undefined {
  return emptyColumnAt(columns, across) ?? nearestColumn(columns, across);
}

export function boxAtAlong(column: ColumnGeom, along: number, pad = 4): BoxGeom | undefined {
  let hit: BoxGeom | undefined;
  let best = Infinity;
  column.boxes.forEach(b => {
    if (along < b.start - pad || along > b.end + pad) return;
    const distance = Math.abs(along - (b.start + b.end) / 2);
    if (distance < best) {
      best = distance;
      hit = b;
    }
  });
  return hit;
}

/** Where a node dragged to (across, along) lands: an existing section or a new one. */
export function nodeDropTarget(
  columns: ColumnGeom[],
  across: number,
  along: number,
  draggedId: string,
): NodeDropTarget | undefined {
  if (!columns.length) return undefined;

  const empty = emptyColumnAt(columns, across);
  if (empty) {
    return { type: 'section', section: empty.section };
  }

  for (let i = 0; i < columns.length - 1; i++) {
    const a = columns[i];
    const b = columns[i + 1];
    const mid = (a.barFar + b.barNear) / 2;
    const half = Math.min(GAP_BAND, (b.barNear - a.barFar) * 0.15);
    if (half > 2 && Math.abs(across - mid) <= half) {
      return { type: 'new_section', section: b.section, marker: mid };
    }
  }

  const last = columns[columns.length - 1];
  if (last.boxes.some(b => !b.locked)) {
    const start = last.barFar + Math.max(TRAILING_BAND_MIN, (last.far - last.barFar) * 0.5);
    if (across >= start) {
      return { type: 'new_section', section: last.section + 1, marker: Math.max(start, last.far - MARKER_OFFSET) };
    }
  }

  const target = nearestColumn(columns, across)!;
  if (target.sorted) {
    return { type: 'section', section: target.section };
  }
  const others = target.boxes.filter(b => b.id !== draggedId && !b.locked);
  const nextIndex = others.findIndex(b => along < (b.start + b.end) / 2);
  const next = nextIndex === -1 ? undefined : others[nextIndex];
  const prev = others[(nextIndex === -1 ? others.length : nextIndex) - 1];
  let marker: number | undefined;
  if (next && prev) {
    marker = (prev.end + next.start) / 2;
  } else if (next) {
    marker = Math.max(0, next.start - MARKER_OFFSET);
  } else if (prev) {
    marker = prev.end + MARKER_OFFSET;
  }
  return { type: 'section', section: target.section, before: next?.id, marker };
}

/** Whether dropping `id` at `target` would leave the node where it already is. */
export function isNoopDrop(
  columns: ColumnGeom[],
  id: string,
  currentSection: number,
  target: NodeDropTarget,
): boolean {
  if (target.type === 'new_section') {
    const own = columns.find(c => c.section === currentSection);
    const alone = !!own && own.boxes.filter(b => !b.locked).length === 1;
    return alone && (target.section === currentSection || target.section === currentSection + 1);
  }
  if (target.section !== currentSection) return false;
  const column = columns.find(c => c.section === currentSection);
  if (!column || column.sorted) return true;
  const ids = column.boxes.filter(b => !b.locked).map(b => b.id);
  const index = ids.indexOf(id);
  if (index === -1) return false;
  return target.before === ids[index + 1];
}
