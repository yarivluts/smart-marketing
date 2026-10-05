// Bundles the SDK twice: an ES module for npm (bundlers tree-shake it) and a minified IIFE served as
// a plain <script> (window.GrowthOS). The touchpoint parsing is bundled from @growthos/shared's
// source, so neither build depends on an unpublished package at runtime.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const alias = { '@growthos/touchpoint-capture': fileURLToPath(new URL('../shared/src/touchpoint-capture/index.ts', import.meta.url)) };
const common = { bundle: true, target: ['es2018'], alias, legalComments: 'none', logLevel: 'warning' };

await build({ ...common, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/index.js' });
await build({ ...common, entryPoints: ['src/global.ts'], format: 'iife', minify: true, outfile: 'dist/growthos.js' });
