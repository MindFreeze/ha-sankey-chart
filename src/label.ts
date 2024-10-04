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

  const maxLabelSize = box.size + spacerSize - 1;

  // reduce label size if it doesn't fit
  const labelStyle: Record<string, string> = { lineHeight: MIN_LABEL_HEIGHT + 'px' };
  const nameStyle: Record<string, string> = {};
  if (vertical) {
    // count chars in the name and reduce font size if it doesn't fit maxLabelSize
    labelStyle.width = maxLabelSize + 'px';
    const stateChars = (formattedState + (show_units ? box.unit_of_measurement : '')).length;
    const desiredWidth = stateChars * CHAR_WIDTH_RATIO;
    if (desiredWidth > maxLabelSize) {
      const fontSize = maxLabelSize / desiredWidth;
      labelStyle.fontSize = `${fontSize}em`;
      labelStyle.lineHeight = `${fontSize}em`;
    }
    if (show_names) {
      const nameChars = Math.max(...name.split(/[\s]+/).map(l => l.length));
      const desiredNameWidth = nameChars * CHAR_WIDTH_RATIO;
      if (desiredNameWidth > maxLabelSize) {
        const fontSize = maxLabelSize / desiredNameWidth;
        nameStyle.fontSize = `${fontSize}rem`;
        nameStyle.lineHeight = `${fontSize}rem`;
      }
    }
  } else {
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
      ? html`${!vertical ? html`&nbsp;` : null}<span class="name" style=${styleMap(nameStyle)}>${(typeof box.config.url === 'undefined' || box.config.url === null) ? html`${name}` : html`<a href="${box.config.url}" target="_blank">${name}</a>`}</span>`
      : null}
  </div>`;
}
