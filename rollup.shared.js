import { gzipSync } from 'zlib';
import { version } from './package.json';

export const ENTRY = 'ha-sankey-chart.js';
const CHUNK_NAME = /^ha-sankey-chart-(core|editor)-[0-9a-f]{8}\.js$/;
const FACADE = /^export\s*\{[^}]*\}\s*from\s*["']\.\/ha-sankey-chart-core-[0-9a-f]{8}\.js["'];?\s*$/;

// Strings that only exist in editor code. Finding one in core means a static import pulled editor code in.
export const EDITOR_MARKERS = ['sankey-chart-node-editor'];
export const MAX_CORE_BYTES = 135000;

// HACS and HA add ?hacstag= / ?v= to the entry URL only, so chunks must import the hashed core chunk,
// never ha-sankey-chart.js, or the card is evaluated twice.
export const preserveEntrySignatures = 'strict';

export const output = {
  dir: 'dist',
  format: 'es',
  entryFileNames: '[name].js',
  chunkFileNames: ({ isDynamicEntry }) => `ha-sankey-chart-${isDynamicEntry ? 'editor' : 'core'}-[hash].js`,
  sourcemap: false,
};

export function checkBundle(bundle, { markers = EDITOR_MARKERS, maxCoreBytes = MAX_CORE_BYTES } = {}) {
  const errors = [];
  const files = Object.values(bundle);
  const chunks = new Map(files.filter(f => f.type === 'chunk').map(f => [f.fileName, f]));
  const isEditor = name => /^ha-sankey-chart-editor\b/.test(name);
  const isCore = name => /^ha-sankey-chart-core\b/.test(name);

  files.forEach(f => {
    if (f.type !== 'chunk') errors.push(`${f.fileName}: unexpected asset`);
    else if (f.isEntry ? f.fileName !== ENTRY : !CHUNK_NAME.test(f.fileName))
      errors.push(`${f.fileName}: unexpected file name`);
  });

  const entry = chunks.get(ENTRY);
  if (!entry) return [...errors, `${ENTRY} is missing`];
  if (!FACADE.test(entry.code)) errors.push(`${ENTRY} must only re-export the core chunk`);

  chunks.forEach(chunk => {
    [...chunk.imports, ...chunk.dynamicImports].forEach(target => {
      if (target === ENTRY) errors.push(`${chunk.fileName} imports ${ENTRY}, which would evaluate the card twice`);
      else if (!chunks.has(target)) errors.push(`${chunk.fileName} imports missing ${target}`);
    });
  });

  const eager = new Set();
  const visit = name => {
    if (eager.has(name) || !chunks.has(name)) return;
    eager.add(name);
    chunks.get(name).imports.forEach(visit);
  };
  visit(ENTRY);
  eager.forEach(name => isEditor(name) && errors.push(`${name} is loaded eagerly`));

  const reachable = new Set(eager);
  const visitAll = name => {
    if (!chunks.has(name)) return;
    const chunk = chunks.get(name);
    [...chunk.imports, ...chunk.dynamicImports].forEach(target => {
      if (reachable.has(target)) return;
      reachable.add(target);
      visitAll(target);
    });
  };
  eager.forEach(visitAll);
  chunks.forEach((_, name) => reachable.has(name) || errors.push(`${name} is never loaded`));
  if (![...chunks.keys()].some(isEditor)) errors.push('no editor chunk');

  chunks.forEach((chunk, name) => {
    if (!isCore(name)) return;
    markers.forEach(marker => chunk.code.includes(marker) && errors.push(`${name} contains editor code (${marker})`));
    const size = Buffer.byteLength(chunk.code);
    if (size > maxCoreBytes) errors.push(`${name} is ${size} B, over ${maxCoreBytes} B`);
  });

  return errors;
}

export const chunkPlugins = () => [
  {
    name: 'version-hash',
    augmentChunkHash: () => version,
  },
  {
    name: 'check-chunks',
    generateBundle(_options, bundle) {
      Object.values(bundle).forEach(f => {
        const code = f.type === 'chunk' ? f.code : f.source;
        console.log(`${f.fileName}: ${Buffer.byteLength(code)} B, ${gzipSync(code).length} B gzip`);
      });
      const errors = checkBundle(bundle);
      if (errors.length) this.error(errors.join('\n'));
    },
  },
];
