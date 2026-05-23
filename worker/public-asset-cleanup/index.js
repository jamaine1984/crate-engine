const PUBLIC_ASSET_PREFIX = 'published-assets';
const GAME_PREFIX = 'game:';
const LAST_RUN_KEY = 'cleanup:last-run';
const HISTORY_KEY = 'cleanup:history';
const HISTORY_LIMIT = 12;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Crate-Admin-Token',
      ...(init.headers || {}),
    },
  });
}

function cleanId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function cleanToken(value) {
  return String(value || '').trim().slice(0, 256);
}

function cleanFileName(value) {
  const fallback = 'model.glb';
  const cleaned = String(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return cleaned || fallback;
}

function publicObjectKey(publicId, fileName) {
  return `${PUBLIC_ASSET_PREFIX}/${cleanId(publicId)}/${cleanFileName(fileName)}`;
}

function publicIdFromMetadataKey(key) {
  const parts = String(key || '').split('/');
  return cleanId(parts.length >= 3 && parts[0] === PUBLIC_ASSET_PREFIX ? parts[1] : '');
}

function publicAssetId(record, fallbackKey = '') {
  return cleanId(record?.publicId || record?.id || publicIdFromMetadataKey(fallbackKey));
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? cleanToken(match[1]) : '';
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

function requireAdmin(request, env, payload = {}) {
  const provided = cleanToken(
    request.headers.get('x-crate-admin-token') ||
    payload.adminToken ||
    bearerToken(request)
  );
  if (!provided) {
    return { ok: false, response: json({ ok: false, error: 'Admin authorization is required to run public asset cleanup.' }, { status: 403 }) };
  }
  const match = adminTokenEntries(env).find((entry) => provided === cleanToken(entry.token));
  if (!match) {
    return { ok: false, response: json({ ok: false, error: 'Admin authorization is required to run public asset cleanup.' }, { status: 403 }) };
  }
  if (String(match.role || 'admin').toLowerCase() !== 'admin') {
    return { ok: false, response: json({ ok: false, error: 'Only admin role can run public asset cleanup.' }, { status: 403 }) };
  }
  return { ok: true, admin: { name: match.name || 'Admin', role: match.role || 'admin' } };
}

function cleanupLimit(value) {
  const limit = Number(value) || DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function scheduledDeleteEnabled(env = {}) {
  return String(env.CRATE_PUBLIC_ASSET_CLEANUP_DELETE || '').trim().toLowerCase() === 'true';
}

function gameStore(env = {}) {
  return env.CRATE_GAMES || env.CRATEGAMES || null;
}

function publicLastRun(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    runId: record.runId || '',
    ok: record.ok === true,
    error: record.error || '',
    reason: record.reason || '',
    dryRun: record.dryRun !== false,
    deleteEnabled: record.deleteEnabled === true,
    limit: Number(record.limit) || 0,
    scanned: Number(record.scanned) || 0,
    orphaned: Number(record.orphaned) || 0,
    deleted: Number(record.deleted) || 0,
    errorCount: Number(record.errorCount) || 0,
    startedAt: record.startedAt || '',
    finishedAt: record.finishedAt || '',
    durationMs: Number(record.durationMs) || 0,
    cron: record.cron || '',
    scheduledTime: Number(record.scheduledTime) || 0,
    persistedAt: record.persistedAt || '',
  };
}

async function readLastCleanupRun(env = {}) {
  const store = gameStore(env);
  if (!store) return null;
  const record = await store.get(LAST_RUN_KEY, 'json').catch(() => null);
  return publicLastRun(record);
}

function cleanupRunId(result = {}, metadata = {}) {
  if (metadata.runId) return cleanId(metadata.runId);
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  const stamp = String(result.finishedAt || result.startedAt || new Date().toISOString())
    .replace(/[^0-9]/g, '')
    .slice(0, 14);
  const reason = cleanId(result.reason || metadata.reason || 'run');
  return `${stamp || Date.now()}-${reason || 'run'}`;
}

function cleanupHistoryRecords(raw) {
  const rows = Array.isArray(raw) ? raw : (Array.isArray(raw?.runs) ? raw.runs : []);
  return rows.filter((record) => record && typeof record === 'object');
}

async function readCleanupHistory(env = {}) {
  const store = gameStore(env);
  if (!store) return [];
  const raw = await store.get(HISTORY_KEY, 'json').catch(() => null);
  return cleanupHistoryRecords(raw)
    .map(publicLastRun)
    .filter(Boolean)
    .slice(0, HISTORY_LIMIT);
}

async function persistCleanupRun(env = {}, result = {}, metadata = {}) {
  const store = gameStore(env);
  if (!store || !result || typeof result !== 'object') {
    return { lastRunPersisted: false, historyPersisted: false, run: null, history: [] };
  }
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const persistedAt = new Date().toISOString();
  const record = {
    format: 'crate-public-asset-cleanup-last-run',
    version: 1,
    runId: cleanupRunId(result, metadata),
    worker: 'crateship-public-asset-cleanup',
    persistedAt,
    ok: result.ok === true,
    error: result.error ? String(result.error).slice(0, 240) : '',
    reason: result.reason || metadata.reason || '',
    dryRun: result.dryRun !== false,
    deleteEnabled: result.deleteEnabled === true,
    limit: Number(result.limit) || 0,
    scanned: Number(result.scanned) || 0,
    orphaned: Number(result.orphaned) || 0,
    deleted: Number(result.deleted) || 0,
    errorCount: errors.length,
    errors: errors.slice(0, 20).map((entry) => ({
      publicId: cleanId(entry?.publicId || ''),
      error: String(entry?.error || entry?.message || entry || 'cleanup failed').slice(0, 240),
    })),
    startedAt: result.startedAt || '',
    finishedAt: result.finishedAt || '',
    durationMs: Number(result.durationMs) || 0,
    cron: metadata.cron || '',
    scheduledTime: Number(metadata.scheduledTime) || 0,
  };
  let lastRunPersisted = false;
  let historyPersisted = false;
  let history = [];
  try {
    await store.put(LAST_RUN_KEY, JSON.stringify(record));
    lastRunPersisted = true;
  } catch {}
  try {
    const rawHistory = await store.get(HISTORY_KEY, 'json').catch(() => null);
    const previous = cleanupHistoryRecords(rawHistory);
    const next = [
      record,
      ...previous.filter((entry) => String(entry.runId || '') !== record.runId),
    ].slice(0, HISTORY_LIMIT);
    await store.put(HISTORY_KEY, JSON.stringify({
      format: 'crate-public-asset-cleanup-history',
      version: 1,
      updatedAt: persistedAt,
      limit: HISTORY_LIMIT,
      runs: next,
    }));
    historyPersisted = true;
    history = next.map(publicLastRun).filter(Boolean);
  } catch {}
  return {
    lastRunPersisted,
    historyPersisted,
    run: publicLastRun(record),
    history,
  };
}

async function listPublicAssetMetadata(bucket, limit) {
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

async function cleanupPublicAssets(env, options = {}) {
  const startedAt = new Date();
  const bucket = env.CRATE_USER_ASSETS || env.CRATE_ASSETS || null;
  const store = gameStore(env);
  if (!bucket) return { ok: false, error: 'CRATE_USER_ASSETS R2 binding is not configured.' };
  if (!store) return { ok: false, error: 'CRATE_GAMES KV binding is not configured.' };

  const limit = cleanupLimit(options.limit || env.CRATE_PUBLIC_ASSET_CLEANUP_LIMIT);
  const dryRun = options.dryRun !== false;
  const listed = await listPublicAssetMetadata(bucket, limit);
  const result = {
    ok: true,
    reason: options.reason || 'manual',
    dryRun,
    deleteEnabled: !dryRun,
    limit,
    scanned: listed.scanned,
    orphaned: 0,
    deleted: 0,
    errors: [],
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    durationMs: 0,
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

  const finishedAt = new Date();
  result.finishedAt = finishedAt.toISOString();
  result.durationMs = finishedAt.getTime() - startedAt.getTime();
  return result;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: json({}).headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      const lastRun = await readLastCleanupRun(env);
      const history = await readCleanupHistory(env);
      return json({
        ok: true,
        worker: 'crateship-public-asset-cleanup',
        dryRunByDefault: !scheduledDeleteEnabled(env),
        deleteEnabled: scheduledDeleteEnabled(env),
        limit: cleanupLimit(env.CRATE_PUBLIC_ASSET_CLEANUP_LIMIT),
        hasR2Binding: !!(env.CRATE_USER_ASSETS || env.CRATE_ASSETS),
        hasGameStore: !!gameStore(env),
        lastRun,
        history,
        historyLimit: HISTORY_LIMIT,
      });
    }
    if (request.method === 'GET' && url.pathname === '/history') {
      const admin = requireAdmin(request, env, {});
      if (!admin.ok) return admin.response;
      const lastRun = await readLastCleanupRun(env);
      const history = await readCleanupHistory(env);
      return json({
        ok: true,
        worker: 'crateship-public-asset-cleanup',
        generatedAt: new Date().toISOString(),
        admin: admin.admin,
        lastRun,
        history,
        total: history.length,
        historyLimit: HISTORY_LIMIT,
        exportFileName: `crateship-cleanup-history-${new Date().toISOString().slice(0, 10)}.json`,
      });
    }
    if (request.method === 'POST' && url.pathname === '/cleanup') {
      const payload = await readJson(request);
      const admin = requireAdmin(request, env, payload);
      if (!admin.ok) return admin.response;
      const dryRun = payload.delete === true ? false : payload.dryRun !== false;
      const result = await cleanupPublicAssets(env, {
        dryRun,
        limit: payload.limit,
        reason: 'manual-api',
      });
      const persisted = await persistCleanupRun(env, result, {
        reason: 'manual-api',
        admin: admin.admin,
      });
      return json({
        ...result,
        admin: admin.admin,
        lastRunPersisted: persisted.lastRunPersisted,
        historyPersisted: persisted.historyPersisted,
        lastRun: persisted.run,
        history: persisted.history,
        historyLimit: HISTORY_LIMIT,
      }, { status: result.ok ? 200 : 503 });
    }
    return json({ ok: false, error: 'Not found.' }, { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const result = await cleanupPublicAssets(env, {
        dryRun: !scheduledDeleteEnabled(env),
        reason: 'scheduled',
      });
      const persisted = await persistCleanupRun(env, result, {
        cron: event.cron || '',
        scheduledTime: event.scheduledTime || 0,
      });
      console.log(JSON.stringify({
        worker: 'crateship-public-asset-cleanup',
        cron: event.cron || '',
        scheduledTime: event.scheduledTime || 0,
        lastRunPersisted: persisted.lastRunPersisted,
        historyPersisted: persisted.historyPersisted,
        historyCount: persisted.history.length,
        ...result,
      }));
    })());
  },
};
