import { html, nothing, svg, SVGTemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map';
import { styleMap } from 'lit/directives/style-map';
import { Box, Config, ConnectionState, EntityConfigInternal, SectionState } from './types';
import { formatState, getBoxName, getChildConnections, getEntityId, normalizeStateValue } from './utils';
import { FrontendLocaleData, HomeAssistant, stateIcon } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';
import { renderLabel } from './label';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SELECTION_PADDING = 3;
const HANDLE_OFFSET = 7;
// touch target size (WCAG 2.5.8); it starts at the bar's edge so the bar still moves the node
const COARSE_HIT = 24;

/** Preview editing hooks; only passed while a visual editor is attached. */
export interface SectionEditProps {
  selectedNode?: string;
  draggingNode?: string;
  linkSource?: string;
  linkCandidates: Set<string>;
  linkHover?: string;
  hiddenTitle: string;
  missingTitle: string;
  linkHandleTitle: string;
  canLink: (box: Box) => boolean;
  isSegmentSelected: (parent: Box, child: Box) => boolean;
  onBoxPointerDown: (ev: PointerEvent, box: Box) => void;
  onHandlePointerDown: (ev: PointerEvent, box: Box) => void;
  onSegmentPointerDown: (ev: PointerEvent, parent: Box, child: Box) => void;
}

const hasConnection = (parent: Box, child: Box, allConnections: ConnectionState[]) =>
  allConnections.some(
    c =>
      (c.parent === parent.config || c.passthroughs.includes(parent.config)) &&
      (c.child === child.config || c.passthroughs.includes(child.config)),
  );

export function renderBranchConnectors(props: {
  hass: HomeAssistant;
  locale: FrontendLocaleData;
  config: Config;
  section: SectionState;
  nextSection?: SectionState;
  sectionIndex: number;
  allConnections: ConnectionState[];
  vertical: boolean;
  edit?: SectionEditProps;
}): SVGTemplateResult[] {
  const { boxes, size, offset } = props.section;
  const { box_thickness, connection_margin } = props.config;
  const { edit } = props;
  const nearEdge = box_thickness + connection_margin + offset;
  const farEdge = size + offset - connection_margin;
  const midEdge = (nearEdge + farEdge) / 2;
  return boxes
    // ghosts are drawn at a fixed size, so their flows are drawn as dashed ghost links instead
    .filter(b => b.children.length > 0 && !b.ghost)
    .map((b, boxIndex) => {
      const children = props.nextSection!.boxes.filter(
        child =>
          b.children.some(c => getEntityId(c) === child.id) &&
          (!edit || (!child.ghost && hasConnection(b, child, props.allConnections))),
      );
      const pairs = getChildConnections(props.hass, b, children, props.allConnections)
        .map((c, i) => ({ c, child: children[i] }))
        .filter(({ c }) => c.state > 0);
      const connections = pairs.map(({ c }) => c);
      return svg`
        <defs>
          ${connections.map(
            (c, i) => svg`
            <linearGradient id="gradient${props.sectionIndex}.${boxIndex}.${i}" gradientTransform="${
              props.vertical ? 'rotate(90)' : ''
            }">
              <stop offset="0%" stop-color="${c.startColor}"></stop>
              <stop offset="100%" stop-color="${c.endColor}"></stop>
            </linearGradient>
          `,
          )}
        </defs>
        ${connections.map((c, i) => {
          const pt = (along: number, across: number): [number, number] =>
            props.vertical ? [along, across] : [across, along];
          const coords: [string, number, number][] = [
            ['M', ...pt(c.startY, nearEdge)],
            ['C', ...pt(c.startY, midEdge)],
            ['', ...pt(c.endY, midEdge)],
            ['', ...pt(c.endY, farEdge)],
            ['L', ...pt(c.endY + c.endSize, farEdge)],
            ['C', ...pt(c.endY + c.endSize, midEdge)],
            ['', ...pt(c.startY + c.startSize, midEdge)],
            ['', ...pt(c.startY + c.startSize, nearEdge)],
          ];
          // Native hover tooltip for the flow, mirroring the box <title>.
          // Re-apply the unit prefix so the value matches the box label: with
          // unit_prefix: 'auto' the boxes are rescaled per-box at render time
          // while c.state stays in base units (for explicit prefixes the state
          // is already scaled, so this is a no-op). Node names may carry
          // intentional newlines for box labels, but a flow tooltip reads best
          // on one line, so collapse whitespace. Built as one concatenated
          // string so it renders as a single text node.
          const { state: scaledState, unit_of_measurement: scaledUnit } = normalizeStateValue(
            props.config.unit_prefix,
            c.state,
            b.unit_of_measurement,
            true,
          );
          const value =
            formatState(scaledState, props.config.round, props.locale, props.config.monetary_unit) +
            (scaledUnit || '');
          const source = (c.startName || '').replace(/\s+/g, ' ').trim();
          const target = (c.endName || '').replace(/\s+/g, ' ').trim();
          const title = `${source} → ${target}: ${value}`;
          const child = pairs[i].child;
          const selected = !!edit && edit.isSegmentSelected(b, child);
          return svg`
              <path d="${coords.map(([cmd, x, y]) => `${cmd}${x},${y}`).join(' ')} Z"
                class=${edit ? classMap({ link: true, selected }) : nothing}
                fill="url(#gradient${props.sectionIndex}.${boxIndex}.${i})" fill-opacity="${
            c.highlighted || selected ? 0.85 : 0.4
          }"
                @pointerdown=${edit ? (ev: PointerEvent) => edit.onSegmentPointerDown(ev, b, child) : nothing}>
                <title>${title}</title>
              </path>
            `;
        })}
      `;
    });
}

