import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(process.env.CRATE_ENGINE_ROOT || path.join(scriptDir, '..'));
const defaultModelRoot = path.resolve(process.env.CRATE_MODELS_DIR || path.join(rootDir, 'models'));
const externalUriPattern = /^(?:data|blob|https?:|\/\/)/i;
const modelExtensions = new Set(['.glb', '.gltf']);
const catalogFiles = ['city_assets.json'];
const optionalCatalogFiles = ['asset-catalog.json', 'model-catalog.json', 'model_catalog.json', 'model-aliases.json'];
const defaultRequiredRefs = [
  'kenney_cars/sedan.glb',
  'buildings_pack_3_6story_stack_mat.glb',
  'fab/street_props_streeprops.glb',
  'ph_modular_street_seating.glb',
  'ph_modular_electricity_poles.glb',
  'modular_street_seating.bin',
  'modular_electricity_poles.bin',
];

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function isExternalUri(uri) {
  return !uri || externalUriPattern.test(uri);
}

function cleanAssetPath(value) {
  let cleaned = toPosix(value).trim();
  if (!cleaned || isExternalUri(cleaned)) return '';
  cleaned = cleaned.split('#')[0].split('?')[0];
  cleaned = cleaned.replace(/^\.?\//, '');
  cleaned = cleaned.replace(/^models\//i, '');
  return cleaned;
}

function normalizeModelRef(value) {
  const cleaned = cleanAssetPath(value);
  if (!cleaned) return '';
  const ext = path.posix.extname(cleaned).toLowerCase();
  if (ext) return cleaned;
  return `${cleaned}.glb`;
}

async function assertDirectory(dir, label) {
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`${label} is not a directory: ${dir}`);
  }
}

async function existsCaseSensitive(root, relPath) {
  const parts = toPosix(relPath).split('/').filter(Boolean);
  let current = root;

  for (const part of parts) {
    const entries = await readdir(current).catch(() => null);
    if (!entries || !entries.includes(part)) return false;
    current = path.join(current, part);
  }

  const info = await stat(current).catch(() => null);
  return !!info?.isFile();
}

async function collectFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, files);
    } else if (entry.isFile() && modelExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseGltfJson(bytes, file) {
  if (bytes.subarray(0, 4).toString('ascii') === 'glTF') {
    const version = bytes.readUInt32LE(4);
    if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);

    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkLength = bytes.readUInt32LE(offset);
      const chunkType = bytes.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkLength;
      if (chunkEnd > bytes.length) throw new Error('GLB chunk extends past file end');
      if (chunkType === 0x4e4f534a) {
        return JSON.parse(bytes.subarray(chunkStart, chunkEnd).toString('utf8').trim());
      }
      offset = chunkEnd;
    }
    throw new Error('GLB JSON chunk not found');
  }

  const text = bytes.toString('utf8').trim();
  if (!text.startsWith('{')) throw new Error('Not a valid GLB or JSON glTF file');
  return JSON.parse(text);
}

function getExternalDependencies(gltf) {
  const deps = [];
  for (const buffer of gltf.buffers || []) {
    if (!isExternalUri(buffer.uri)) deps.push(buffer.uri);
  }
  for (const image of gltf.images || []) {
    if (!isExternalUri(image.uri)) deps.push(image.uri);
  }
  return [...new Set(deps.map(cleanAssetPath).filter(Boolean))];
}

function collectAllStrings(value, refs = []) {
  if (typeof value === 'string') {
    refs.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectAllStrings(item, refs);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectAllStrings(item, refs);
  }
  return refs;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function collectTargetedRefs(value, refs = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectTargetedRefs(item, refs);
    return refs;
  }

  if (!value || typeof value !== 'object') return refs;

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && /^(file|path|model|glb|m)$/i.test(key)) {
      refs.push(item);
    } else {
      collectTargetedRefs(item, refs);
    }
  }

  return refs;
}

function collectCatalogModelRefs(data, file) {
  if (file === 'city_assets.json') return collectAllStrings(data);
  if (file === 'model-aliases.json' && data && typeof data === 'object' && !Array.isArray(data)) {
    return Object.values(data).filter((value) => typeof value === 'string');
  }
  return collectTargetedRefs(data);
}

async function checkModelFile(modelRoot, fullPath, failures, counts) {
  const relModel = toPosix(path.relative(modelRoot, fullPath));
  let gltf;
  try {
    gltf = parseGltfJson(await readFile(fullPath), relModel);
  } catch (err) {
    failures.push({ type: 'parse', source: relModel, detail: err.message });
    return;
  }

  const deps = getExternalDependencies(gltf);
  counts.externalDeps += deps.length;
  for (const dep of deps) {
    const depFullPath = path.resolve(path.dirname(fullPath), dep);
    const depRel = toPosix(path.relative(modelRoot, depFullPath));
    if (depRel.startsWith('../') || path.isAbsolute(depRel)) {
      failures.push({ type: 'dependency', source: relModel, missing: dep, detail: 'Dependency escapes model root' });
      continue;
    }
    if (!(await existsCaseSensitive(modelRoot, depRel))) {
      failures.push({ type: 'dependency', source: relModel, missing: depRel });
    }
  }
}

