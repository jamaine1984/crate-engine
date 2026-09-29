// Downloads the built-in surface textures (Poly Haven, CC0) into starter-library/surfaces/<surface>/.
// Run: node scripts/fetch-surface-textures.mjs   (re-run safe; skips files already present)
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { SURFACES } from '../engine/core/material.mjs';

const root = path.resolve(process.cwd(), 'starter-library', 'surfaces');
const MAPS = { Diffuse: 'color', nor_gl: 'normal', arm: 'arm' };
const manifest = { licence: 'CC0 1.0 (Poly Haven, https://polyhaven.com/license)', surfaces: {} };

for (const [surface, { polyhaven }] of Object.entries(SURFACES)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${polyhaven}`)).json();
  const dir = path.join(root, surface); await mkdir(dir, { recursive: true });
  manifest.surfaces[surface] = { source: `https://polyhaven.com/a/${polyhaven}`, files: {} };
  for (const [key, name] of Object.entries(MAPS)) {
    const entry = files[key]?.['1k']?.jpg;
    if (!entry) throw new Error(`${polyhaven} has no 1k ${key} jpg`);
    const out = path.join(dir, `${name}.jpg`);
    manifest.surfaces[surface].files[name] = `${name}.jpg`;
    try { await access(out); continue; } catch {}
    const bytes = new Uint8Array(await (await fetch(entry.url)).arrayBuffer());
    await writeFile(out, bytes);
    console.log(surface, name, Math.round(bytes.length / 1024) + ' KB');
  }
}
await writeFile(path.join(root, 'LICENSE.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('done');
