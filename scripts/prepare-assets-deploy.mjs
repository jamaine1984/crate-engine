import { cp, mkdir, rm, symlink, lstat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAssets } from './check-assets.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(process.env.CRATE_ENGINE_ROOT || path.join(scriptDir, '..'));
const deployDir = path.resolve(process.env.CRATE_ASSETS_DEPLOY_DIR || path.join(rootDir, '.deploy-assets'));
const modelsTarget = path.resolve(process.env.CRATE_MODELS_DIR || path.join(rootDir, 'models'));
const texturesTarget = path.resolve(process.env.CRATE_TEXTURES_DIR || path.join(modelsTarget, 'textures'));
const copyAssets = process.env.CRATE_DEPLOY_COPY_ASSETS === 'true';
const linkType = process.platform === 'win32' ? 'junction' : 'dir';
const skipAssetCheck = process.env.CRATE_SKIP_ASSET_CHECK === 'true';
const assetBaseUrl = (process.env.CRATE_ASSET_BASE_URL || 'https://crateship-games-assets.pages.dev').replace(/\/+$/, '');

function getGitCommit() {
  const result = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function publishDirectory(source, targetName) {
  const stat = await lstat(source);
  if (!stat.isDirectory() && !stat.isSymbolicLink()) {
    throw new Error(`${targetName} source is not a directory or symlink: ${source}`);
  }

  const target = path.join(deployDir, targetName);
  if (copyAssets) {
    await cp(source, target, { recursive: true, force: true });
    console.log(`Copied ${targetName} -> ${source}`);
  } else {
    await symlink(source, target, linkType);
    console.log(`Linked ${targetName} -> ${source}`);
  }
}

await rm(deployDir, { recursive: true, force: true });
await mkdir(deployDir, { recursive: true });

let assetCheckCounts = null;
if (!skipAssetCheck) {
  assetCheckCounts = await checkAssets({ modelRoot: modelsTarget, projectRoot: rootDir });
} else {
  console.warn('Skipping asset-host integrity check because CRATE_SKIP_ASSET_CHECK=true.');
}

const sourceCommit = getGitCommit();
const assetPackVersion = process.env.CRATE_ASSET_PACK_VERSION || sourceCommit || 'local';

await writeFile(path.join(deployDir, 'index.html'), [
  '<!doctype html>',
  '<meta charset="utf-8">',
  '<title>CrateShip Asset Host</title>',
  '<h1>CrateShip Asset Host</h1>',
  '<p>This deployment serves shared GLB models and texture assets.</p>',
  '',
].join('\n'));

await writeFile(path.join(deployDir, '404.html'), [
  '<!doctype html>',
  '<meta charset="utf-8">',
  '<title>CrateShip asset not found</title>',
  '<h1>Asset not found</h1>',
  '<p>The requested CrateShip model or texture does not exist on this asset host.</p>',
  '',
].join('\n'));

await writeFile(path.join(deployDir, 'asset-manifest.json'), JSON.stringify({
  name: 'crateship-games-assets',
  version: assetPackVersion,
  sourceCommit,
  generatedAt: new Date().toISOString(),
  assetBaseUrl,
  paths: {
    models: '/models/',
    textures: '/textures/',
  },
  integrity: assetCheckCounts ? {
    checkedModels: assetCheckCounts.modelFiles,
    externalDependencies: assetCheckCounts.externalDeps,
    catalogReferences: assetCheckCounts.catalogRefs,
  } : null,
  criticalAssets: [
    '/models/kenney_cars/sedan.glb',
    '/models/fab/street_props_streeprops.glb',
    '/models/modular_street_seating.bin',
    '/textures/modular_street_seating_armrests_diff_1k.jpg',
  ],
}, null, 2) + '\n');

await writeFile(path.join(deployDir, '_headers'), [
  '/asset-manifest.json',
  '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
  '  Access-Control-Allow-Origin: *',
  '  Cross-Origin-Resource-Policy: cross-origin',
  '/models/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '  Access-Control-Allow-Origin: *',
  '  Cross-Origin-Resource-Policy: cross-origin',
  '/textures/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '  Access-Control-Allow-Origin: *',
  '  Cross-Origin-Resource-Policy: cross-origin',
  '',
].join('\n'));

try {
  await publishDirectory(modelsTarget, 'models');
} catch (err) {
  console.warn(`Models directory unavailable at ${modelsTarget}: ${err.message}`);
}

try {
  await publishDirectory(texturesTarget, 'textures');
} catch (err) {
  console.warn(`Textures directory unavailable at ${texturesTarget}: ${err.message}`);
}

console.log(`Prepared asset deploy directory at ${deployDir}`);
