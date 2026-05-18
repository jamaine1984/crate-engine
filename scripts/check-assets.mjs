import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(process.env.CRATE_ENGINE_ROOT || path.join(scriptDir, '..'));
const defaultModelRoot = path.resolve(process.env.CRATE_MODELS_DIR || path.join(rootDir, 'models'));
const defaultAssetBaseUrl = 'https://crateship-games-assets.pages.dev';
const explicitModelRoot = Boolean(process.env.CRATE_MODELS_DIR);
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

function normalizeAssetBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveRemoteAssetPath(ref) {
  const raw = String(ref || '').trim();
  if (!raw || /^(?:data|blob|javascript):/i.test(raw)) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).pathname;
    } catch {
      return '';
    }
  }
  const cleaned = raw.split('#')[0].split('?')[0].replace(/^\.?\//, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('/')) return cleaned;
  if (/^(models|textures)\//i.test(cleaned)) return '/' + cleaned;
  return '/models/' + cleanAssetPath(cleaned);
}

function remoteAssetUrl(assetBaseUrl, ref) {
  const assetPath = resolveRemoteAssetPath(ref);
  if (!assetPath) return '';
  return new URL(assetPath, `${assetBaseUrl}/`).href;
}

async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || 15000);
  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
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

async function collectCatalogRefSet(projectRoot, files, counts) {
  const foundRefs = new Set();

  for (const file of files) {
    const fullPath = path.join(projectRoot, file);
    const info = await stat(fullPath).catch(() => null);
    if (!info?.isFile()) continue;

    const data = await readJson(fullPath);
    const refs = [...new Set(collectCatalogModelRefs(data, file).map(normalizeModelRef).filter(Boolean))];
    counts.catalogRefs += refs.length;
    for (const ref of refs) foundRefs.add(ref);
  }

  return foundRefs;
}

async function mapLimit(items, limit, task) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await task(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function checkRemoteAsset(assetBaseUrl, ref) {
  const url = remoteAssetUrl(assetBaseUrl, ref);
  if (!url) return { ok: false, ref, url, status: 0, contentType: '', detail: 'Invalid asset reference' };

  let response = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' }).catch((err) => ({ error: err }));
  if (response?.error || response.status === 405) {
    response = await fetchWithTimeout(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-0' },
    }).catch((err) => ({ error: err }));
  }

  if (response?.error) {
    return { ok: false, ref, url, status: 0, contentType: '', detail: response.error.message || String(response.error) };
  }

  const contentType = response.headers.get('content-type') || '';
  return {
    ok: response.status >= 200 && response.status < 400,
    ref,
    url,
    status: response.status,
    contentType,
    detail: response.status >= 400 ? `HTTP ${response.status}` : '',
  };
}

