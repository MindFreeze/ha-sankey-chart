import { html, svg, SVGTemplateResult } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { styleMap } from 'lit/directives/style-map';
import { Box, Config, ConnectionState, EntityConfigInternal, SectionState } from './types';
import { formatState, getChildConnections, getEntityId } from './utils';
import { FrontendLocaleData, stateIcon } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';
import { MIN_LABEL_HEIGHT } from './const';

export function renderBranchConnectors(props: {
  section: SectionState;
  nextSection?: SectionState;
  sectionIndex: number;
  connectionsByParent: Map<EntityConfigInternal, ConnectionState[]>;
  connectionsByChild: Map<EntityConfigInternal, ConnectionState[]>;
  allConnections: ConnectionState[];
  vertical: boolean;
}): SVGTemplateResult[] {
  const { boxes, size } = props.section;
  return boxes
    .filter(b => b.children.length > 0)
    .map((b, boxIndex) => {
      const children = props.nextSection!.boxes.filter(child =>
        b.children.some(c => getEntityId(c) === child.entity_id),
      );
      const connections = getChildConnections(b, children, props.allConnections, props.connectionsByParent).filter(
        c => {
          return c.state > 0;
        },
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
          let coords = [
            ['M', 0, c.startY],
            ['C', 50, c.startY],
            ['', 50, c.endY],
            ['', 100, c.endY],
            ['L', 100, c.endY + c.endSize],
            ['C', 50, c.endY + c.endSize],
            ['', 50, c.startY + c.startSize],
            ['', 0, c.startY + c.startSize],
          ];
          if (props.vertical) {
            coords = coords.map(c => [c[0], size - (c[2] as number), c[1]]);
          }
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
  connectionsByParent: Map<EntityConfigInternal, ConnectionState[]>;
  connectionsByChild: Map<EntityConfigInternal, ConnectionState[]>;
  allConnections: ConnectionState[];
  vertical: boolean;
  onTap: (config: Box) => void;
  onDoubleTap: (config: Box) => void;
  onMouseEnter: (config: Box) => void;
  onMouseLeave: () => void;
}) {
  const { show_names, show_icons, show_states, show_units } = props.config;
  const {
    boxes,
    spacerSize,
    config: { min_width },
    size,
  } = props.section;
  const hasChildren = props.nextSection && boxes.some(b => b.children.length > 0);

  const viewBox = props.vertical ? `0 0 ${size} 100` : `0 0 100 ${size}`;

  return html`
    <div class="section" style=${styleMap({ minWidth: min_width + 'px' })}>
      ${hasChildren
        ? html`<div class="connectors">
            <svg viewBox="${viewBox}" preserveAspectRatio="none">${renderBranchConnectors(props)}</svg>
          </div>`
        : null}
      ${boxes.map((box, i) => {
        const { entity, extraSpacers } = box;
        const formattedState = formatState(box.state, props.config.round, props.locale, props.config.monetary_unit);
        const isNotPassthrough = box.config.type !== 'passthrough';
        const name = box.config.name || entity.attributes.friendly_name || '';
        const icon = box.config.icon || stateIcon(entity as HassEntity);
        const maxLabelSize = box.size + spacerSize - 1;

        // reduce label size if it doesn't fit
        // @TODO handle vertical orientation and move this code to another function
        const labelStyle: Record<string, string> = { lineHeight: MIN_LABEL_HEIGHT + 'px' };
        const nameStyle: Record<string, string> = {};
        if (maxLabelSize < MIN_LABEL_HEIGHT) {
          const fontSize = maxLabelSize / MIN_LABEL_HEIGHT;
          // labelStyle.maxHeight = maxLabelSize + 'px';
          labelStyle.fontSize = `${fontSize}em`;
          labelStyle.lineHeight = `${fontSize}em`;
        }
        const numLines = name.split('\n').filter(v => v).length;
        if (numLines > 1) {
          nameStyle.whiteSpace = 'pre';
          if (labelStyle.fontSize) {
            nameStyle.fontSize = `${1 / numLines + 0.1}rem`;
            nameStyle.lineHeight = `${1 / numLines + 0.1}rem`;
          } else if (maxLabelSize < MIN_LABEL_HEIGHT * numLines) {
            nameStyle.fontSize = `${(maxLabelSize / MIN_LABEL_HEIGHT / numLines) * 1.1}em`;
            nameStyle.lineHeight = `${(maxLabelSize / MIN_LABEL_HEIGHT / numLines) * 1.1}em`;
          }
        }
        const shouldShowLabel = isNotPassthrough && (show_names || show_states);
        const sizeProp = props.vertical ? 'width' : 'height';

        return html`
          ${i > 0 ? html`<div class="spacerv" style=${styleMap({ [sizeProp]: spacerSize + 'px' })}></div>` : null}
          ${extraSpacers
            ? html`<div class="spacerv" style=${styleMap({ [sizeProp]: extraSpacers + 'px' })}></div>`
            : null}
          <div class=${'box type-' + box.config.type!} style=${styleMap({ [sizeProp]: box.size + 'px' })}>
            <div
              style=${styleMap({ backgroundColor: box.color })}
              @click=${() => props.onTap(box)}
              @dblclick=${() => props.onDoubleTap(box)}
              @mouseenter=${() => props.onMouseEnter(box)}
              @mouseleave=${props.onMouseLeave}
              title=${formattedState + box.unit_of_measurement + ' ' + name}
              class=${props.highlightedEntities.includes(box.config) ? 'hl' : ''}
            >
              ${show_icons && isNotPassthrough
                ? html`<ha-icon .icon=${icon} style=${styleMap({ transform: 'scale(0.65)' })}></ha-icon>`
                : null}
            </div>
            ${shouldShowLabel
              ? html`<div class="label" style=${styleMap(labelStyle)}>
                  ${show_states && isNotPassthrough
                    ? html`<span>
                        <span class="state">${formattedState}</span>${show_units
                          ? html`<span class="unit">${box.unit_of_measurement}</span>`
                          : null}
                      </span>`
                    : null}
                  ${show_names && isNotPassthrough
                    ? html`&nbsp;<span class="name" style=${styleMap(nameStyle)}>${name}</span>`
                    : null}
                </div>`
              : null}
          </div>
          ${extraSpacers ? html`<div class="spacerv" style=${styleMap({ height: extraSpacers + 'px' })}></div>` : null}
        `;
      })}
    </div>
  `;
}
