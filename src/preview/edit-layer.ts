import { html, nothing, svg, SVGTemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map';
import type { Box } from '../types';
import type { ColumnGeom, NodeDropTarget } from './geometry';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const PLACEHOLDER_INSET = 4;
const DRAG_PREVIEW_MAX = 40;

export type LinkDropTarget = { type: 'node'; box: Box } | { type: 'new_node'; section: number };

export interface GhostLink {
  source: string;
  target: string;
  d: string;
  selected: boolean;
}

export interface EditLayerProps {
  vertical: boolean;
  alongSize: number;
  columns: ColumnGeom[];
  ghostLinks: GhostLink[];
  move?: { box: Box; name: string; across: number; along: number; target?: NodeDropTarget; thickness: number };
  link?: { from: [number, number]; to: [number, number]; target?: LinkDropTarget };
  strings: { dropHere: string; addNode: string; newSection: string };
  onAddNode: (section: number) => void;
  onGhostLinkPointerDown: (ev: PointerEvent, link: GhostLink) => void;
}

/** [across, along] → [x, y] */
export const toXY = (vertical: boolean, across: number, along: number): [number, number] =>
  vertical ? [along, across] : [across, along];

const rect = (vertical: boolean, across0: number, across1: number, along0: number, along1: number) => {
  const [x0, y0] = toXY(vertical, across0, along0);
  const [x1, y1] = toXY(vertical, across1, along1);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
};

export function linkPath(vertical: boolean, from: [number, number], to: [number, number]): string {
  const [acrossA, alongA] = from;
  const [acrossB, alongB] = to;
  const mid = (acrossA + acrossB) / 2;
  const p = (across: number, along: number) => toXY(vertical, across, along).join(',');
  return `M${p(acrossA, alongA)} C${p(mid, alongA)} ${p(mid, alongB)} ${p(acrossB, alongB)}`;
}

export function renderEditBackground(props: EditLayerProps): SVGTemplateResult {
  const { vertical, alongSize, move } = props;
  const target = move?.target;
  return svg`
    <g class="edit-background">
      ${props.columns.map(column => {
        const isTarget = target?.type === 'section' && target.section === column.section;
        const empty = !column.boxes.length;
        const area = rect(vertical, column.near, column.far, 0, alongSize);
        const placeholder = rect(
          vertical,
          column.near + PLACEHOLDER_INSET,
          column.far - PLACEHOLDER_INSET,
          PLACEHOLDER_INSET,
          alongSize - PLACEHOLDER_INSET,
        );
        return svg`
          ${isTarget && !empty
            ? svg`<rect class="drop-column" x=${area.x} y=${area.y} width=${area.width} height=${area.height}></rect>`
            : nothing}
          ${empty
            ? svg`
              <rect
                class=${classMap({ 'empty-section': true, 'drop-target': isTarget })}
                x=${placeholder.x} y=${placeholder.y}
                width=${Math.max(0, placeholder.width)} height=${Math.max(0, placeholder.height)}
                rx="6"
              ></rect>
              <foreignObject
                x=${placeholder.x} y=${placeholder.y}
                width=${Math.max(0, placeholder.width)} height=${Math.max(0, placeholder.height)}
              >
                ${html`<div xmlns=${XHTML_NS} class="empty-section-content">
                  <button
                    class="add-node"
                    title=${props.strings.addNode}
                    aria-label=${props.strings.addNode}
                    @pointerdown=${(ev: PointerEvent) => ev.stopPropagation()}
                    @click=${() => props.onAddNode(column.section)}
                  >
                    <ha-icon icon="mdi:plus"></ha-icon>
                  </button>
                  <span>${props.strings.dropHere}</span>
                </div>`}
              </foreignObject>
            `
            : nothing}
        `;
      })}
      ${props.ghostLinks.map(
        link => svg`
          <g class=${classMap({ 'ghost-link': true, selected: link.selected })}>
            <path class="hit" d=${link.d}
              @pointerdown=${(ev: PointerEvent) => props.onGhostLinkPointerDown(ev, link)}></path>
            <path class="line" d=${link.d}></path>
          </g>
        `,
      )}
    </g>
  `;
}

export function renderEditForeground(props: EditLayerProps): SVGTemplateResult {
  const { vertical, alongSize, move, link } = props;
  const parts: SVGTemplateResult[] = [];

  if (move) {
    const target = move.target;
    const column = target ? props.columns.find(c => c.section === target.section) : undefined;
    if (target?.type === 'section' && column && target.marker !== undefined) {
      const [x1, y1] = toXY(vertical, column.barNear - 6, target.marker);
      const [x2, y2] = toXY(vertical, Math.min(column.far, column.barFar + 40), target.marker);
      parts.push(svg`<line class="drop-marker" x1=${x1} y1=${y1} x2=${x2} y2=${y2}></line>`);
    } else if (target?.type === 'new_section') {
      const [x1, y1] = toXY(vertical, target.marker, 0);
      const [x2, y2] = toXY(vertical, target.marker, alongSize);
      const [cx, cy] = toXY(vertical, target.marker, 12);
      parts.push(svg`
        <g class="new-section-marker">
          <line x1=${x1} y1=${y1} x2=${x2} y2=${y2}></line>
          <circle cx=${cx} cy=${cy} r="9"></circle>
          <path d="M${cx - 4},${cy} h8 M${cx},${cy - 4} v8"></path>
          <title>${props.strings.newSection}</title>
        </g>
      `);
    }
    const length = Math.min(Math.max(move.box.size, 12), DRAG_PREVIEW_MAX);
    const preview = rect(
      vertical,
      move.across - move.thickness / 2,
      move.across + move.thickness / 2,
      move.along - length / 2,
      move.along + length / 2,
    );
    const [tx, ty] = vertical
      ? [move.along, move.across + move.thickness / 2 + 14]
      : [move.across + move.thickness / 2 + 6, move.along + 4];
    parts.push(svg`
      <g class="drag-preview">
        <rect x=${preview.x} y=${preview.y} width=${preview.width} height=${preview.height}
          fill=${move.box.color}></rect>
        <text x=${tx} y=${ty} text-anchor=${vertical ? 'middle' : 'start'}>${move.name}</text>
      </g>
    `);
  }

  if (link) {
    const to = link.to;
    const [ex, ey] = toXY(vertical, to[0], to[1]);
    parts.push(svg`
      <g class=${classMap({ 'link-preview': true, snapped: link.target?.type === 'node' })}>
        <path d=${linkPath(vertical, link.from, to)}></path>
        <circle cx=${ex} cy=${ey} r="4"></circle>
      </g>
    `);
    if (link.target?.type === 'new_node') {
      parts.push(svg`
        <g class="add-node-hint">
          <text x=${ex + 10} y=${ey - 8}>+ ${props.strings.addNode}</text>
        </g>
      `);
    }
  }

  return svg`<g class="edit-foreground">${parts}</g>`;
}