async function checkRemoteAssetHost(options) {
  const assetBaseUrl = normalizeAssetBaseUrl(options.assetBaseUrl || process.env.CRATE_ASSET_BASE_URL || defaultAssetBaseUrl);
  const projectRoot = path.resolve(options.projectRoot || rootDir);
  const optionalCatalogMode = options.optionalCatalogMode || process.env.CRATE_ASSET_CHECK_CATALOGS || 'off';
  const strictOptionalCatalogs = optionalCatalogMode === 'strict';
  const warnOptionalCatalogs = optionalCatalogMode === 'warn' || strictOptionalCatalogs;
  const failures = [];
  const counts = {
    remoteAssets: 0,
    catalogRefs: 0,
    optionalMissing: [],
  };

  const manifestUrl = new URL('/asset-manifest.json', `${assetBaseUrl}/`).href;
  const manifestResponse = await fetchWithTimeout(manifestUrl, { redirect: 'follow' });
  if (!manifestResponse.ok) {
    throw new Error(`${manifestUrl} expected HTTP 200, got ${manifestResponse.status}`);
  }
  const manifest = await manifestResponse.json();
  if (manifest?.name !== 'crateship-games-assets') {
    failures.push({ type: 'manifest', source: manifestUrl, detail: `Unexpected name ${manifest?.name || 'missing'}` });
  }
  if (!manifest.version) failures.push({ type: 'manifest', source: manifestUrl, detail: 'Missing version' });
  if (!manifest.paths?.models || !manifest.paths?.textures) {
    failures.push({ type: 'manifest', source: manifestUrl, detail: 'Missing model/texture paths' });
  }

  const requiredRefs = new Set(defaultRequiredRefs.map(normalizeModelRef));
  const catalogRefs = await collectCatalogRefSet(projectRoot, catalogFiles, counts);
  for (const ref of catalogRefs) requiredRefs.add(ref);
  for (const ref of manifest.criticalAssets || []) requiredRefs.add(resolveRemoteAssetPath(ref));

  if (warnOptionalCatalogs) {
    const optionalCounts = { catalogRefs: 0 };
    const optionalRefs = await collectCatalogRefSet(projectRoot, optionalCatalogFiles, optionalCounts);
    const optionalResults = await mapLimit([...optionalRefs], 12, (ref) => checkRemoteAsset(assetBaseUrl, ref));
    const missing = optionalResults.filter((result) => !result.ok).map((result) => ({ type: 'catalog', source: 'optional', missing: result.ref, detail: result.detail || `HTTP ${result.status}` }));
    counts.optionalMissing.push(...missing);
    if (strictOptionalCatalogs) failures.push(...missing);
  }

  if (manifest.integrity?.catalogReferences && counts.catalogRefs && manifest.integrity.catalogReferences < counts.catalogRefs) {
    failures.push({
      type: 'manifest',
      source: manifestUrl,
      detail: `Manifest catalogReferences ${manifest.integrity.catalogReferences} is lower than local required refs ${counts.catalogRefs}`,
    });
  }

  const refs = [...requiredRefs].filter(Boolean);
  const results = await mapLimit(refs, 12, (ref) => checkRemoteAsset(assetBaseUrl, ref));
  counts.remoteAssets = results.length;
  failures.push(...results.filter((result) => !result.ok).map((result) => ({
    type: 'remote',
    source: result.ref,
    missing: result.url,
    detail: result.detail || `HTTP ${result.status}`,
  })));

  if (counts.optionalMissing.length && warnOptionalCatalogs && !strictOptionalCatalogs) {
    const sample = counts.optionalMissing.slice(0, 8).map((item) => `${item.source}: ${item.missing}`);
    console.warn(`[assets] Optional remote catalog references missing: ${counts.optionalMissing.length}`);
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
      `Remote asset host check failed with ${failures.length} blocking issue(s).`,
      ...sample.map((line) => `  - ${line}`),
      failures.length > sample.length ? `  ... ${failures.length - sample.length} more` : '',
    ].filter(Boolean).join('\n'));
  }

  console.log([
    `Remote asset host check passed.`,
    `Host: ${assetBaseUrl}.`,
    `Manifest: ${manifest.version}.`,
    `Checked remote assets: ${counts.remoteAssets}.`,
    `Catalog references: ${counts.catalogRefs}.`,
  ].join(' '));

  return { ...counts, manifest };
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

  const modelRootInfo = await stat(modelRoot).catch(() => null);
  const assetBaseUrl = normalizeAssetBaseUrl(options.assetBaseUrl || process.env.CRATE_ASSET_BASE_URL || '');
  const remoteRequested = options.remote === true || process.env.CRATE_ASSET_CHECK_REMOTE === 'true' || Boolean(assetBaseUrl);
  const hasExplicitModelRoot = explicitModelRoot || Boolean(options.modelRoot);
  if (remoteRequested || !modelRootInfo?.isDirectory()) {
    if (!modelRootInfo?.isDirectory() && hasExplicitModelRoot && !remoteRequested) {
      throw new Error(`Model root is not a directory: ${modelRoot}`);
    }
    return checkRemoteAssetHost({
      ...options,
      assetBaseUrl: assetBaseUrl || defaultAssetBaseUrl,
      projectRoot,
      optionalCatalogMode,
    });
  }

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
