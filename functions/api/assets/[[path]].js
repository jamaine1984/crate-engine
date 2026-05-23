const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_FILE_NAME_LENGTH = 180;
const MAX_SOURCE_LENGTH = 80;
const MAX_METRICS_LENGTH = 2000;
const MAX_INDEX_ROWS = 500;
const ASSET_PREFIX = 'user-assets';
const PUBLIC_ASSET_PREFIX = 'published-assets';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Crate-Owner-Token',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': init.cacheControl || 'no-store',
      ...corsHeaders(),
      ...(init.headers || {}),
    },
  });
}

function getBucket(env) {
  return env.CRATE_USER_ASSETS || env.CRATE_ASSETS || null;
}

function pathParts(params) {
  const value = params?.path;
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : String(value).split('/').filter(Boolean);
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanToken(value) {
  return String(value || '').trim().slice(0, 256);
}

function ownerTokenFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  return cleanToken(request.headers.get('x-crate-owner-token') || bearer);
}

async function hashToken(token) {
  const clean = cleanToken(token);
  if (!clean) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cleanId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function cleanFileName(value) {
  const fallback = 'model.glb';
  const cleaned = String(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_FILE_NAME_LENGTH);
  return cleaned || fallback;
}

function cleanExtension(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function cleanMetrics(value) {
  if (!value) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length > MAX_METRICS_LENGTH) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function indexKey(ownerHash) {
  return `${ASSET_PREFIX}/${ownerHash}/index.json`;
}

function objectKey(ownerHash, id, fileName) {
  return `${ASSET_PREFIX}/${ownerHash}/${id}/${cleanFileName(fileName)}`;
}

function publicMetadataKey(publicId) {
  return `${PUBLIC_ASSET_PREFIX}/${cleanId(publicId)}/asset.json`;
}

function publicObjectKey(publicId, fileName) {
  return `${PUBLIC_ASSET_PREFIX}/${cleanId(publicId)}/${cleanFileName(fileName)}`;
}

async function readJson(request) {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function readIndex(bucket, ownerHash) {
  const object = await bucket.get(indexKey(ownerHash));
  if (!object) return [];
  try {
    const parsed = JSON.parse(await object.text());
    return Array.isArray(parsed?.assets) ? parsed.assets.filter(Boolean).slice(0, MAX_INDEX_ROWS) : [];
  } catch {
    return [];
  }
}

async function writeIndex(bucket, ownerHash, assets) {
  const body = JSON.stringify({
    format: 'crate-user-asset-index',
    version: 1,
    updatedAt: new Date().toISOString(),
    assets: assets.slice(0, MAX_INDEX_ROWS),
  });
  await bucket.put(indexKey(ownerHash), body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

function publicAsset(record, request) {
  const origin = new URL(request.url).origin;
  const publicId = record.publicId || '';
  return {
    id: record.id,
    publicId,
    name: record.name,
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    contentType: record.contentType,
    extension: record.extension,
    metrics: record.metrics || null,
    source: record.source || 'user-import',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    downloadUrl: `${origin}/api/assets/${encodeURIComponent(record.id)}/download`,
    publicDownloadUrl: publicId ? `${origin}/api/assets/public/${encodeURIComponent(publicId)}/download` : '',
  };
}

function publicPublishedAsset(record, request) {
  const origin = new URL(request.url).origin;
  const publicId = record.publicId || record.id || '';
  return {
    id: publicId,
    publicId,
    sourceAssetId: record.sourceAssetId || '',
    gameSlug: record.gameSlug || '',
    name: record.name,
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    contentType: record.contentType,
    extension: record.extension,
    metrics: record.metrics || null,
    source: record.source || 'published-user-asset',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    downloadUrl: `${origin}/api/assets/public/${encodeURIComponent(publicId)}/download`,
    publicDownloadUrl: `${origin}/api/assets/public/${encodeURIComponent(publicId)}/download`,
  };
}

async function requireOwner(context) {
  const token = ownerTokenFromRequest(context.request);
  if (!token) return { ok: false, response: json({ ok: false, error: 'Owner token required.' }, { status: 403 }) };
  const ownerHash = await hashToken(token);
  return { ok: true, ownerHash };
}

function missingBucket() {
  return json({ ok: false, error: 'CRATE_USER_ASSETS R2 binding is not configured.' }, { status: 503 });
}

async function health(context) {
  return json({
    ok: true,
    binding: !!getBucket(context.env),
    maxAssetBytes: MAX_ASSET_BYTES,
    maxAssetMB: Math.round(MAX_ASSET_BYTES / (1024 * 1024)),
  });
}

async function listAssets(context) {
  const bucket = getBucket(context.env);
  if (!bucket) return missingBucket();
  const owner = await requireOwner(context);
  if (!owner.ok) return owner.response;
  const rows = await readIndex(bucket, owner.ownerHash);
  return json({
    ok: true,
    assets: rows
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .map((record) => publicAsset(record, context.request)),
  });
}

async function uploadAsset(context) {
  const bucket = getBucket(context.env);
  if (!bucket) return missingBucket();
  const owner = await requireOwner(context);
  if (!owner.ok) return owner.response;

  const form = await context.request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ ok: false, error: 'A GLB or GLTF file is required.' }, { status: 400 });
  }

  const fileName = cleanFileName(file.name || form.get('fileName') || 'model.glb');
  const extension = cleanExtension(fileName);
  if (!['glb', 'gltf'].includes(extension)) {
    return json({ ok: false, error: 'Only GLB and GLTF assets can be uploaded.' }, { status: 400 });
  }

  const sizeBytes = Number(file.size) || 0;
  if (sizeBytes <= 0) return json({ ok: false, error: 'Uploaded file is empty.' }, { status: 400 });
  if (sizeBytes > MAX_ASSET_BYTES) {
    return json({ ok: false, error: `Cloud asset uploads are limited to ${Math.round(MAX_ASSET_BYTES / (1024 * 1024))} MB.` }, { status: 413 });
  }

  const id = cleanId(form.get('id')) || `asset_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const key = objectKey(owner.ownerHash, id, fileName);
  const metrics = cleanMetrics(form.get('metrics'));
  const record = {
    id,
    key,
    name: cleanText(form.get('name') || fileName.replace(/\.(glb|gltf)$/i, '').replace(/[-_]+/g, ' '), MAX_NAME_LENGTH) || 'Imported model',
    fileName,
    sizeBytes,
    contentType: file.type || (extension === 'glb' ? 'model/gltf-binary' : 'model/gltf+json'),
    extension,
    metrics,
    source: cleanText(form.get('source') || 'user-import', MAX_SOURCE_LENGTH),
    createdAt: now,
    updatedAt: now,
  };

  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: record.contentType },
    customMetadata: {
      id: record.id,
      name: record.name,
      fileName: record.fileName,
      source: record.source,
      createdAt: record.createdAt,
    },
  });

  const rows = (await readIndex(bucket, owner.ownerHash)).filter((item) => item.id !== id);
  rows.unshift(record);
  await writeIndex(bucket, owner.ownerHash, rows);
  return json({ ok: true, asset: publicAsset(record, context.request) });
}

async function findAsset(context, id) {
  const bucket = getBucket(context.env);
  if (!bucket) return { response: missingBucket() };
  const owner = await requireOwner(context);
  if (!owner.ok) return { response: owner.response };
  const cleanAssetId = cleanId(id);
  const rows = await readIndex(bucket, owner.ownerHash);
  const record = rows.find((item) => item.id === cleanAssetId);
  if (!record) return { response: json({ ok: false, error: 'Asset not found.' }, { status: 404 }) };
  return { bucket, ownerHash: owner.ownerHash, rows, record };
}

async function assetDetails(context, id) {
  const found = await findAsset(context, id);
  if (found.response) return found.response;
  return json({ ok: true, asset: publicAsset(found.record, context.request) });
}

async function downloadAsset(context, id) {
  const found = await findAsset(context, id);
  if (found.response) return found.response;
  const object = await found.bucket.get(found.record.key);
  if (!object) return json({ ok: false, error: 'Asset data not found.' }, { status: 404 });
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': found.record.contentType || object.httpMetadata?.contentType || 'model/gltf-binary',
      'Content-Length': String(found.record.sizeBytes || object.size || ''),
      'Content-Disposition': `inline; filename="${cleanFileName(found.record.fileName || 'model.glb')}"`,
      'Cache-Control': 'private, max-age=60',
      ...corsHeaders(),
    },
  });
}

async function publishAsset(context, id) {
  const found = await findAsset(context, id);
  if (found.response) return found.response;
  const payload = await readJson(context.request);
  const gameSlug = cleanId(payload.gameSlug || 'game');
  const publicId = cleanId(payload.publicId || `${gameSlug || 'game'}-${found.record.id}`);
  if (!publicId) return json({ ok: false, error: 'Public asset id is required.' }, { status: 400 });
  const object = await found.bucket.get(found.record.key);
  if (!object) return json({ ok: false, error: 'Asset data not found.' }, { status: 404 });
  const now = new Date().toISOString();
  let existingPublicRecord = null;
  try {
    const existingMetadata = await found.bucket.get(publicMetadataKey(publicId));
    if (existingMetadata) existingPublicRecord = JSON.parse(await existingMetadata.text());
  } catch {}
  const publicRecord = {
    ...found.record,
    id: publicId,
    publicId,
    sourceAssetId: found.record.id,
    gameSlug,
    key: publicObjectKey(publicId, found.record.fileName || 'model.glb'),
    source: 'published-user-asset',
    createdAt: found.record.createdAt || now,
    updatedAt: now,
    publishedAt: now,
  };
  await found.bucket.put(publicRecord.key, await object.arrayBuffer(), {
    httpMetadata: { contentType: publicRecord.contentType || object.httpMetadata?.contentType || 'model/gltf-binary' },
    customMetadata: {
      publicId,
      sourceAssetId: found.record.id,
      gameSlug,
      fileName: publicRecord.fileName || 'model.glb',
      publishedAt: now,
    },
  });
  await found.bucket.put(publicMetadataKey(publicId), JSON.stringify(publicRecord), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  if (existingPublicRecord?.key && existingPublicRecord.key !== publicRecord.key) {
    await found.bucket.delete(existingPublicRecord.key);
  }
  return json({ ok: true, asset: publicPublishedAsset(publicRecord, context.request) });
}

async function findPublicAsset(context, publicId) {
  const bucket = getBucket(context.env);
  if (!bucket) return { response: missingBucket() };
  const cleanPublicId = cleanId(publicId);
  if (!cleanPublicId) return { response: json({ ok: false, error: 'Asset not found.' }, { status: 404 }) };
  const metadata = await bucket.get(publicMetadataKey(cleanPublicId));
  if (!metadata) return { response: json({ ok: false, error: 'Asset not found.' }, { status: 404 }) };
  let record = null;
  try {
    record = JSON.parse(await metadata.text());
  } catch {}
  if (!record?.key) return { response: json({ ok: false, error: 'Asset metadata is invalid.' }, { status: 500 }) };
  return { bucket, record: { ...record, publicId: cleanPublicId } };
}

async function publicAssetDetails(context, publicId) {
  const found = await findPublicAsset(context, publicId);
  if (found.response) return found.response;
  return json({ ok: true, asset: publicPublishedAsset(found.record, context.request) }, { cacheControl: 'public, max-age=300' });
}

async function downloadPublicAsset(context, publicId) {
  const found = await findPublicAsset(context, publicId);
  if (found.response) return found.response;
  const object = await found.bucket.get(found.record.key);
  if (!object) return json({ ok: false, error: 'Asset data not found.' }, { status: 404 });
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': found.record.contentType || object.httpMetadata?.contentType || 'model/gltf-binary',
      'Content-Length': String(found.record.sizeBytes || object.size || ''),
      'Content-Disposition': `inline; filename="${cleanFileName(found.record.fileName || 'model.glb')}"`,
      'Cache-Control': 'public, max-age=86400',
      ...corsHeaders(),
    },
  });
}

async function deleteAsset(context, id) {
  const found = await findAsset(context, id);
  if (found.response) return found.response;
  await found.bucket.delete(found.record.key);
  const rows = found.rows.filter((item) => item.id !== found.record.id);
  await writeIndex(found.bucket, found.ownerHash, rows);
  return json({ ok: true, deleted: true, id: found.record.id });
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const parts = pathParts(context.params);
    if (context.request.method === 'GET' && parts.length === 1 && parts[0] === 'health') return health(context);
    if (context.request.method === 'GET' && parts.length === 0) return listAssets(context);
    if (context.request.method === 'POST' && parts.length === 0) return uploadAsset(context);
    if (context.request.method === 'GET' && parts.length === 2 && parts[0] === 'public') return publicAssetDetails(context, parts[1]);
    if (context.request.method === 'GET' && parts.length === 3 && parts[0] === 'public' && parts[2] === 'download') return downloadPublicAsset(context, parts[1]);
    if (context.request.method === 'GET' && parts.length === 1) return assetDetails(context, parts[0]);
    if (context.request.method === 'GET' && parts.length === 2 && parts[1] === 'download') return downloadAsset(context, parts[0]);
    if (context.request.method === 'POST' && parts.length === 2 && parts[1] === 'publish') return publishAsset(context, parts[0]);
    if (context.request.method === 'DELETE' && parts.length === 1) return deleteAsset(context, parts[0]);
    return json({ ok: false, error: 'Not found.' }, { status: 404 });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Asset API failed.' }, { status: err.status || 500 });
  }
}
