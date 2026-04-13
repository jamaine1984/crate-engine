import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = '/Users/jamainemartin/Desktop/crate-engine';
const legacyDir = path.join(rootDir, 'crate-engine/web');
const sourceDir = process.argv.includes('--from-dist') ? path.join(rootDir, 'dist') : rootDir;
const include = [
  '_headers',
  'actions.mjs',
  'ai-agent.mjs',
  'asset-catalog.json',
  'asset-gallery.mjs',
  'auth.mjs',
  'character.mjs',
  'collision.mjs',
  'compare.html',
  'creators.html',
  'demo.html',
  'engine.mjs',
  'favicon.svg',
  'features.html',
  'gen_npcs.mjs',
  'godmode.mjs',
  'index.html',
  'interpreter.mjs',
  'llm-interpreter.mjs',
  'local-ai-tools.mjs',
  'marketplace.html',
  'mobile.mjs',
  'model-catalog.json',
  'multiplayer-colyseus.mjs',
  'navmesh.mjs',
  'physics.mjs',
  'play.html',
  'pricing.html',
  'runtime',
  'savesystem.mjs',
  'sound.mjs',
  'speech-tts.mjs',
  'voice-commands.mjs',
  'weather.mjs',
  'debug-tools.mjs'
];

await rm(legacyDir, { recursive: true, force: true });
await mkdir(legacyDir, { recursive: true });
for (const rel of include) {
  await cp(path.join(sourceDir, rel), path.join(legacyDir, rel), { force: true, recursive: true });
}
await mkdir(path.join(legacyDir, 'docs'), { recursive: true });
await cp(path.join(rootDir, 'docs/index.html'), path.join(legacyDir, 'docs/index.html'), { force: true });
console.log(`Synced ${include.length} entries from ${sourceDir} to ${legacyDir}`);
