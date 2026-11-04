import typescript from 'rollup-plugin-typescript2';
import commonjs from 'rollup-plugin-commonjs';
import nodeResolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';
import { terser } from 'rollup-plugin-terser';
import serve from 'rollup-plugin-serve';
import json from '@rollup/plugin-json';
import minifyHTML from 'rollup-plugin-minify-html-literals';
import { rmSync } from 'fs';
import { chunkPlugins, output, preserveEntrySignatures } from './rollup.shared.js';

const dev = process.env.ROLLUP_WATCH;

const serveopts = {
  contentBase: ['./dist'],
  host: '0.0.0.0',
  port: 3000,
  allowCrossOrigin: true,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
};

const cleanDist = {
  name: 'clean-dist',
  buildStart: () => rmSync('dist', { recursive: true, force: true }),
};

const plugins = [
  !dev && cleanDist,
  nodeResolve({}),
  commonjs(),
  typescript(),
  json({
    compact: true,
  }),
  babel({
    exclude: 'node_modules/**',
  }),
  dev && serve(serveopts),
  !dev && minifyHTML(),
  !dev && terser({ output: { comments: false } }),
  ...chunkPlugins(),
];

export default [
  {
    input: 'src/ha-sankey-chart.ts',
    preserveEntrySignatures,
    output,
    plugins: [...plugins],
  },
];
