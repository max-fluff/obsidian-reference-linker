import { buildPlugin } from './src/shared/build.mjs';

let deployTargets = [];
try { ({ deployTargets = [] } = await import('./esbuild.local.mjs')); } catch { /* no local config */ }

await buildPlugin({
  name: 'Reference Linker',
  platform: 'node',
  external: ['obsidian', 'electron', 'fs', 'path', 'zlib', '@codemirror/view', '@codemirror/state', '@codemirror/language'],
  kind: 'sigil',
  prefix: 'reference-linker',
  deployTargets,
});
