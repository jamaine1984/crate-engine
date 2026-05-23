const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_FILE_NAME_LENGTH = 180;
const MAX_SOURCE_LENGTH = 80;
const MAX_METRICS_LENGTH = 2000;
const MAX_INDEX_ROWS = 500;
const MAX_GAME_SCAN = 1000;
const MAX_PUBLIC_USAGE_SCAN = 500;
const MAX_PUBLIC_CLEANUP_SCAN = 200;
const DEFAULT_OWNER_QUOTA_BYTES = 500 * 1024 * 1024;
const ASSET_PREFIX = 'user-assets';
const PUBLIC_ASSET_PREFIX = 'published-assets';
const GAME_PREFIX = 'game:';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Crate-Owner-Token, X-Crate-Admin-Token',
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

function getGameStore(env) {
  return env.CRATE_GAMES || env.CRATEGAMES || null;
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

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? cleanToken(match[1]) : '';
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

function ownerQuotaBytes(env = {}) {
  const configured = Number(env.CRATE_USER_ASSET_QUOTA_BYTES || env.CRATE_OWNER_ASSET_QUOTA_BYTES || 0);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_OWNER_QUOTA_BYTES;
}

function assetBytes(record) {
  return Math.max(0, Number(record?.sizeBytes) || 0);
}

function sumAssetBytes(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + assetBytes(row), 0);
}

function usagePercent(bytes, quotaBytes) {
  if (!quotaBytes) return 0;
  return Math.round(Math.min(100, Math.max(0, bytes / quotaBytes * 1000))) / 10;
}

function publicIdFromMetadataKey(key) {
  const parts = String(key || '').split('/');
  return cleanId(parts.length >= 3 && parts[0] === PUBLIC_ASSET_PREFIX ? parts[1] : '');
}

function publicAssetId(record, fallbackKey = '') {
  return cleanId(record?.publicId || record?.id || publicIdFromMetadataKey(fallbackKey));
}

function parseAdminTokenEntries(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((entry, index) => typeof entry === 'string'
        ? { token: entry, name: `Admin ${index + 1}`, role: 'admin' }
        : entry);
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([token, value]) => {
        if (value && typeof value === 'object') return { token, ...value };
        return { token, name: value };
      });
    }
  } catch {}
  return text
    .split(',')
    .map((token) => cleanToken(token))
    .filter(Boolean)
    .map((token, index) => ({ token, name: `Admin ${index + 1}`, role: 'admin' }));
}

