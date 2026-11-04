import { boxAtAlong, ColumnGeom, isNoopDrop, nearestColumn, nodeDropTarget } from '../src/preview/geometry';

// Three 100px wide columns with a 15px bar at the start of each.
const column = (section: number, boxes: ColumnGeom['boxes'], sorted = false): ColumnGeom => ({
  section,
  near: section * 100,
  far: section * 100 + 100,
  barNear: section * 100,
  barFar: section * 100 + 15,
  boxes,
  sorted,
});

const columns = (): ColumnGeom[] => [
  column(0, [{ id: 'a', start: 0, end: 100 }]),
  column(1, [
    { id: 'b', start: 0, end: 40 },
    { id: 'c', start: 60, end: 100 },
    { id: 'c__passthrough_1__auto', start: 120, end: 130, locked: true },
  ]),
  column(2, [{ id: 'd', start: 0, end: 50 }]),
];

describe('nearestColumn', () => {
  it('picks the column whose bar is closest', () => {
    expect(nearestColumn(columns(), 40)?.section).toBe(0);
    expect(nearestColumn(columns(), 70)?.section).toBe(1);
    expect(nearestColumn(columns(), 400)?.section).toBe(2);
  });
});

describe('boxAtAlong', () => {
  it('finds the box under the pointer, with padding', () => {
    const col = columns()[1];
    expect(boxAtAlong(col, 20)?.id).toBe('b');
    expect(boxAtAlong(col, 43)?.id).toBe('b');
    expect(boxAtAlong(col, 50)).toBeUndefined();
    expect(boxAtAlong(col, 125)?.id).toBe('c__passthrough_1__auto');
  });
});

describe('nodeDropTarget', () => {
  it('inserts before the first box whose center is below the pointer', () => {
    expect(nodeDropTarget(columns(), 105, 10, 'a')).toEqual({ type: 'section', section: 1, before: 'b', marker: 0 });
    expect(nodeDropTarget(columns(), 105, 50, 'a')).toEqual({ type: 'section', section: 1, before: 'c', marker: 50 });
  });

  it('appends after the last box, ignoring synthetic passthroughs', () => {
    expect(nodeDropTarget(columns(), 105, 95, 'a')).toEqual({ type: 'section', section: 1, before: undefined, marker: 103 });
  });

  it('ignores the dragged box itself', () => {
    expect(nodeDropTarget(columns(), 105, 10, 'b')).toEqual({ type: 'section', section: 1, before: 'c', marker: 57 });
  });

  it('offers a new section in the middle of the gap between two columns', () => {
    // gap between bar 0 (ends at 15) and bar 1 (starts at 100) is centered at 57.5
    expect(nodeDropTarget(columns(), 57, 50, 'a')).toEqual({ type: 'new_section', section: 1, marker: 57.5 });
  });

  it('offers a new section after the last column', () => {
    const target = nodeDropTarget(columns(), 280, 50, 'a');
    expect(target).toMatchObject({ type: 'new_section', section: 3 });
  });

  it('does not offer a trailing section when the last column is empty', () => {
    const cols = [...columns(), column(3, [])];
    expect(nodeDropTarget(cols, 390, 50, 'a')).toEqual({ type: 'section', section: 3, before: undefined, marker: undefined });
  });

  it('has no insert position in a column sorted by state', () => {
    const cols = columns();
    cols[1] = { ...cols[1], sorted: true };
    expect(nodeDropTarget(cols, 105, 10, 'a')).toEqual({ type: 'section', section: 1 });
  });
});

describe('isNoopDrop', () => {
  it('detects drops that keep the node in place', () => {
    const cols = columns();
    expect(isNoopDrop(cols, 'b', 1, { type: 'section', section: 1, before: 'c' })).toBe(true);
    expect(isNoopDrop(cols, 'c', 1, { type: 'section', section: 1 })).toBe(true);
    expect(isNoopDrop(cols, 'c', 1, { type: 'section', section: 1, before: 'b' })).toBe(false);
    expect(isNoopDrop(cols, 'b', 1, { type: 'section', section: 2 })).toBe(false);
    expect(isNoopDrop(cols, 'b', 1, { type: 'new_section', section: 1, marker: 0 })).toBe(false);
  });

  it('treats a lone node dropped into a new section beside its own column as staying put', () => {
    const cols = columns();
    expect(isNoopDrop(cols, 'a', 0, { type: 'new_section', section: 0, marker: 0 })).toBe(true);
    expect(isNoopDrop(cols, 'a', 0, { type: 'new_section', section: 1, marker: 0 })).toBe(true);
    expect(isNoopDrop(cols, 'a', 0, { type: 'new_section', section: 2, marker: 0 })).toBe(false);
    expect(isNoopDrop(cols, 'd', 2, { type: 'new_section', section: 3, marker: 0 })).toBe(true);
  });
});