export function renderSection(props: {
  hass: HomeAssistant;
  locale: FrontendLocaleData;
  config: Config;
  section: SectionState;
  nextSection?: SectionState;
  sectionIndex: number;
  highlightedEntities: EntityConfigInternal[];
  allConnections: ConnectionState[];
  vertical: boolean;
  onTap: (config: Box) => void;
  onDoubleTap: (config: Box) => void;
  onMouseEnter: (config: Box) => void;
  onMouseLeave: () => void;
  edit?: SectionEditProps;
}) {
  const { show_icons, box_thickness } = props.config;
  const { boxes, spacerSize, offset, size } = props.section;
  const { edit } = props;
  const hasChildren = props.nextSection && boxes.some(b => b.children.length > 0);

  return svg`
    <g class="section">
      ${hasChildren
        ? svg`<g class="connectors">${renderBranchConnectors(props)}</g>`
        : null}
      ${boxes.map(box => {
        const { entity } = box;
        if (props.config.unit_prefix === 'auto') {
          box = { ...box, ...normalizeStateValue(props.config.unit_prefix, box.state, box.unit_of_measurement, true) };
        }
        const formattedState = formatState(box.state, props.config.round, props.locale, props.config.monetary_unit);
        const isNotPassthrough = box.config.type !== 'passthrough';
        const name = getBoxName(props.hass, box);
        const icon = box.config.icon || stateIcon(entity as HassEntity);
        const isHighlighted = props.highlightedEntities.includes(box.config);

        const colorRect = props.vertical
          ? { x: box.top, y: offset, width: box.size, height: box_thickness }
          : { x: offset, y: box.top, width: box_thickness, height: box.size };
        const labelArea = props.vertical
          ? { x: box.top, y: offset + box_thickness, width: box.size, height: size - box_thickness }
          : { x: offset + box_thickness, y: box.top, width: size - box_thickness, height: box.size };

        const classes = classMap({
          box: true,
          ['type-' + box.config.type!]: true,
          hl: isHighlighted,
          ...(edit
            ? {
                ghost: !!box.ghost,
                missing: !!box.missing,
                selected: edit.selectedNode === box.id,
                dragging: edit.draggingNode === box.id,
                'link-candidate': edit.linkCandidates.has(box.id),
                'link-hover': edit.linkHover === box.id,
                'link-dim': !!edit.linkSource && edit.linkSource !== box.id && !edit.linkCandidates.has(box.id),
              }
            : {}),
        });

        let title = formattedState + box.unit_of_measurement + ' ' + name;
        if (edit && box.missing) {
          title += ` (${edit.missingTitle})`;
        } else if (edit && box.ghost) {
          title += ` (${edit.hiddenTitle})`;
        }
        // just past the bar, so pressing the bar itself still moves the node
        const handleAcross = offset + box_thickness + HANDLE_OFFSET;
        const handle = edit && edit.canLink(box)
          ? props.vertical
            ? { x: box.top + box.size / 2, y: handleAcross }
            : { x: handleAcross, y: box.top + box.size / 2 }
          : undefined;

        return svg`
          <g
            class=${classes}
            @click=${edit ? nothing : () => props.onTap(box)}
            @dblclick=${edit ? nothing : () => props.onDoubleTap(box)}
            @pointerdown=${edit ? (ev: PointerEvent) => edit.onBoxPointerDown(ev, box) : nothing}
            @mouseenter=${() => props.onMouseEnter(box)}
            @mouseleave=${props.onMouseLeave}
          >
            <title>${title}</title>
            ${edit && edit.selectedNode === box.id
              ? svg`<rect class="selection-ring"
                  x="${colorRect.x - SELECTION_PADDING}" y="${colorRect.y - SELECTION_PADDING}"
                  width="${colorRect.width + 2 * SELECTION_PADDING}" height="${colorRect.height + 2 * SELECTION_PADDING}"
                  rx="3"></rect>`
              : nothing}
            <rect class="color-bar"
              x="${colorRect.x}" y="${colorRect.y}"
              width="${colorRect.width}" height="${colorRect.height}"
              fill="${box.color}" stroke=${edit && box.ghost ? box.color : nothing}></rect>
            ${show_icons && isNotPassthrough
              ? svg`
                <foreignObject
                  x="${colorRect.x}" y="${colorRect.y}"
                  width="${colorRect.width}" height="${colorRect.height}">
                  ${html`<div xmlns="${XHTML_NS}" class="icon-wrap">
                    <ha-icon .icon=${icon} style=${styleMap({ transform: 'scale(0.65)' })}></ha-icon>
                  </div>`}
                </foreignObject>
              `
              : null}
            <foreignObject
              x="${labelArea.x}" y="${labelArea.y}"
              width="${labelArea.width}" height="${labelArea.height}">
              ${html`<div xmlns="${XHTML_NS}" class="label-wrap">
                ${renderLabel(box, props.config, formattedState, name, spacerSize, props.vertical)}
              </div>`}
            </foreignObject>
            ${handle
              ? svg`<g class="link-handle"
                  @pointerdown=${(ev: PointerEvent) => edit!.onHandlePointerDown(ev, box)}>
                  <title>${edit!.linkHandleTitle}</title>
                  <circle class="hit" cx="${handle.x}" cy="${handle.y}" r="${HANDLE_OFFSET}"></circle>
                  <rect class="hit coarse"
                    x="${props.vertical ? handle.x - COARSE_HIT / 2 : handle.x - HANDLE_OFFSET}"
                    y="${props.vertical ? handle.y - HANDLE_OFFSET : handle.y - COARSE_HIT / 2}"
                    width="${COARSE_HIT}" height="${COARSE_HIT}"></rect>
                  <circle class="dot" cx="${handle.x}" cy="${handle.y}" r="5"></circle>
                </g>`
              : nothing}
          </g>
        `;
      })}
    </g>
  `;
}
