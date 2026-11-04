import resolve from "rollup-plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import babel from "rollup-plugin-babel";
import serve from "rollup-plugin-serve";
import { terser } from "rollup-plugin-terser";
import json from '@rollup/plugin-json';
import { chunkPlugins, output, preserveEntrySignatures } from "./rollup.shared.js";

export default {
  input: ["src/ha-sankey-chart.ts"],
  preserveEntrySignatures,
  output,
  plugins: [
    resolve(),
    typescript(),
    json(),
    babel({
      exclude: "node_modules/**",
    }),
    terser(),
    serve({
      contentBase: "./dist",
      host: "0.0.0.0",
      port: 3000,
      allowCrossOrigin: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }),
    ...chunkPlugins(),
  ],
};
