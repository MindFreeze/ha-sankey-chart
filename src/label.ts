import { html } from 'lit';
import { Box, Config } from './types';
import { styleMap } from 'lit/directives/style-map';
import { CHAR_WIDTH_RATIO, MIN_LABEL_HEIGHT } from './const';

export function renderLabel(
  box: Box,
  config: Config,
  formattedState: string,
  name: string,
  spacerSize: number,
  vertical: boolean,
) {
  const { show_names, show_states, show_units } = config;
  const shouldShowLabel = box.config.type !== 'passthrough' && (show_names || show_states);
  if (!shouldShowLabel) return null;

  const maxLabelSize = box.size + spacerSize - 2;

  const labelStyle: Record<string, string> = { lineHeight: MIN_LABEL_HEIGHT + 'px' };
  const nameStyle: Record<string, string> = {};
  if (vertical) {
    // count chars in the name and reduce font size if it doesn't fit maxLabelSize
    labelStyle.width = maxLabelSize + 'px';
    const stateChars = (formattedState + (show_units ? box.unit_of_measurement : '')).length;
    const desiredWidth = stateChars * CHAR_WIDTH_RATIO;
    if (desiredWidth > maxLabelSize) {
      const fontSize = (maxLabelSize / desiredWidth) * MIN_LABEL_HEIGHT;
      labelStyle.fontSize = `${fontSize}px`;
      labelStyle.lineHeight = `${fontSize}px`;
    }
    if (show_names) {
      const nameChars = Math.max(...name.split(/[\s]+/).map(l => l.length));
      const desiredNameWidth = nameChars * CHAR_WIDTH_RATIO;
      if (desiredNameWidth > maxLabelSize) {
        const fontSize = (maxLabelSize / desiredNameWidth) * MIN_LABEL_HEIGHT;
        nameStyle.fontSize = `${fontSize}px`;
        nameStyle.lineHeight = `${fontSize}px`;
      }
    }
  } else {
    if (maxLabelSize < MIN_LABEL_HEIGHT) {
      labelStyle.fontSize = `${maxLabelSize}px`;
      labelStyle.lineHeight = `${maxLabelSize}px`;
    }
    const numLines = name.split('\n').filter(v => v).length;
    if (numLines > 1) {
      nameStyle.whiteSpace = 'pre';
      if (labelStyle.fontSize) {
        const baseLabelSize = maxLabelSize < MIN_LABEL_HEIGHT ? maxLabelSize : MIN_LABEL_HEIGHT;
        nameStyle.fontSize = `${baseLabelSize * (1 / numLines + 0.1)}px`;
        nameStyle.lineHeight = `${baseLabelSize * (1 / numLines + 0.1)}px`;
      } else if (maxLabelSize < MIN_LABEL_HEIGHT * numLines) {
        const fontSize = (maxLabelSize / numLines) * 1.1;
        nameStyle.fontSize = `${fontSize}px`;
        nameStyle.lineHeight = `${fontSize}px`;
      }
    }
  }
  return html`<div class="label" style=${styleMap(labelStyle)}>
    ${show_states
      ? html`<span>
          <span class="state">${formattedState}</span>${show_units
            ? html`<span class="unit">${box.unit_of_measurement}</span>`
            : null}
        </span>`
      : null}
    ${show_names
      ? html`${!vertical ? html`&nbsp;` : null}<span class="name" style=${styleMap(nameStyle)}>${name}</span>`
      : null}
  </div>`;
}