function adminTokenEntries(env = {}) {
  const entries = [];
  const legacyToken = cleanToken(env.CRATE_GAMES_ADMIN_TOKEN || env.CRATE_ADMIN_TOKEN || '');
  if (legacyToken) {
    entries.push({
      token: legacyToken,
      name: env.CRATE_GAMES_ADMIN_NAME || env.CRATE_ADMIN_NAME || 'Primary admin',
      role: env.CRATE_GAMES_ADMIN_ROLE || env.CRATE_ADMIN_ROLE || 'admin',
    });
  }
  for (const entry of parseAdminTokenEntries(env.CRATE_GAMES_ADMIN_TOKENS || env.CRATE_ADMIN_TOKENS || '')) {
    const token = cleanToken(entry?.token);
    if (!token) continue;
    entries.push({
      token,
      name: entry.name || entry.label || entry.email || entry.id || 'Admin',
      role: entry.role || 'admin',
    });
  }
  return entries;
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

async function requireAdmin(context, payload = {}) {
  const provided = cleanToken(
    context.request.headers.get('x-crate-admin-token') ||
    payload.adminToken ||
    bearerToken(context.request)
  );
  if (!provided) return { ok: false, response: json({ ok: false, error: 'Admin authorization required.' }, { status: 403 }) };
  const match = adminTokenEntries(context.env).find((entry) => provided === cleanToken(entry.token));
  if (!match) return { ok: false, response: json({ ok: false, error: 'Admin authorization required.' }, { status: 403 }) };
  return {
    ok: true,
    admin: {
      name: cleanText(match.name || 'Admin', 80),
      role: cleanText(match.role || 'admin', 32),
    },
  };
}

function missingBucket() {
  return json({ ok: false, error: 'CRATE_USER_ASSETS R2 binding is not configured.' }, { status: 503 });
}

async function health(context) {
  const quotaBytes = ownerQuotaBytes(context.env);
  return json({
    ok: true,
    binding: !!getBucket(context.env),
    maxAssetBytes: MAX_ASSET_BYTES,
    maxAssetMB: Math.round(MAX_ASSET_BYTES / (1024 * 1024)),
    ownerQuotaBytes: quotaBytes,
    ownerQuotaMB: Math.round(quotaBytes / (1024 * 1024)),
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

async function listOwnerPublishedAssets(bucket, ownerHash, limit = MAX_PUBLIC_USAGE_SCAN) {
  const rows = [];
  let cursor = undefined;
  let scanned = 0;
  do {
    const remaining = Math.max(1, Math.min(1000, limit - scanned));
    const listed = await bucket.list({
      prefix: `${PUBLIC_ASSET_PREFIX}/`,
      limit: remaining,
      cursor,
    });
    const objects = Array.isArray(listed?.objects) ? listed.objects : [];
    for (const item of objects) {
      const key = item.key || item.name || '';
      if (!key.endsWith('/asset.json')) continue;
      scanned += 1;
      try {
        const metadata = await bucket.get(key);
        if (!metadata) continue;
        const record = JSON.parse(await metadata.text());
        if (record?.ownerHash !== ownerHash) continue;
        rows.push({
          ...record,
          publicId: publicAssetId(record, key),
          metadataKey: key,
        });
      } catch {}
      if (scanned >= limit) break;
    }
    cursor = listed?.cursor;
    if (!listed?.truncated || !cursor || scanned >= limit) break;
  } while (true);
  return { rows, scanned };
}

async function storageUsage(context) {
  const bucket = getBucket(context.env);
  if (!bucket) return missingBucket();
  const owner = await requireOwner(context);
  if (!owner.ok) return owner.response;

  const privateRows = await readIndex(bucket, owner.ownerHash);
  const published = await listOwnerPublishedAssets(bucket, owner.ownerHash);
  const privateBytes = sumAssetBytes(privateRows);
  const publishedBytes = sumAssetBytes(published.rows);
  const totalBytes = privateBytes + publishedBytes;
  const quotaBytes = ownerQuotaBytes(context.env);
  return json({
    ok: true,
    usage: {
      private: {
        assets: privateRows.length,
        bytes: privateBytes,
        maxAssets: MAX_INDEX_ROWS,
      },
      published: {
        assets: published.rows.length,
        bytes: publishedBytes,
        scanned: published.scanned,
      },
      total: {
        assets: privateRows.length + published.rows.length,
        bytes: totalBytes,
      },
      quota: {
        bytes: quotaBytes,
        percent: usagePercent(totalBytes, quotaBytes),
        maxUploadBytes: MAX_ASSET_BYTES,
      },
    },
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
  const currentRows = await readIndex(bucket, owner.ownerHash);
  const rowsWithoutCurrent = currentRows.filter((item) => item.id !== id);
  const quotaBytes = ownerQuotaBytes(context.env);
  if (sumAssetBytes(rowsWithoutCurrent) + sizeBytes > quotaBytes) {
    return json({
      ok: false,
      error: `Cloud asset storage quota is ${Math.round(quotaBytes / (1024 * 1024))} MB. Delete older imports before uploading this file.`,
      quotaBytes,
    }, { status: 413 });
  }
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

  const rows = rowsWithoutCurrent;
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
  const quotaBytes = ownerQuotaBytes(context.env);
  const publishedUsage = await listOwnerPublishedAssets(found.bucket, found.ownerHash);
  const replacingBytes = existingPublicRecord?.ownerHash === found.ownerHash ? assetBytes(existingPublicRecord) : 0;
  const projectedBytes = sumAssetBytes(found.rows) + sumAssetBytes(publishedUsage.rows) - replacingBytes + assetBytes(found.record);
  if (projectedBytes > quotaBytes) {
    return json({
      ok: false,
      error: `Publishing this game asset would exceed the ${Math.round(quotaBytes / (1024 * 1024))} MB cloud storage quota.`,
      quotaBytes,
    }, { status: 413 });
  }
  const publicRecord = {
    ...found.record,
    id: publicId,
    publicId,
    sourceAssetId: found.record.id,
    ownerHash: found.ownerHash,
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

async function listPublicAssetMetadata(bucket, limit = MAX_PUBLIC_CLEANUP_SCAN) {
  const rows = [];
  let cursor = undefined;
  let scanned = 0;
  do {
    const remaining = Math.max(1, Math.min(1000, limit - scanned));
    const listed = await bucket.list({
      prefix: `${PUBLIC_ASSET_PREFIX}/`,
      limit: remaining,
      cursor,
    });
    const objects = Array.isArray(listed?.objects) ? listed.objects : [];
    for (const item of objects) {
      const key = item.key || item.name || '';
      if (!key.endsWith('/asset.json')) continue;
      scanned += 1;
      let record = null;
      try {
        const metadata = await bucket.get(key);
        if (metadata) record = JSON.parse(await metadata.text());
      } catch {}
      rows.push({
        key,
        publicId: publicAssetId(record, key),
        record: record || {},
      });
      if (scanned >= limit) break;
    }
    cursor = listed?.cursor;
    if (!listed?.truncated || !cursor || scanned >= limit) break;
  } while (true);
  return { rows, scanned };
}

async function publicAssetIsReferencedByGame(store, publicId, record = {}) {
  const slug = cleanId(record.gameSlug || '');
  if (!slug) return false;
  const game = await store.get(GAME_PREFIX + slug, 'json').catch(() => null);
  if (!game) return false;
  return (Array.isArray(game.cloudAssets) ? game.cloudAssets : []).some((asset) => {
    return cleanId(asset?.publicId || asset?.id || '') === publicId;
  });
}

async function cleanupPublicAssets(context) {
  const bucket = getBucket(context.env);
  if (!bucket) return missingBucket();
  const store = getGameStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });
  const payload = await readJson(context.request);
  const admin = await requireAdmin(context, payload);
  if (!admin.ok) return admin.response;
  const limit = Math.min(Math.max(Number(payload.limit) || MAX_PUBLIC_CLEANUP_SCAN, 1), MAX_PUBLIC_CLEANUP_SCAN);
  const dryRun = payload.dryRun !== false && payload.delete !== true;
  const listed = await listPublicAssetMetadata(bucket, limit);
  const result = {
    ok: true,
    dryRun,
    scanned: listed.scanned,
    orphaned: 0,
    deleted: 0,
    errors: [],
  };
  for (const item of listed.rows) {
    const publicId = item.publicId;
    if (!publicId) continue;
    const referenced = await publicAssetIsReferencedByGame(store, publicId, item.record);
    if (referenced) continue;
    result.orphaned += 1;
    if (dryRun) continue;
    const objectKey = item.record?.key || publicObjectKey(publicId, item.record?.fileName || 'model.glb');
    try {
      await Promise.all([...new Set([objectKey, item.key].filter(Boolean))].map((key) => bucket.delete(key)));
      result.deleted += 1;
    } catch (err) {
      result.errors.push({ publicId, error: err?.message || String(err || 'cleanup failed') });
    }
  }
  return json(result);
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
    if (context.request.method === 'GET' && parts.length === 1 && parts[0] === 'usage') return storageUsage(context);
    if (context.request.method === 'POST' && parts.length === 2 && parts[0] === 'admin' && parts[1] === 'public-cleanup') return cleanupPublicAssets(context);
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
