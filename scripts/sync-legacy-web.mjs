import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(process.env.CRATE_ENGINE_ROOT || path.join(scriptDir, '..'));
const legacyDir = path.join(rootDir, 'crate-engine/web');
const fromDist = process.argv.includes('--from-dist');
const sourceDir = fromDist ? path.join(rootDir, 'dist') : rootDir;
const fixedInclude = [
  '_headers',
  'asset-catalog.json',
  'asset-gallery.mjs',
  'city_assets.json',
  'compare.html',
  'creators.html',
  'demo.html',
  'docs',
  'favicon.svg',
  'features.html',
  'index.html',
  'marketplace.html',
  'model-aliases.json',
  'model-catalog.json',
  'model_catalog.json',
  'og-image.svg',
  'play.html',
  'pricing.html',
  'runtime',
  'service-worker.js'
];

const include = new Set(fixedInclude);
if (!fromDist) {
  for (const entry of await readdir(sourceDir)) {
    if (entry.endsWith('.mjs')) include.add(entry);
  }
}

await rm(legacyDir, { recursive: true, force: true });
await mkdir(legacyDir, { recursive: true });
for (const rel of include) {
  const src = path.join(sourceDir, rel);
  await stat(src);
  await cp(src, path.join(legacyDir, rel), { force: true, recursive: true });
}

console.log(`Synced ${include.size} entries from ${sourceDir} to ${legacyDir}`);
