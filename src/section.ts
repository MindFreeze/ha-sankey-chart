import { LitElement, html, svg, SVGTemplateResult } from 'lit';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customElement, property } from 'lit/decorators';
import { styleMap } from 'lit/directives/style-map';
import { Box, Config, ConnectionState, EntityConfigInternal, SectionState } from './types';
import { formatState, getChildConnections } from './utils';
import { stateIcon } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';
import { MIN_LABEL_HEIGHT } from './const';

@customElement('sankey-chart-section')
class Section extends LitElement {
  @property({ attribute: false }) public config!: Config;
  @property({ attribute: false }) public section!: SectionState;
  @property({ attribute: false }) public nextSection?: SectionState;
  @property({ attribute: false }) public highlightedEntities!: EntityConfigInternal[];
  @property({ attribute: false }) public statePerPixelY!: number;
  @property({ attribute: false }) public connectionsByParent: Map<EntityConfigInternal, ConnectionState[]> = new Map();
  @property({ attribute: false }) public connectionsByChild: Map<EntityConfigInternal, ConnectionState[]> = new Map();
  @property({ attribute: false }) public onTap!: (config: Box) => void;
  @property({ attribute: false }) public onDoubleTap!: (config: Box) => void;
  @property({ attribute: false }) public onMouseEnter!: (config: Box) => void;
  @property({ attribute: false }) public onMouseLeave!: () => void;

  protected renderBranchConnectors(): SVGTemplateResult[] {
    const { boxes } = this.section;
    return boxes
      .filter(b => b.children.length > 0)
      .map(b => {
        const children = this.nextSection!.boxes.filter(child => b.children.includes(child.entity_id));
        const connections = getChildConnections(b, children, this.connectionsByParent.get(b.config)).filter((c, i) => {
          if (c.state > 0) {
            children[i].connections.parents.push(c);
            if (children[i].config.type === 'passthrough') {
              // @FIXME not sure if this is needed anymore after v1.0.0
              const sumState =
                this.connectionsByChild.get(children[i].config)?.reduce((sum, conn) => sum + conn.state, 0) || 0;
              if (sumState !== children[i].state) {
                // virtual entity that must only pass state to the next section
                children[i].state = sumState;
                // this could reduce the size of the box moving lower boxes up
                // so we have to add spacers and adjust some positions
                const newSize = Math.floor(sumState / this.statePerPixelY);
                children[i].extraSpacers = (children[i].size - newSize) / 2;
                c.endY += children[i].extraSpacers!;
                children[i].top += children[i].extraSpacers!;
                children[i].size = newSize;
              }
            }
            return true;
          }
          return false;
        });
        return svg`
          <defs>
            ${connections.map(
              (c, i) => svg`
              <linearGradient id="gradient${b.entity_id + i}">
                <stop offset="0%" stop-color="${c.startColor}"></stop>
                <stop offset="100%" stop-color="${c.endColor}"></stop>
              </linearGradient>
            `,
            )}
          </defs>
          ${connections.map(
            (c, i) => svg`
            <path d="M0,${c.startY} C50,${c.startY} 50,${c.endY} 100,${c.endY} L100,${c.endY + c.endSize} C50,${
              c.endY + c.endSize
            } 50,${c.startY + c.startSize} 0,${c.startY + c.startSize} Z"
              fill="url(#gradient${b.entity_id + i})" fill-opacity="${c.highlighted ? 0.85 : 0.4}" />
          `,
          )}
        `;
      });
  }

  public render() {
    const { show_names, show_icons, show_states, show_units } = this.config;
    const {
      boxes,
      spacerH,
      config: { min_width: minWidth },
    } = this.section;
    const hasChildren = this.nextSection && boxes.some(b => b.children.length > 0);

    return html`
      <div class="section" style=${styleMap({ minWidth })}>
        ${hasChildren
          ? html`<div class="connectors">
              <svg viewBox="0 0 100 ${this.config.height}" preserveAspectRatio="none">
                ${this.renderBranchConnectors()}
              </svg>
            </div>`
          : null}
        ${boxes.map((box, i) => {
          const { entity, extraSpacers } = box;
          const formattedState = formatState(box.state, this.config.round);
          const isNotPassthrough = box.config.type !== 'passthrough';
          const name = box.config.name || entity.attributes.friendly_name || '';
          const icon = box.config.icon || stateIcon(entity as HassEntity);
          const maxLabelH = box.size + spacerH - 1;

          // reduce label size if it doesn't fit
          const labelStyle: Record<string, string> = { lineHeight: MIN_LABEL_HEIGHT + 'px' };
          const nameStyle: Record<string, string> = {};
          if (maxLabelH < MIN_LABEL_HEIGHT) {
            const fontSize = maxLabelH / MIN_LABEL_HEIGHT;
            // labelStyle.maxHeight = maxLabelH + 'px';
            labelStyle.fontSize = `${fontSize}em`;
            labelStyle.lineHeight = `${fontSize}em`;
          }
          const numLines = name.split('\n').filter(v => v).length;
          if (numLines > 1) {
            nameStyle.whiteSpace = 'pre';
            if (labelStyle.fontSize) {
              nameStyle.fontSize = `${1 / numLines + 0.1}rem`;
              nameStyle.lineHeight = `${1 / numLines + 0.1}rem`;
            } else if (maxLabelH < MIN_LABEL_HEIGHT * numLines) {
              nameStyle.fontSize = `${(maxLabelH / MIN_LABEL_HEIGHT / numLines) * 1.1}em`;
              nameStyle.lineHeight = `${(maxLabelH / MIN_LABEL_HEIGHT / numLines) * 1.1}em`;
            }
          }

          return html`
            ${i > 0 ? html`<div class="spacerv" style=${styleMap({ height: spacerH + 'px' })}></div>` : null}
            ${extraSpacers
              ? html`<div class="spacerv" style=${styleMap({ height: extraSpacers + 'px' })}></div>`
              : null}
            <div class=${'box type-' + box.config.type!} style=${styleMap({ height: box.size + 'px' })}>
              <div
                style=${styleMap({ backgroundColor: box.color })}
                @click=${() => this.onTap(box)}
                @dblclick=${() => this.onDoubleTap(box)}
                @mouseenter=${() => this.onMouseEnter(box)}
                @mouseleave=${this.onMouseLeave}
                title=${formattedState + box.unit_of_measurement + ' ' + name}
                class=${this.highlightedEntities.includes(box.config) ? 'hl' : ''}
              >
                ${show_icons && isNotPassthrough
                  ? html`<ha-icon .icon=${icon} style=${styleMap({ transform: 'scale(0.65)' })}></ha-icon>`
                  : null}
              </div>
              <div class="label" style=${styleMap(labelStyle)}>
                ${show_states && isNotPassthrough
                  ? html`<span class="state">${formattedState}</span>${show_units
                        ? html`<span class="unit">${box.unit_of_measurement}</span>`
                        : null}`
                  : null}
                ${show_names && isNotPassthrough
                  ? html`&nbsp;<span class="name" style=${styleMap(nameStyle)}>${name}</span>`
                  : null}
              </div>
            </div>
            ${extraSpacers
              ? html`<div class="spacerv" style=${styleMap({ height: extraSpacers + 'px' })}></div>`
              : null}
          `;
        })}
      </div>
    `;
  }
}

export default Section;
