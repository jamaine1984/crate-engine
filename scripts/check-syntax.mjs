import { spawnSync } from 'node:child_process';

const files = [
  'engine.mjs',
  'character.mjs',
  'model-registry.mjs',
  'code-editor.mjs',
  'physics.mjs',
  'collision.mjs',
  'navmesh.mjs',
  'local-ai-tools.mjs',
  'speech-tts.mjs',
  'debug-tools.mjs',
  'multiplayer-colyseus.mjs',
  'worker/index.js'
];

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} files.`);