async function checkCatalogRefs(modelRoot, projectRoot, files, failures, counts, required) {
  const foundRefs = new Set();

  for (const file of files) {
    const fullPath = path.join(projectRoot, file);
    const info = await stat(fullPath).catch(() => null);
    if (!info?.isFile()) continue;

    const data = await readJson(fullPath);
    const refs = [...new Set(collectCatalogModelRefs(data, file).map(normalizeModelRef).filter(Boolean))];
    counts.catalogRefs += refs.length;

    for (const ref of refs) {
      foundRefs.add(ref);
      if (!(await existsCaseSensitive(modelRoot, ref))) {
        const entry = { type: 'catalog', source: file, missing: ref };
        if (required) failures.push(entry);
        else counts.optionalMissing.push(entry);
      }
    }
  }

  return foundRefs;
}

export async function checkAssets(options = {}) {
  const modelRoot = path.resolve(options.modelRoot || defaultModelRoot);
  const projectRoot = path.resolve(options.projectRoot || rootDir);
  const optionalCatalogMode = options.optionalCatalogMode || process.env.CRATE_ASSET_CHECK_CATALOGS || 'off';
  const strictOptionalCatalogs = optionalCatalogMode === 'strict';
  const warnOptionalCatalogs = optionalCatalogMode === 'warn' || strictOptionalCatalogs;
  const checkAllModels = options.checkAllModels ?? process.env.CRATE_ASSET_CHECK_ALL_MODELS === 'true';
  const failures = [];
  const counts = {
    modelFiles: 0,
    externalDeps: 0,
    catalogRefs: 0,
    optionalMissing: [],
  };

  await assertDirectory(modelRoot, 'Model root');

  const requiredRefs = new Set(defaultRequiredRefs.map(normalizeModelRef));
  const catalogRefs = await checkCatalogRefs(modelRoot, projectRoot, catalogFiles, failures, counts, true);
  for (const ref of catalogRefs) requiredRefs.add(ref);
  if (warnOptionalCatalogs) {
    await checkCatalogRefs(modelRoot, projectRoot, optionalCatalogFiles, failures, counts, strictOptionalCatalogs);
  }

  const modelFiles = checkAllModels
    ? await collectFiles(modelRoot)
    : [...requiredRefs]
      .filter((ref) => modelExtensions.has(path.extname(ref).toLowerCase()))
      .map((ref) => path.join(modelRoot, ref));

  counts.modelFiles = modelFiles.length;
  for (const file of modelFiles) {
    const rel = toPosix(path.relative(modelRoot, file));
    if (rel.startsWith('../') || path.isAbsolute(rel)) {
      failures.push({ type: 'model', source: rel, detail: 'Model path escapes model root' });
      continue;
    }
    if (!(await existsCaseSensitive(modelRoot, rel))) {
      failures.push({ type: 'model', source: rel, detail: 'Required model is missing' });
      continue;
    }
    await checkModelFile(modelRoot, file, failures, counts);
  }

  if (counts.optionalMissing.length && warnOptionalCatalogs && !strictOptionalCatalogs) {
    const sample = counts.optionalMissing.slice(0, 8).map((item) => `${item.source}: ${item.missing}`);
    console.warn(`[assets] Optional catalog references missing: ${counts.optionalMissing.length}`);
    for (const item of sample) console.warn(`  - ${item}`);
    if (counts.optionalMissing.length > sample.length) {
      console.warn(`  ... ${counts.optionalMissing.length - sample.length} more`);
    }
  }

  if (failures.length) {
    const sample = failures.slice(0, 20).map((item) => {
      const detail = item.detail ? ` (${item.detail})` : '';
      return `${item.type}: ${item.source}${item.missing ? ` -> ${item.missing}` : ''}${detail}`;
    });
    throw new Error([
      `Asset check failed with ${failures.length} blocking issue(s).`,
      ...sample.map((line) => `  - ${line}`),
      failures.length > sample.length ? `  ... ${failures.length - sample.length} more` : '',
    ].filter(Boolean).join('\n'));
  }

  console.log([
    `Asset check passed.`,
    `Checked models: ${counts.modelFiles}${checkAllModels ? ' (all)' : ' (required)'}.`,
    `External dependencies: ${counts.externalDeps}.`,
    `Catalog references: ${counts.catalogRefs}.`,
  ].join(' '));

  return counts;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkAssets().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
