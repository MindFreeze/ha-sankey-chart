import { MIN_HORIZONTAL_SECTION_W } from './const';
import { Config } from './types';

export function shouldBeVertical(config: Config, width: number) {
  if (config.layout === 'auto') {
    const minWidth = config.sections.reduce((acc, section) => {
      const width = section.min_width ?? MIN_HORIZONTAL_SECTION_W;
      return width + acc;
    }, 0);
    return width < minWidth;
  }
  return config.layout === 'vertical';
}
