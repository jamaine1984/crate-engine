const PUBLIC_ASSET_PREFIX = 'published-assets';
const GAME_PREFIX = 'game:';
const LAST_RUN_KEY = 'cleanup:last-run';
const HISTORY_KEY = 'cleanup:history';
const HISTORY_LIMIT = 12;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const HISTORY_CSV_COLUMNS = [
  'exportGeneratedAt',
  'worker',
  'adminName',
  'adminRole',
  'runId',
  'ok',
  'reason',
  'dryRun',
  'deleteEnabled',
  'limit',
  'scanned',
  'orphaned',
  'deleted',
  'errorCount',
  'startedAt',
  'finishedAt',
  'durationMs',
  'cron',
  'scheduledTime',
  'persistedAt',
  'error',
];
const AUDIT_CSV_COLUMNS = [
  'exportGeneratedAt',
  'worker',
  'adminName',
  'adminRole',
  'runId',
  'ok',
  'reason',
  'dryRun',
  'deleteEnabled',
  'limit',
  'scanned',
  'orphaned',
  'deleted',
  'errorCount',
  'startedAt',
  'finishedAt',
  'durationMs',
  'cron',
  'scheduledTime',
  'persistedAt',
  'source',
  'error',
];

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

function csv(data, fileName, init = {}) {
  return new Response(data, {
    status: init.status || 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${cleanFileName(fileName || 'crateship-cleanup-history.csv')}"`,
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

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cleanupHistoryCsv(history, meta = {}) {
  const rows = Array.isArray(history) ? history : [];
  const normalized = rows.map((run) => ({
    exportGeneratedAt: meta.generatedAt || '',
    worker: meta.worker || 'crateship-public-asset-cleanup',
    adminName: meta.admin?.name || '',
    adminRole: meta.admin?.role || '',
    runId: run?.runId || '',
    ok: run?.ok === true ? 'true' : 'false',
    reason: run?.reason || '',
    dryRun: run?.dryRun !== false ? 'true' : 'false',
    deleteEnabled: run?.deleteEnabled === true ? 'true' : 'false',
    limit: Number(run?.limit) || 0,
    scanned: Number(run?.scanned) || 0,
    orphaned: Number(run?.orphaned) || 0,
    deleted: Number(run?.deleted) || 0,
    errorCount: Number(run?.errorCount) || 0,
    startedAt: run?.startedAt || '',
    finishedAt: run?.finishedAt || '',
    durationMs: Number(run?.durationMs) || 0,
    cron: run?.cron || '',
    scheduledTime: Number(run?.scheduledTime) || 0,
    persistedAt: run?.persistedAt || '',
    error: run?.error || '',
  }));
  return [
    HISTORY_CSV_COLUMNS.join(','),
    ...normalized.map((row) => HISTORY_CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')),
  ].join('\r\n') + '\r\n';
}

function cleanupAuditCsv(rows, meta = {}) {
  const normalized = (Array.isArray(rows) ? rows : []).map((run) => ({
    exportGeneratedAt: meta.generatedAt || '',
    worker: run?.worker || meta.worker || 'crateship-public-asset-cleanup',
    adminName: run?.adminName || '',
    adminRole: run?.adminRole || '',
    runId: run?.runId || '',
    ok: run?.ok === true ? 'true' : 'false',
    reason: run?.reason || '',
    dryRun: run?.dryRun !== false ? 'true' : 'false',
    deleteEnabled: run?.deleteEnabled === true ? 'true' : 'false',
    limit: Number(run?.limit) || 0,
    scanned: Number(run?.scanned) || 0,
    orphaned: Number(run?.orphaned) || 0,
    deleted: Number(run?.deleted) || 0,
    errorCount: Number(run?.errorCount) || 0,
    startedAt: run?.startedAt || '',
    finishedAt: run?.finishedAt || '',
    durationMs: Number(run?.durationMs) || 0,
    cron: run?.cron || '',
    scheduledTime: Number(run?.scheduledTime) || 0,
    persistedAt: run?.persistedAt || '',
    source: run?.source || '',
    error: run?.error || '',
  }));
  return [
    AUDIT_CSV_COLUMNS.join(','),
    ...normalized.map((row) => AUDIT_CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')),
  ].join('\r\n') + '\r\n';
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

function cleanupAuditLimit(value) {
  const limit = Number(value) || 24;
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

function cleanupAuditOffset(value) {
  const offset = Number(value) || 0;
  return Math.min(Math.max(Math.floor(offset), 0), 10000);
}

function cleanupAuditReason(value) {
  const reason = String(value || 'all').trim().toLowerCase();
  if (!reason || reason === 'all') return 'all';
  if (reason === 'manual') return 'manual-api';
  if (reason === 'cron') return 'scheduled';
  return cleanId(reason) || 'all';
}

function cleanupAuditMode(value) {
  const mode = String(value || 'all').trim().toLowerCase();
  return ['all', 'dry-run', 'delete'].includes(mode) ? mode : 'all';
}

function cleanupAuditDate(value, edge) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}${edge === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`
    : text;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function scheduledDeleteEnabled(env = {}) {
  return String(env.CRATE_PUBLIC_ASSET_CLEANUP_DELETE || '').trim().toLowerCase() === 'true';
}

function gameStore(env = {}) {
  return env.CRATE_GAMES || env.CRATEGAMES || null;
}

function auditStore(env = {}) {
  return env.CRATE_AUDIT || env.CRATEGAMES_AUDIT || env.CRATE_GAMES_AUDIT || null;
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

function publicLastRunFromD1(row) {
  if (!row || typeof row !== 'object') return null;
  return publicLastRun({
    runId: row.run_id || row.runId || '',
    ok: row.ok === true || row.ok === 1,
    error: row.error || '',
    reason: row.reason || '',
    dryRun: row.dry_run !== 0 && row.dryRun !== false,
    deleteEnabled: row.delete_enabled === 1 || row.deleteEnabled === true,
    limit: row.limit_count || row.limit || 0,
    scanned: row.scanned || 0,
    orphaned: row.orphaned || 0,
    deleted: row.deleted || 0,
    errorCount: row.error_count || row.errorCount || 0,
    startedAt: row.started_at || row.startedAt || '',
    finishedAt: row.finished_at || row.finishedAt || '',
    durationMs: row.duration_ms || row.durationMs || 0,
    cron: row.cron || '',
    scheduledTime: row.scheduled_time || row.scheduledTime || 0,
    persistedAt: row.persisted_at || row.persistedAt || '',
  });
}

function publicCleanupAuditRow(row) {
  const run = publicLastRunFromD1(row);
  if (!run) return null;
  return {
    ...run,
    worker: row.worker || 'crateship-public-asset-cleanup',
    source: row.source || '',
    adminName: row.admin_name || row.adminName || '',
    adminRole: row.admin_role || row.adminRole || '',
  };
}

async function ensureCleanupAuditSchema(db) {
  if (!db?.prepare) return false;
  await db.prepare(`CREATE TABLE IF NOT EXISTS cleanup_audit (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    persisted_at TEXT NOT NULL,
    worker TEXT NOT NULL,
    source TEXT,
    ok INTEGER DEFAULT 0,
    error TEXT,
    reason TEXT,
    dry_run INTEGER DEFAULT 1,
    delete_enabled INTEGER DEFAULT 0,
    limit_count INTEGER DEFAULT 0,
    scanned INTEGER DEFAULT 0,
    orphaned INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    errors_json TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER DEFAULT 0,
    cron TEXT,
    scheduled_time INTEGER DEFAULT 0,
    admin_name TEXT,
    admin_role TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cleanup_audit_persisted_at ON cleanup_audit (persisted_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cleanup_audit_reason_persisted_at ON cleanup_audit (reason, persisted_at DESC)').run();
  return true;
}

async function readD1CleanupHistory(env = {}, limit = HISTORY_LIMIT) {
  const db = auditStore(env);
  if (!db?.prepare) return { available: false, history: [] };
  try {
    await ensureCleanupAuditSchema(db);
    const result = await db.prepare(`SELECT run_id, persisted_at, ok, error, reason, dry_run, delete_enabled,
      limit_count, scanned, orphaned, deleted, error_count, started_at, finished_at, duration_ms, cron, scheduled_time
      FROM cleanup_audit
      ORDER BY persisted_at DESC
      LIMIT ?`)
      .bind(Math.min(Math.max(Number(limit) || HISTORY_LIMIT, 1), 100))
      .all();
    return {
      available: true,
      history: (result?.results || []).map(publicLastRunFromD1).filter(Boolean),
    };
  } catch (err) {
    return { available: false, history: [], error: err?.message || String(err || 'cleanup audit D1 read failed') };
  }
}

async function readCleanupAuditRows(env = {}, options = {}) {
  const db = auditStore(env);
  if (!db?.prepare) return { available: false, rows: [], total: 0, error: 'Cleanup audit D1 binding is not configured.' };
  const reason = cleanupAuditReason(options.reason);
  const mode = cleanupAuditMode(options.mode);
  const limit = cleanupAuditLimit(options.limit);
  const offset = cleanupAuditOffset(options.offset);
  const from = cleanupAuditDate(options.from, 'start');
  const to = cleanupAuditDate(options.to, 'end');
  const conditions = [];
  const binds = [];
  if (reason !== 'all') {
    conditions.push('reason = ?');
    binds.push(reason);
  }
  if (mode === 'dry-run') conditions.push('dry_run = 1');
  if (mode === 'delete') conditions.push('dry_run = 0');
  if (from) {
    conditions.push('persisted_at >= ?');
    binds.push(from);
  }
  if (to) {
    conditions.push('persisted_at <= ?');
    binds.push(to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    await ensureCleanupAuditSchema(db);
    const rowsSql = `SELECT run_id, persisted_at, worker, source, ok, error, reason, dry_run, delete_enabled,
      limit_count, scanned, orphaned, deleted, error_count, started_at, finished_at, duration_ms, cron,
      scheduled_time, admin_name, admin_role
      FROM cleanup_audit
      ${where}
      ORDER BY persisted_at DESC
      LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) AS total FROM cleanup_audit ${where}`;
    const rowStatement = db.prepare(rowsSql);
    const countStatement = db.prepare(countSql);
    const result = await rowStatement.bind(...binds, limit, offset).all();
    const count = binds.length
      ? await countStatement.bind(...binds).first()
      : await countStatement.first();
    return {
      available: true,
      rows: (result?.results || []).map(publicCleanupAuditRow).filter(Boolean),
      total: Number(count?.total) || 0,
      reason,
      mode,
      limit,
      offset,
      from,
      to,
    };
  } catch (err) {
    return { available: false, rows: [], total: 0, reason, mode, limit, offset, from, to, error: err?.message || String(err || 'cleanup audit D1 read failed') };
  }
}

async function readCleanupHistoryState(env = {}) {
  const d1 = await readD1CleanupHistory(env, HISTORY_LIMIT);
  const kvHistory = await readCleanupHistoryFromKv(env);
  if (d1.available && d1.history.length) {
    return {
      history: d1.history.slice(0, HISTORY_LIMIT),
      source: 'd1',
      d1Available: true,
      hasAuditStore: !!auditStore(env),
      kvHistoryCount: kvHistory.length,
      error: '',
    };
  }
  return {
    history: kvHistory.slice(0, HISTORY_LIMIT),
    source: d1.available && !kvHistory.length ? 'd1' : 'kv',
    d1Available: d1.available,
    hasAuditStore: !!auditStore(env),
    kvHistoryCount: kvHistory.length,
    error: d1.error || '',
  };
}

async function readLastCleanupRun(env = {}) {
  const store = gameStore(env);
  const record = store ? await store.get(LAST_RUN_KEY, 'json').catch(() => null) : null;
  const kvRun = publicLastRun(record);
  if (kvRun) return kvRun;
  const d1 = await readD1CleanupHistory(env, 1);
  return d1.history[0] || null;
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

async function readCleanupHistoryFromKv(env = {}) {
  const store = gameStore(env);
  if (!store) return [];
  const raw = await store.get(HISTORY_KEY, 'json').catch(() => null);
  return cleanupHistoryRecords(raw)
    .map(publicLastRun)
    .filter(Boolean)
    .slice(0, HISTORY_LIMIT);
}

async function readCleanupHistory(env = {}) {
  return (await readCleanupHistoryState(env)).history;
}

async function persistCleanupRunToD1(env = {}, record = {}, metadata = {}) {
  const db = auditStore(env);
  if (!db?.prepare || !record?.runId) return { ok: false, source: 'missing-d1' };
  try {
    await ensureCleanupAuditSchema(db);
    const errors = Array.isArray(record.errors) ? record.errors : [];
    await db.prepare(`INSERT OR REPLACE INTO cleanup_audit
      (id, run_id, persisted_at, worker, source, ok, error, reason, dry_run, delete_enabled,
       limit_count, scanned, orphaned, deleted, error_count, errors_json, started_at, finished_at,
       duration_ms, cron, scheduled_time, admin_name, admin_role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        record.runId,
        record.runId,
        record.persistedAt || new Date().toISOString(),
        record.worker || 'crateship-public-asset-cleanup',
        metadata.source || record.reason || 'cleanup-worker',
        record.ok === true ? 1 : 0,
        record.error || '',
        record.reason || metadata.reason || '',
        record.dryRun !== false ? 1 : 0,
        record.deleteEnabled === true ? 1 : 0,
        Number(record.limit) || 0,
        Number(record.scanned) || 0,
        Number(record.orphaned) || 0,
        Number(record.deleted) || 0,
        Number(record.errorCount) || errors.length || 0,
        JSON.stringify(errors.slice(0, 20)),
        record.startedAt || '',
        record.finishedAt || '',
        Number(record.durationMs) || 0,
        record.cron || metadata.cron || '',
        Number(record.scheduledTime || metadata.scheduledTime) || 0,
        metadata.admin?.name || '',
        metadata.admin?.role || ''
      )
      .run();
    return { ok: true, source: 'd1' };
  } catch (err) {
    return { ok: false, source: 'd1', error: err?.message || String(err || 'cleanup audit D1 write failed') };
  }
}

async function persistCleanupRun(env = {}, result = {}, metadata = {}) {
  const store = gameStore(env);
  if (!result || typeof result !== 'object') {
    return { lastRunPersisted: false, historyPersisted: false, d1HistoryPersisted: false, run: null, history: [], historySource: 'missing-result' };
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
  let d1HistoryPersisted = false;
  let d1HistoryError = '';
  let history = [];
  if (store) {
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
  }
  const d1 = await persistCleanupRunToD1(env, record, metadata);
  d1HistoryPersisted = d1.ok === true;
  d1HistoryError = d1.error || '';
  const historyState = await readCleanupHistoryState(env);
  if (historyState.history.length) history = historyState.history;
  return {
    lastRunPersisted,
    historyPersisted,
    d1HistoryPersisted,
    d1HistoryError,
    historySource: historyState.source,
    d1HistoryAvailable: historyState.d1Available,
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
      const historyState = await readCleanupHistoryState(env);
      return json({
        ok: true,
        worker: 'crateship-public-asset-cleanup',
        dryRunByDefault: !scheduledDeleteEnabled(env),
        deleteEnabled: scheduledDeleteEnabled(env),
        limit: cleanupLimit(env.CRATE_PUBLIC_ASSET_CLEANUP_LIMIT),
        hasR2Binding: !!(env.CRATE_USER_ASSETS || env.CRATE_ASSETS),
        hasGameStore: !!gameStore(env),
        hasAuditStore: !!auditStore(env),
        lastRun,
        history: historyState.history,
        historyLimit: HISTORY_LIMIT,
        historySource: historyState.source,
        d1HistoryAvailable: historyState.d1Available,
        d1HistoryError: historyState.error || '',
        kvHistoryCount: historyState.kvHistoryCount,
      });
    }
    if (request.method === 'GET' && (url.pathname === '/history' || url.pathname === '/history.csv')) {
      const admin = requireAdmin(request, env, {});
      if (!admin.ok) return admin.response;
      const lastRun = await readLastCleanupRun(env);
      const historyState = await readCleanupHistoryState(env);
      const history = historyState.history;
      const generatedAt = new Date().toISOString();
      const baseFileName = `crateship-cleanup-history-${generatedAt.slice(0, 10)}`;
      const wantsCsv = url.pathname === '/history.csv' ||
        String(url.searchParams.get('format') || '').toLowerCase() === 'csv' ||
        /\btext\/csv\b/i.test(request.headers.get('accept') || '');
      if (wantsCsv) {
        return csv(cleanupHistoryCsv(history, {
          generatedAt,
          worker: 'crateship-public-asset-cleanup',
          admin: admin.admin,
        }), `${baseFileName}.csv`);
      }
      return json({
        ok: true,
        worker: 'crateship-public-asset-cleanup',
        generatedAt,
        admin: admin.admin,
        lastRun,
        history,
        total: history.length,
        historyLimit: HISTORY_LIMIT,
        historySource: historyState.source,
        d1HistoryAvailable: historyState.d1Available,
        d1HistoryError: historyState.error || '',
        kvHistoryCount: historyState.kvHistoryCount,
        exportFileName: `${baseFileName}.json`,
        csvExportFileName: `${baseFileName}.csv`,
      });
    }
    if (request.method === 'GET' && (url.pathname === '/audit' || url.pathname === '/audit.csv')) {
      const admin = requireAdmin(request, env, {});
      if (!admin.ok) return admin.response;
      const reason = cleanupAuditReason(url.searchParams.get('reason'));
      const mode = cleanupAuditMode(url.searchParams.get('mode'));
      const limit = cleanupAuditLimit(url.searchParams.get('limit'));
      const offset = cleanupAuditOffset(url.searchParams.get('offset'));
      const from = cleanupAuditDate(url.searchParams.get('from'), 'start');
      const to = cleanupAuditDate(url.searchParams.get('to'), 'end');
      const audit = await readCleanupAuditRows(env, { reason, mode, limit, offset, from, to });
      if (!audit.available) {
        return json({
          ok: false,
          worker: 'crateship-public-asset-cleanup',
          source: 'd1',
          d1HistoryAvailable: false,
          error: audit.error || 'Cleanup audit D1 is unavailable.',
        }, { status: 503 });
      }
      const generatedAt = new Date().toISOString();
      const wantsCsv = url.pathname === '/audit.csv' ||
        String(url.searchParams.get('format') || '').toLowerCase() === 'csv' ||
        /\btext\/csv\b/i.test(request.headers.get('accept') || '');
      const baseFileName = `crateship-cleanup-audit-${generatedAt.slice(0, 10)}`;
      if (wantsCsv) {
        return csv(cleanupAuditCsv(audit.rows, {
          generatedAt,
          worker: 'crateship-public-asset-cleanup',
        }), `${baseFileName}.csv`);
      }
      return json({
        ok: true,
        worker: 'crateship-public-asset-cleanup',
        generatedAt,
        admin: admin.admin,
        source: 'd1',
        rows: audit.rows,
        total: audit.total,
        limit: audit.limit,
        offset: audit.offset,
        hasPrevious: audit.offset > 0,
        hasNext: audit.offset + audit.rows.length < audit.total,
        reason: audit.reason,
        mode: audit.mode,
        from: audit.from,
        to: audit.to,
        d1HistoryAvailable: true,
        exportFileName: `${baseFileName}.json`,
        csvExportFileName: `${baseFileName}.csv`,
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
        d1HistoryPersisted: persisted.d1HistoryPersisted,
        d1HistoryError: persisted.d1HistoryError,
        d1HistoryAvailable: persisted.d1HistoryAvailable,
        historySource: persisted.historySource,
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
        d1HistoryPersisted: persisted.d1HistoryPersisted,
        d1HistoryAvailable: persisted.d1HistoryAvailable,
        historySource: persisted.historySource,
        historyCount: persisted.history.length,
        ...result,
      }));
    })());
  },
};
