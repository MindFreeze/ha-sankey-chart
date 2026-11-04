import { checkBundle, ENTRY } from '../rollup.shared';

const CORE = 'ha-sankey-chart-core-0123abcd.js';
const EDITOR = 'ha-sankey-chart-editor-89ab4567.js';

type Chunk = { type: string; fileName: string; code: string; imports: string[]; dynamicImports: string[]; isEntry: boolean };

const chunk = (fileName: string, code: string, imports: string[] = [], dynamicImports: string[] = []): Chunk => ({
  type: 'chunk',
  fileName,
  code,
  imports,
  dynamicImports,
  isEntry: fileName === ENTRY,
});

const bundle = (...files: Chunk[]) =>
  files.reduce<Record<string, Chunk>>((all, file) => ({ ...all, [file.fileName]: file }), {});

const entry = () => chunk(ENTRY, `export{a as default}from"./${CORE}";`, [CORE]);
const core = (code = '') => chunk(CORE, `${code}import("./${EDITOR}")`, [], [EDITOR]);
const editor = () => chunk(EDITOR, `import{x}from"./${CORE}";customElements.define("sankey-chart-node-editor",x)`, [CORE]);

describe('checkBundle', () => {
  it('accepts a facade, a core chunk and a lazy editor chunk', () => {
    expect(checkBundle(bundle(entry(), core(), editor()))).toEqual([]);
  });

  it('rejects a chunk that imports the entry', () => {
    const bad = chunk(EDITOR, `import{x}from"./${ENTRY}"`, [ENTRY]);
    expect(checkBundle(bundle(entry(), core(), bad))).toEqual([expect.stringContaining('evaluate the card twice')]);
  });

  it('rejects an import of a missing file', () => {
    const bad = chunk(EDITOR, '', [CORE, 'ha-sankey-chart-core-ffffffff.js']);
    expect(checkBundle(bundle(entry(), core(), bad))).toEqual([expect.stringContaining('imports missing')]);
  });

  it('rejects chunk names without a hash', () => {
    const name = 'ha-sankey-chart-editor.js';
    const errors = checkBundle(bundle(entry(), chunk(CORE, `import("./${name}")`, [], [name]), chunk(name, '', [CORE])));
    expect(errors).toEqual([expect.stringContaining('unexpected file name')]);
  });

  it('rejects an editor chunk the entry loads eagerly', () => {
    const eager = chunk(CORE, '', [EDITOR]);
    expect(checkBundle(bundle(entry(), eager, editor()))).toEqual([expect.stringContaining('loaded eagerly')]);
  });

  it('rejects chunks nothing loads', () => {
    const stray = chunk('ha-sankey-chart-core-deadbeef.js', '');
    expect(checkBundle(bundle(entry(), core(), editor(), stray))).toEqual([expect.stringContaining('never loaded')]);
  });

  it('rejects assets such as source maps', () => {
    const map = { ...chunk(`${CORE}.map`, ''), type: 'asset' };
    expect(checkBundle(bundle(entry(), core(), editor(), map))).toEqual([expect.stringContaining('unexpected asset')]);
  });

  it('rejects an entry that is more than a facade', () => {
    const fat = chunk(ENTRY, `console.log(1);export{a as default}from"./${CORE}";`, [CORE]);
    expect(checkBundle(bundle(fat, core(), editor()))).toEqual([expect.stringContaining('only re-export')]);
  });

  it('rejects editor code in the core chunk', () => {
    const errors = checkBundle(bundle(entry(), core('"sankey-chart-node-editor";'), editor()));
    expect(errors).toEqual([expect.stringContaining('contains editor code')]);
  });

  it('rejects a core chunk over the size limit', () => {
    const errors = checkBundle(bundle(entry(), core(), editor()), { maxCoreBytes: 10 });
    expect(errors).toEqual([expect.stringContaining('over 10 B')]);
  });

  it('requires an editor chunk', () => {
    const errors = checkBundle(bundle(entry(), chunk(CORE, '')));
    expect(errors).toEqual(['no editor chunk']);
  });
});
