import { html, svg, SVGTemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map';
import { styleMap } from 'lit/directives/style-map';
import { Box, Config, ConnectionState, EntityConfigInternal, SectionState } from './types';
import { formatState, getBoxName, getChildConnections, getEntityId, normalizeStateValue } from './utils';
import { FrontendLocaleData, stateIcon } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';
import { renderLabel } from './label';
import { BOX_COLOR_BAR } from './const';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

export function renderBranchConnectors(props: {
  section: SectionState;
  nextSection?: SectionState;
  sectionIndex: number;
  allConnections: ConnectionState[];
  vertical: boolean;
}): SVGTemplateResult[] {
  const { boxes, size, offset } = props.section;
  const nearEdge = BOX_COLOR_BAR + offset;
  const farEdge = size + offset;
  const midEdge = (nearEdge + farEdge) / 2;
  return boxes
    .filter(b => b.children.length > 0)
    .map((b, boxIndex) => {
      const children = props.nextSection!.boxes.filter(child =>
        b.children.some(c => getEntityId(c) === child.id),
      );
      const connections = getChildConnections(b, children, props.allConnections).filter(
        c => c.state > 0,
      );
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
          return svg`
              <path d="${coords.map(([cmd, x, y]) => `${cmd}${x},${y}`).join(' ')} Z"
                fill="url(#gradient${props.sectionIndex}.${boxIndex}.${i})" fill-opacity="${
            c.highlighted ? 0.85 : 0.4
          }" />
            `;
        })}
      `;
    });
}

export function renderSection(props: {
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
}) {
  const { show_icons } = props.config;
  const { boxes, spacerSize, offset, size } = props.section;
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
        const name = getBoxName(box);
        const icon = box.config.icon || stateIcon(entity as HassEntity);
        const isHighlighted = props.highlightedEntities.includes(box.config);

        const colorRect = props.vertical
          ? { x: box.top, y: offset, width: box.size, height: BOX_COLOR_BAR }
          : { x: offset, y: box.top, width: BOX_COLOR_BAR, height: box.size };
        const labelArea = props.vertical
          ? { x: box.top, y: offset + BOX_COLOR_BAR, width: box.size, height: size - BOX_COLOR_BAR }
          : { x: offset + BOX_COLOR_BAR, y: box.top, width: size - BOX_COLOR_BAR, height: box.size };

        const classes = classMap({
          box: true,
          ['type-' + box.config.type!]: true,
          hl: isHighlighted,
        });

        return svg`
          <g
            class=${classes}
            @click=${() => props.onTap(box)}
            @dblclick=${() => props.onDoubleTap(box)}
            @mouseenter=${() => props.onMouseEnter(box)}
            @mouseleave=${props.onMouseLeave}
          >
            <title>${formattedState + box.unit_of_measurement + ' ' + name}</title>
            <rect class="color-bar"
              x="${colorRect.x}" y="${colorRect.y}"
              width="${colorRect.width}" height="${colorRect.height}"
              fill="${box.color}"></rect>
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
          </g>
        `;
      })}
    </g>
  `;
}
