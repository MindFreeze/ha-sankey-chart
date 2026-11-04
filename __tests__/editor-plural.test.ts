import { trCount } from '../src/editor/helpers';

const mockCzech: Record<string, string> = {
  'editor.node_count_one': '1 uzel',
  'editor.node_count_few': '{count} uzly',
  'editor.node_count_other': '{count} uzlů',
};

jest.mock('../src/localize/localize', () => ({
  localize: (key: string) => mockCzech[key],
  registerTranslations: () => undefined,
}));

describe('trCount with a translation of its own', () => {
  beforeEach(() => localStorage.setItem('selectedLanguage', '"cs"'));
  afterEach(() => localStorage.removeItem('selectedLanguage'));

  it('uses the plural forms of the language', () => {
    expect(trCount('editor.node_count', 1)).toBe('1 uzel');
    expect(trCount('editor.node_count', 3)).toBe('3 uzly');
    expect(trCount('editor.node_count', 5)).toBe('5 uzlů');
  });
});
