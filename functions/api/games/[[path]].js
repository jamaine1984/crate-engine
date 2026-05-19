const MAX_BODY_BYTES = 900000;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1200;
const MAX_CREATOR_LENGTH = 80;
const MAX_CREATOR_URL_LENGTH = 220;
const MAX_REVIEW_NOTE_LENGTH = 240;
const MAX_ADMIN_NAME_LENGTH = 80;
const MAX_ADMIN_ROLE_LENGTH = 32;
const MAX_TAGS = 12;
const MAX_LIST_SCAN = 1000;
const MAX_AUDIT_EVENTS = 100;
const GAME_PREFIX = 'game:';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

function getStore(env) {
  return env.CRATE_GAMES || env.CRATEGAMES || null;
}

function getAuditStore(env) {
  return env.CRATE_AUDIT || env.CRATEGAMES_AUDIT || env.CRATE_GAMES_AUDIT || null;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanTags(tags) {
  const raw = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return raw
    .map((tag) => cleanText(tag, 36).toLowerCase())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index)
    .slice(0, MAX_TAGS);
}

function cleanVisibility(value) {
  const normalized = cleanText(value || 'public', 24).toLowerCase();
  return normalized === 'unlisted' ? 'unlisted' : 'public';
}

function cleanModerationStatus(value) {
  const normalized = cleanText(value || 'active', 24).toLowerCase();
  return normalized === 'hidden' ? 'hidden' : 'active';
}

function cleanFeatured(value) {
  return value === true || value === 1 || value === 'true' || value === '1';
}

function cleanFeaturedAt(value) {
  const text = cleanText(value || '', 48);
  if (!text) return '';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function cleanReviewNote(value) {
  return cleanText(value || '', MAX_REVIEW_NOTE_LENGTH);
}

function cleanAdminName(value) {
  return cleanText(value || '', MAX_ADMIN_NAME_LENGTH);
}

function cleanAdminRole(value) {
  const normalized = cleanText(value || 'admin', MAX_ADMIN_ROLE_LENGTH).toLowerCase();
  return ['admin', 'moderator', 'curator', 'viewer'].includes(normalized) ? normalized : 'admin';
}

function cleanSort(value) {
  const normalized = cleanText(value || 'updated', 32).toLowerCase();
  return ['updated', 'title', 'objects', 'components', 'scripts'].includes(normalized) ? normalized : 'updated';
}

function cleanPage(value) {
  return Math.max(Number.parseInt(value, 10) || 1, 1);
}

function cleanLimit(value, fallback = 24) {
  return Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), 50);
}

function cleanAdminFilter(value) {
  const normalized = cleanText(value || 'all', 32).toLowerCase();
  return ['all', 'listed', 'unlisted', 'hidden', 'featured', 'owner-managed'].includes(normalized) ? normalized : 'all';
}

function cleanAdminSort(value) {
  const normalized = cleanText(value || 'updated', 32).toLowerCase();
  return ['updated', 'featured', 'title', 'objects', 'components', 'scripts'].includes(normalized) ? normalized : 'updated';
}

function cleanCreator(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const website = cleanText(source.website || source.url || '', MAX_CREATOR_URL_LENGTH);
  let cleanWebsite = '';
  if (website) {
    try {
      const parsed = new URL(website);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') cleanWebsite = parsed.href.slice(0, MAX_CREATOR_URL_LENGTH);
    } catch {}
  }
  return {
    name: cleanText(source.name || source.displayName || '', MAX_CREATOR_LENGTH),
    website: cleanWebsite,
  };
}

function isListVisible(record) {
  return record && cleanVisibility(record.visibility) === 'public' && cleanModerationStatus(record.moderationStatus) === 'active';
}

function recordMetadata(record) {
  const auditTrail = Array.isArray(record.auditTrail) ? record.auditTrail : [];
  const lastAudit = auditTrail[auditTrail.length - 1] || null;
  return {
    slug: record.slug,
    title: record.title,
    description: cleanText(record.description, 180),
    tags: Array.isArray(record.tags) ? record.tags.slice(0, MAX_TAGS) : [],
    objects: record.objects,
    commands: record.commands,
    scripts: record.scripts,
    components: record.components,
    updatedAt: record.updatedAt,
    ownerManaged: !!record.ownerHash,
    creatorName: record.creator?.name || '',
    visibility: record.visibility,
    moderationStatus: record.moderationStatus,
    featured: !!record.featured,
    featuredAt: record.featuredAt || '',
    auditCount: auditTrail.length,
    lastAdminAction: Array.isArray(lastAudit?.fields) ? lastAudit.fields.join(', ') : (lastAudit?.action || ''),
    lastAdminActionAt: lastAudit?.at || '',
    lastAdminNote: lastAudit?.note || '',
    lastAdminActor: lastAudit?.adminName || lastAudit?.actor || '',
    lastAdminRole: lastAudit?.adminRole || '',
  };
}

function keyForSlug(slug) {
  return GAME_PREFIX + slug;
}

function pathParts(params) {
  const value = params?.path;
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : String(value).split('/').filter(Boolean);
}

function bytes(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

function cleanAuditTrail(record) {
  return Array.isArray(record?.auditTrail) ? record.auditTrail.filter(Boolean).slice(-MAX_AUDIT_EVENTS) : [];
}

function cleanAuditLimit(value) {
  return Math.min(Math.max(Number.parseInt(value, 10) || 24, 1), MAX_AUDIT_EVENTS);
}

function cleanToken(value) {
  return String(value || '').trim().slice(0, 256);
}

function publicAdminIdentity(admin) {
  return {
    id: cleanText(admin?.id || '', 48),
    name: cleanAdminName(admin?.name || 'Admin'),
    role: cleanAdminRole(admin?.role || 'admin'),
  };
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

async function adminAuthorization(context, payload = {}) {
  const provided = cleanToken(
    context.request.headers.get('x-crate-admin-token') ||
    payload.adminToken ||
    bearerToken(context.request)
  );
  if (!provided) return null;
  const entries = adminTokenEntries(context.env);
  const match = entries.find((entry) => provided === cleanToken(entry.token));
  if (!match) return null;
  const tokenHash = await hashToken(provided);
  return {
    mode: 'admin',
    admin: publicAdminIdentity({
      id: `admin-${tokenHash.slice(0, 12)}`,
      name: cleanAdminName(match.name || 'Admin'),
      role: cleanAdminRole(match.role || 'admin'),
    }),
  };
}

async function isAdminRequest(context, payload = {}) {
  return !!(await adminAuthorization(context, payload));
}

function adminRoleCanChange(admin, field) {
  const role = cleanAdminRole(admin?.role || 'admin');
  if (role === 'admin') return true;
  if (role === 'moderator') return field === 'visibility' || field === 'moderationStatus';
  if (role === 'curator') return field === 'featured';
  return false;
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanAuditEvent(entry = {}, index = 0) {
  const changes = safeJsonArray(entry.changes || entry.changesJson || entry.changes_json);
  const fields = Array.isArray(entry.fields) ? entry.fields : safeJsonArray(entry.fieldsJson || entry.fields_json);
  return {
    id: cleanText(entry.id || `${entry.at || 'audit'}-${index}`, 96),
    at: cleanText(entry.at || '', 48),
    actor: cleanText(entry.actor || 'admin', 32),
    adminId: cleanText(entry.adminId || entry.admin_id || '', 64),
    adminName: cleanAdminName(entry.adminName || entry.admin_name || 'Admin'),
    adminRole: cleanAdminRole(entry.adminRole || entry.admin_role || 'admin'),
    action: cleanText(entry.action || 'published-game-moderation', 80),
    fields: fields.map((field) => cleanText(field, 40)).filter(Boolean),
    changes: changes.map((change) => ({
      field: cleanText(change?.field || '', 40),
      before: cleanText(change?.before ?? '', 80),
      after: cleanText(change?.after ?? '', 80),
    })).filter((change) => change.field),
    note: cleanReviewNote(entry.note || ''),
  };
}

function auditEventsFromRecord(record, limit = 24) {
  const events = Array.isArray(record?.auditTrail) ? record.auditTrail.filter(Boolean) : [];
  return events
    .map((entry, index) => cleanAuditEvent(entry, index))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}

async function ensureAuditSchema(db) {
  if (!db?.prepare) return false;
  await db.prepare(`CREATE TABLE IF NOT EXISTS moderation_audit (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    at TEXT NOT NULL,
    actor TEXT,
    admin_id TEXT,
    admin_name TEXT,
    admin_role TEXT,
    action TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    changes_json TEXT NOT NULL,
    note TEXT,
    title TEXT,
    visibility TEXT,
    moderation_status TEXT,
    featured INTEGER DEFAULT 0
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_moderation_audit_slug_at ON moderation_audit (slug, at DESC)').run();
  return true;
}

async function persistModerationAudit(context, record, entry, index = 0) {
  const db = getAuditStore(context.env);
  if (!db?.prepare || !record?.slug || !entry) return { ok: false, source: 'kv-only' };
  const clean = cleanAuditEvent(entry, 0);
  await ensureAuditSchema(db);
  const rawId = cleanText(entry.id || '', 96);
  const id = rawId || `${record.slug}:${clean.at || 'unknown'}:${index}:${clean.fields.join('-') || clean.action}`;
  await db.prepare(`INSERT OR REPLACE INTO moderation_audit
    (id, slug, at, actor, admin_id, admin_name, admin_role, action, fields_json, changes_json, note, title, visibility, moderation_status, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      record.slug,
      clean.at,
      clean.actor,
      clean.adminId,
      clean.adminName,
      clean.adminRole,
      clean.action,
      JSON.stringify(clean.fields),
      JSON.stringify(clean.changes),
      clean.note,
      cleanText(record.title || record.slug, MAX_TITLE_LENGTH),
      cleanVisibility(record.visibility),
      cleanModerationStatus(record.moderationStatus),
      record.featured ? 1 : 0
    ).run();
  return { ok: true, source: 'd1' };
}

async function auditEventsFromD1(context, slug, limit) {
  const db = getAuditStore(context.env);
  if (!db?.prepare) return null;
  await ensureAuditSchema(db);
  const result = await db.prepare(`SELECT id, at, actor, admin_id, admin_name, admin_role, action, fields_json, changes_json, note
    FROM moderation_audit
    WHERE slug = ?
    ORDER BY at DESC
    LIMIT ?`)
    .bind(slug, limit)
    .all();
  return (result?.results || []).map((row, index) => cleanAuditEvent(row, index));
}

async function authorizeManagedGame(context, record, payload = {}) {
  const adminAuth = await adminAuthorization(context, payload);
  if (adminAuth) return { ok: true, mode: 'admin', admin: adminAuth.admin };
  if (!record?.ownerHash) {
    return { ok: false, status: 403, error: 'This published game has no owner token. Admin authorization is required.' };
  }
  const providedOwnerToken = cleanToken(context.request.headers.get('x-crate-owner-token') || payload.ownerToken || '');
  if (!providedOwnerToken) {
    return { ok: false, status: 403, error: 'Owner token required for this published game.' };
  }
  const providedHash = await hashToken(providedOwnerToken);
  if (providedHash !== record.ownerHash) {
    return { ok: false, status: 403, error: 'Owner token does not match this published game.' };
  }
  return { ok: true, mode: 'owner' };
}

async function readJson(request) {
  const text = await request.text();
  if (bytes(text) > MAX_BODY_BYTES) {
    const err = new Error('Published game payload is too large for the current web publish endpoint.');
    err.status = 413;
    throw err;
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    const err = new Error('Request body must be valid JSON.');
    err.status = 400;
    throw err;
  }
}

function summarizeProject(projectData) {
  try {
    const parsed = JSON.parse(projectData);
    const objects = Array.isArray(parsed.objects) ? parsed.objects : [];
    return {
      format: parsed.format || '',
      objects: objects.length,
      commands: Array.isArray(parsed.commands) ? parsed.commands.length : 0,
      scripts: Array.isArray(parsed.userScripts) ? parsed.userScripts.length : 0,
      components: objects.reduce((sum, obj) => sum + Object.keys(obj?.components || {}).length, 0),
    };
  } catch {
    return { format: '', objects: 0, commands: 0, scripts: 0, components: 0 };
  }
}

function publicGameSummary(record) {
  const creator = cleanCreator(record.creator);
  return {
    format: record.format,
    version: record.version,
    slug: record.slug,
    title: record.title,
    description: record.description,
    tags: record.tags,
    url: record.url,
    objects: record.objects,
    commands: record.commands,
    scripts: record.scripts,
    components: record.components,
    componentTypes: record.componentTypes,
    assetBaseUrl: record.assetBaseUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: record.source,
    ownerManaged: !!record.ownerHash,
    creatorName: creator.name,
    creatorUrl: creator.website,
    visibility: cleanVisibility(record.visibility),
    moderationStatus: cleanModerationStatus(record.moderationStatus),
    featured: !!record.featured,
    featuredAt: record.featuredAt || '',
  };
}

function publicGameDetails(record) {
  return {
    ...publicGameSummary(record),
    sceneData: record.sceneData,
    projectData: record.projectData,
    playable: record.playable,
  };
}

async function publishGame(context) {
  const store = getStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });

  const payload = await readJson(context.request);
  const title = cleanText(payload.title || 'Untitled Game', MAX_TITLE_LENGTH) || 'Untitled Game';
  const slug = slugify(payload.slug || title);
  if (!slug || slug.length < 3) {
    return json({ ok: false, error: 'Game slug must contain at least 3 letters or numbers.' }, { status: 400 });
  }

  const projectData = typeof payload.projectData === 'string' ? payload.projectData : '';
  const sceneData = typeof payload.sceneData === 'string' ? payload.sceneData : '';
  if (!projectData && !sceneData) {
    return json({ ok: false, error: 'Published games require projectData or sceneData.' }, { status: 400 });
  }
  if (bytes(projectData) > MAX_BODY_BYTES || bytes(sceneData) > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'Published game project data is too large.' }, { status: 413 });
  }

  const existing = await store.get(keyForSlug(slug), 'json').catch(() => null);
  if (existing?.ownerHash) {
    const auth = await authorizeManagedGame(context, existing, payload);
    if (!auth.ok) return json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const ownerToken = cleanToken(payload.ownerToken || '');
  const ownerHash = ownerToken ? await hashToken(ownerToken) : (existing?.ownerHash || '');
  const creator = cleanCreator(payload.creator || {
    name: payload.creatorName,
    website: payload.creatorUrl || payload.creatorWebsite,
  });
  const projectSummary = projectData ? summarizeProject(projectData) : {};
  const now = new Date().toISOString();
  const origin = new URL(context.request.url).origin;
  const record = {
    format: 'crate-cloud-published-game',
    version: 1,
    slug,
    title,
    description: cleanText(payload.description, MAX_DESCRIPTION_LENGTH),
    tags: cleanTags(payload.tags),
    sceneData,
    projectData,
    url: `${origin}/play?published=${encodeURIComponent(slug)}`,
    objects: Number(projectSummary.objects || payload.objects) || 0,
    commands: Number(projectSummary.commands || payload.commands) || 0,
    scripts: Number(projectSummary.scripts || payload.scripts) || 0,
    components: Number(projectSummary.components || payload.components) || 0,
    componentTypes: payload.componentTypes && typeof payload.componentTypes === 'object' ? payload.componentTypes : {},
    playable: payload.playable && typeof payload.playable === 'object' ? {
      format: payload.playable.format || '',
      filename: payload.playable.filename || '',
      htmlBytes: Number(payload.playable.htmlBytes) || 0,
      crateBytes: Number(payload.playable.crateBytes) || 0,
    } : null,
    assetBaseUrl: payload.assetBaseUrl || 'https://crateship-games-assets.pages.dev',
    source: 'cloudflare-pages-kv',
    ownerHash,
    creator: creator.name || creator.website ? creator : (existing?.creator || { name: '', website: '' }),
    visibility: cleanVisibility(payload.visibility || existing?.visibility || 'public'),
    moderationStatus: cleanModerationStatus(existing?.moderationStatus || 'active'),
    featured: !!existing?.featured,
    featuredAt: existing?.featuredAt || '',
    auditTrail: cleanAuditTrail(existing),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await store.put(keyForSlug(slug), JSON.stringify(record), {
    metadata: recordMetadata(record),
  });

  return json({ ok: true, game: publicGameSummary(record), url: record.url });
}

async function getGame(context, slug) {
  const store = getStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });
  const cleanSlug = slugify(slug);
  if (!cleanSlug) return json({ ok: false, error: 'Missing game slug.' }, { status: 400 });
  const record = await store.get(keyForSlug(cleanSlug), 'json');
  if (!record) return json({ ok: false, error: 'Game not found.' }, { status: 404 });
  if (cleanModerationStatus(record.moderationStatus) === 'hidden') {
    const auth = await authorizeManagedGame(context, record);
    if (!auth.ok) return json({ ok: false, error: 'Game not found.' }, { status: 404 });
  }
  return json({ ok: true, game: publicGameDetails(record) }, { cacheControl: 'public, max-age=30' });
}

async function listGames(context) {
  const store = getStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });
  const url = new URL(context.request.url);
  const requestedSlug = slugify(url.searchParams.get('slug') || '');
  const query = cleanText(url.searchParams.get('q') || '', 80).toLowerCase();
  const tag = cleanText(url.searchParams.get('tag') || '', 36).toLowerCase();
  const sort = cleanSort(url.searchParams.get('sort') || 'updated');
  if (requestedSlug) {
    const record = await store.get(keyForSlug(requestedSlug), 'json');
    const games = record && cleanModerationStatus(record.moderationStatus) !== 'hidden' ? [publicGameSummary(record)] : [];
    return json({
      ok: true,
      games,
      tags: Array.from(new Set(games.flatMap((game) => Array.isArray(game.tags) ? game.tags : []))).sort(),
      sort,
      query,
      tag,
      page: 1,
      pageSize: games.length || 1,
      total: games.length,
      pages: 1,
      hasNext: false,
      hasPrev: false,
      cursor: null,
      listComplete: true,
    });
  }
  const limit = cleanLimit(url.searchParams.get('limit'), 24);
  const requestedPage = cleanPage(url.searchParams.get('page'));
  const keys = [];
  let cursor = '';
  let listComplete = true;
  do {
    const batch = await store.list({
      prefix: GAME_PREFIX,
      limit: Math.min(1000, MAX_LIST_SCAN - keys.length),
      ...(cursor ? { cursor } : {}),
    });
    keys.push(...batch.keys);
    cursor = batch.cursor || '';
    listComplete = !!batch.list_complete || !cursor;
  } while (!listComplete && keys.length < MAX_LIST_SCAN);

  const visibleGames = keys
    .filter((key) => cleanVisibility(key.metadata?.visibility) === 'public' && cleanModerationStatus(key.metadata?.moderationStatus) === 'active')
    .map((key) => ({
      slug: key.metadata?.slug || key.name.replace(GAME_PREFIX, ''),
      title: key.metadata?.title || key.name.replace(GAME_PREFIX, ''),
      description: key.metadata?.description || '',
      tags: Array.isArray(key.metadata?.tags) ? key.metadata.tags : [],
      objects: Number(key.metadata?.objects) || 0,
      commands: Number(key.metadata?.commands) || 0,
      scripts: Number(key.metadata?.scripts) || 0,
      components: Number(key.metadata?.components) || 0,
      updatedAt: key.metadata?.updatedAt || '',
      url: `${url.origin}/play?published=${encodeURIComponent(key.metadata?.slug || key.name.replace(GAME_PREFIX, ''))}`,
      source: 'cloudflare-pages-kv',
      ownerManaged: !!key.metadata?.ownerManaged,
      creatorName: key.metadata?.creatorName || '',
      visibility: cleanVisibility(key.metadata?.visibility),
      moderationStatus: cleanModerationStatus(key.metadata?.moderationStatus),
      featured: !!key.metadata?.featured,
      featuredAt: key.metadata?.featuredAt || '',
    }));
  const availableTags = Array.from(new Set(visibleGames.flatMap((game) => Array.isArray(game.tags) ? game.tags : []))).sort();
  const filteredGames = visibleGames
    .filter((game) => {
      if (tag && !(Array.isArray(game.tags) && game.tags.includes(tag))) return false;
      if (!query) return true;
      return [game.title, game.slug, game.description, game.creatorName, ...(Array.isArray(game.tags) ? game.tags : [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (sort === 'title') return String(a.title).localeCompare(String(b.title));
      if (sort === 'objects') return (Number(b.objects) || 0) - (Number(a.objects) || 0);
      if (sort === 'components') return (Number(b.components) || 0) - (Number(a.components) || 0);
      if (sort === 'scripts') return (Number(b.scripts) || 0) - (Number(a.scripts) || 0);
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
  const total = filteredGames.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, pages);
  const offset = (page - 1) * limit;
  const games = filteredGames.slice(offset, offset + limit);
  return json({
    ok: true,
    games,
    tags: availableTags,
    sort,
    query,
    tag,
    page,
    pageSize: limit,
    total,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
    cursor: listComplete ? null : cursor,
    listComplete,
    scanLimit: MAX_LIST_SCAN,
  });
}

async function backfillAdminAudit(context) {
  const store = getStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });
  const adminAuth = await adminAuthorization(context);
  if (!adminAuth) {
    return json({ ok: false, error: 'Admin authorization is required to backfill moderation audit history.' }, { status: 403 });
  }
  if (cleanAdminRole(adminAuth.admin?.role) !== 'admin') {
    return json({ ok: false, error: 'Only admin role can backfill moderation audit history.' }, { status: 403 });
  }
  const db = getAuditStore(context.env);
  if (!db?.prepare) return json({ ok: false, error: 'CRATE_AUDIT D1 binding is not configured.' }, { status: 503 });
  await ensureAuditSchema(db);

  const url = new URL(context.request.url);
  const limit = cleanLimit(url.searchParams.get('limit'), 50);
  const cursorParam = cleanText(url.searchParams.get('cursor') || '', 512);
  const dryRun = url.searchParams.get('dryRun') === 'true';
  const batch = await store.list({
    prefix: GAME_PREFIX,
    limit,
    ...(cursorParam ? { cursor: cursorParam } : {}),
  });

  let scanned = 0;
  let auditEvents = 0;
  let written = 0;
  const games = [];
  for (const key of batch.keys || []) {
    const slug = key.name.replace(GAME_PREFIX, '');
    const record = await store.get(key.name, 'json');
    scanned += 1;
    const events = Array.isArray(record?.auditTrail) ? record.auditTrail.filter(Boolean) : [];
    auditEvents += events.length;
    games.push({ slug, events: events.length });
    if (dryRun) continue;
    for (let index = 0; index < events.length; index += 1) {
      await persistModerationAudit(context, record, events[index], index);
      written += 1;
    }
  }

  return json({
    ok: true,
    admin: adminAuth.admin,
    scanned,
    auditEvents,
    written,
    dryRun,
    games,
    cursor: batch.list_complete ? null : batch.cursor || null,
    listComplete: !!batch.list_complete || !batch.cursor,
    source: 'kv-to-d1',
  });
}

async function verifyAdminAuditStore(context) {
  const adminAuth = await adminAuthorization(context);
  if (!adminAuth) {
    return json({ ok: false, error: 'Admin authorization is required to verify moderation audit storage.' }, { status: 403 });
  }
  if (cleanAdminRole(adminAuth.admin?.role) !== 'admin') {
    return json({ ok: false, error: 'Only admin role can verify moderation audit storage.' }, { status: 403 });
  }
  const db = getAuditStore(context.env);
  if (!db?.prepare) return json({ ok: false, error: 'CRATE_AUDIT D1 binding is not configured.' }, { status: 503 });
  await ensureAuditSchema(db);

  const now = new Date().toISOString();
  const probeId = `audit-probe:${crypto.randomUUID()}`;
  const probeSlug = '__audit_probe__';
  let inserted = false;
  let deleted = false;

  try {
    await db.prepare(`INSERT OR REPLACE INTO moderation_audit
      (id, slug, at, actor, admin_id, admin_name, admin_role, action, fields_json, changes_json, note, title, visibility, moderation_status, featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        probeId,
        probeSlug,
        now,
        'admin',
        adminAuth.admin?.id || '',
        adminAuth.admin?.name || 'Admin',
        adminAuth.admin?.role || 'admin',
        'audit-storage-probe',
        JSON.stringify(['d1']),
        JSON.stringify([{ field: 'd1', before: 'unverified', after: 'verified' }]),
        'Temporary audit storage probe.',
        'Audit storage probe',
        'unlisted',
        'hidden',
        0
      ).run();

    const row = await db.prepare('SELECT id, slug, action FROM moderation_audit WHERE id = ?')
      .bind(probeId)
      .first();
    inserted = row?.id === probeId && row?.slug === probeSlug && row?.action === 'audit-storage-probe';
  } finally {
    try {
      await db.prepare('DELETE FROM moderation_audit WHERE id = ?').bind(probeId).run();
      const remaining = await db.prepare('SELECT id FROM moderation_audit WHERE id = ?').bind(probeId).first();
      deleted = !remaining;
    } catch (err) {}
  }

  const writeVerified = inserted && deleted;
  return json({
    ok: writeVerified,
    admin: adminAuth.admin,
    source: 'd1',
    mode: 'temporary-probe',
    probeSlug,
    inserted,
    deleted,
    writeVerified,
  }, writeVerified ? {} : { status: 500 });
}

function adminGameFromMetadata(key, origin) {
  const slug = key.metadata?.slug || key.name.replace(GAME_PREFIX, '');
  const visibility = cleanVisibility(key.metadata?.visibility);
  const moderationStatus = cleanModerationStatus(key.metadata?.moderationStatus);
  return {
    slug,
    title: key.metadata?.title || slug,
    description: key.metadata?.description || '',
    tags: Array.isArray(key.metadata?.tags) ? key.metadata.tags : [],
    objects: Number(key.metadata?.objects) || 0,
    commands: Number(key.metadata?.commands) || 0,
    scripts: Number(key.metadata?.scripts) || 0,
    components: Number(key.metadata?.components) || 0,
    updatedAt: key.metadata?.updatedAt || '',
    url: `${origin}/play?published=${encodeURIComponent(slug)}`,
    source: 'cloudflare-pages-kv',
    ownerManaged: !!key.metadata?.ownerManaged,
    creatorName: key.metadata?.creatorName || '',
    visibility,
    moderationStatus,
    featured: !!key.metadata?.featured,
    featuredAt: key.metadata?.featuredAt || '',
    auditCount: Number(key.metadata?.auditCount) || 0,
    lastAdminAction: key.metadata?.lastAdminAction || '',
    lastAdminActionAt: key.metadata?.lastAdminActionAt || '',
    lastAdminNote: key.metadata?.lastAdminNote || '',
    lastAdminActor: key.metadata?.lastAdminActor || '',
    lastAdminRole: key.metadata?.lastAdminRole || '',
  };
}

function adminAuditGameSummary(record, origin) {
  return {
    slug: record.slug || '',
    title: record.title || record.slug || 'Untitled Game',
    visibility: cleanVisibility(record.visibility),
    moderationStatus: cleanModerationStatus(record.moderationStatus),
    featured: !!record.featured,
    updatedAt: record.updatedAt || '',
    url: `${origin}/play?published=${encodeURIComponent(record.slug || '')}`,
  };
}

function adminCounts(games) {
  return {
    total: games.length,
    listed: games.filter((game) => game.visibility === 'public' && game.moderationStatus === 'active').length,
    unlisted: games.filter((game) => game.visibility === 'unlisted').length,
    hidden: games.filter((game) => game.moderationStatus === 'hidden').length,
    featured: games.filter((game) => game.featured).length,
    ownerManaged: games.filter((game) => game.ownerManaged).length,
  };
}

function matchesAdminFilter(game, filter) {
  if (filter === 'listed') return game.visibility === 'public' && game.moderationStatus === 'active';
  if (filter === 'unlisted') return game.visibility === 'unlisted';
  if (filter === 'hidden') return game.moderationStatus === 'hidden';
  if (filter === 'featured') return !!game.featured;
  if (filter === 'owner-managed') return !!game.ownerManaged;
  return true;
}

async function listAdminGames(context) {
  const store = getStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });
  const adminAuth = await adminAuthorization(context);
  if (!adminAuth) {
    return json({ ok: false, error: 'Admin authorization is required to view published-game moderation.' }, { status: 403 });
  }

  const url = new URL(context.request.url);
  const query = cleanText(url.searchParams.get('q') || '', 80).toLowerCase();
  const filter = cleanAdminFilter(url.searchParams.get('filter') || 'all');
  const sort = cleanAdminSort(url.searchParams.get('sort') || 'updated');
  const limit = cleanLimit(url.searchParams.get('limit'), 50);
  const requestedPage = cleanPage(url.searchParams.get('page'));
  const keys = [];
  let cursor = '';
  let listComplete = true;
  do {
    const batch = await store.list({
      prefix: GAME_PREFIX,
      limit: Math.min(1000, MAX_LIST_SCAN - keys.length),
      ...(cursor ? { cursor } : {}),
    });
    keys.push(...batch.keys);
    cursor = batch.cursor || '';
    listComplete = !!batch.list_complete || !cursor;
  } while (!listComplete && keys.length < MAX_LIST_SCAN);

  const allGames = keys.map((key) => adminGameFromMetadata(key, url.origin));
  const counts = adminCounts(allGames);
  const filteredGames = allGames
    .filter((game) => matchesAdminFilter(game, filter))
    .filter((game) => {
      if (!query) return true;
      return [game.title, game.slug, game.description, game.creatorName, game.visibility, game.moderationStatus, ...(Array.isArray(game.tags) ? game.tags : [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (sort === 'featured') {
        const af = a.featured ? 1 : 0;
        const bf = b.featured ? 1 : 0;
        if (af !== bf) return bf - af;
        return String(b.featuredAt || b.updatedAt || '').localeCompare(String(a.featuredAt || a.updatedAt || ''));
      }
      if (sort === 'title') return String(a.title).localeCompare(String(b.title));
      if (sort === 'objects') return (Number(b.objects) || 0) - (Number(a.objects) || 0);
      if (sort === 'components') return (Number(b.components) || 0) - (Number(a.components) || 0);
      if (sort === 'scripts') return (Number(b.scripts) || 0) - (Number(a.scripts) || 0);
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });

  const total = filteredGames.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, pages);
  const offset = (page - 1) * limit;
  const games = filteredGames.slice(offset, offset + limit);
  return json({
    ok: true,
    admin: adminAuth.admin,
    games,
    counts,
    query,
    filter,
    sort,
    page,
    pageSize: limit,
    total,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
    cursor: listComplete ? null : cursor,
    listComplete,
    scanLimit: MAX_LIST_SCAN,
  });
}

async function getAdminAudit(context, slug) {
  const store = getStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });
  const adminAuth = await adminAuthorization(context);
  if (!adminAuth) {
    return json({ ok: false, error: 'Admin authorization is required to view published-game audit history.' }, { status: 403 });
  }

  const cleanSlug = slugify(slug);
  if (!cleanSlug) return json({ ok: false, error: 'Missing game slug.' }, { status: 400 });
  const record = await store.get(keyForSlug(cleanSlug), 'json');
  if (!record) return json({ ok: false, error: 'Game not found.' }, { status: 404 });

  const url = new URL(context.request.url);
  const limit = cleanAuditLimit(url.searchParams.get('limit'));
  let events = null;
  let source = 'kv-record';
  let d1Available = false;
  try {
    const d1Events = await auditEventsFromD1(context, cleanSlug, limit);
    if (Array.isArray(d1Events)) {
      d1Available = true;
      if (d1Events.length) {
        events = d1Events;
        source = 'd1';
      }
    }
  } catch (err) {
    source = 'kv-record';
  }
  if (!events) events = auditEventsFromRecord(record, limit);

  return json({
    ok: true,
    admin: adminAuth.admin,
    game: adminAuditGameSummary(record, url.origin),
    events,
    total: events.length,
    source,
    d1Available,
    retentionLimit: MAX_AUDIT_EVENTS,
  });
}

async function updateGame(context, slug) {
  const store = getStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });
  const cleanSlug = slugify(slug);
  if (!cleanSlug) return json({ ok: false, error: 'Missing game slug.' }, { status: 400 });
  const key = keyForSlug(cleanSlug);
  const record = await store.get(key, 'json');
  if (!record) return json({ ok: false, error: 'Game not found.' }, { status: 404 });
  const payload = await readJson(context.request);
  const auth = await authorizeManagedGame(context, record, payload);
  if (!auth.ok) return json({ ok: false, error: auth.error }, { status: auth.status });

  const beforeAdminFields = {
    visibility: cleanVisibility(record.visibility),
    moderationStatus: cleanModerationStatus(record.moderationStatus),
    featured: !!record.featured,
  };
  const reviewNote = cleanReviewNote(payload.reviewNote || payload.reason || payload.note || '');
  const now = new Date().toISOString();

  if (payload.title != null) record.title = cleanText(payload.title, MAX_TITLE_LENGTH) || record.title;
  if (payload.description != null) record.description = cleanText(payload.description, MAX_DESCRIPTION_LENGTH);
  if (payload.tags != null) record.tags = cleanTags(payload.tags);
  if (payload.visibility != null) record.visibility = cleanVisibility(payload.visibility);
  if (payload.creator != null || payload.creatorName != null || payload.creatorUrl != null || payload.creatorWebsite != null) {
    record.creator = cleanCreator(payload.creator || {
      name: payload.creatorName,
      website: payload.creatorUrl || payload.creatorWebsite,
    });
  }
  if (payload.moderationStatus != null) {
    if (auth.mode !== 'admin') {
      return json({ ok: false, error: 'Admin authorization is required to change moderation status.' }, { status: 403 });
    }
    record.moderationStatus = cleanModerationStatus(payload.moderationStatus);
  } else {
    record.moderationStatus = cleanModerationStatus(record.moderationStatus);
  }
  if (payload.featured != null) {
    if (auth.mode !== 'admin') {
      return json({ ok: false, error: 'Admin authorization is required to feature games.' }, { status: 403 });
    }
    record.featured = cleanFeatured(payload.featured);
    record.featuredAt = record.featured ? (cleanFeaturedAt(payload.featuredAt) || record.featuredAt || now) : '';
  } else {
    record.featured = !!record.featured;
    record.featuredAt = record.featuredAt || '';
  }
  record.visibility = cleanVisibility(record.visibility);
  let moderationAuditEntry = null;
  if (auth.mode === 'admin') {
    const afterAdminFields = {
      visibility: cleanVisibility(record.visibility),
      moderationStatus: cleanModerationStatus(record.moderationStatus),
      featured: !!record.featured,
    };
    const changes = Object.keys(beforeAdminFields)
      .filter((field) => beforeAdminFields[field] !== afterAdminFields[field])
      .map((field) => ({ field, before: beforeAdminFields[field], after: afterAdminFields[field] }));
    if (changes.length) {
      const denied = changes.find((change) => !adminRoleCanChange(auth.admin, change.field));
      if (denied) {
        return json({ ok: false, error: `Admin role ${auth.admin?.role || 'viewer'} cannot change ${denied.field}.` }, { status: 403 });
      }
      record.auditTrail = cleanAuditTrail(record);
      moderationAuditEntry = {
        id: `${cleanSlug}:${now}:${changes.map((change) => change.field).join('-')}`,
        at: now,
        actor: 'admin',
        adminId: auth.admin?.id || '',
        adminName: auth.admin?.name || 'Admin',
        adminRole: auth.admin?.role || 'admin',
        action: 'published-game-moderation',
        fields: changes.map((change) => change.field),
        changes,
        note: reviewNote,
      };
      record.auditTrail.push(moderationAuditEntry);
    } else {
      record.auditTrail = cleanAuditTrail(record);
    }
  } else {
    record.auditTrail = cleanAuditTrail(record);
  }
  record.updatedAt = now;

  await store.put(key, JSON.stringify(record), {
    metadata: recordMetadata(record),
  });
  if (moderationAuditEntry) {
    try {
      await persistModerationAudit(context, record, moderationAuditEntry);
    } catch (err) {}
  }

  return json({ ok: true, game: publicGameSummary(record), authorization: auth.mode, admin: auth.mode === 'admin' ? auth.admin : null });
}

async function deleteGame(context, slug) {
  const store = getStore(context.env);
  if (!store) return json({ ok: false, error: 'CRATE_GAMES KV binding is not configured.' }, { status: 503 });
  const cleanSlug = slugify(slug);
  if (!cleanSlug) return json({ ok: false, error: 'Missing game slug.' }, { status: 400 });
  const key = keyForSlug(cleanSlug);
  const record = await store.get(key, 'json');
  if (!record) return json({ ok: false, error: 'Game not found.' }, { status: 404 });
  const auth = await authorizeManagedGame(context, record);
  if (!auth.ok) return json({ ok: false, error: auth.error }, { status: auth.status });
  await store.delete(key);
  return json({ ok: true, deleted: true, slug: cleanSlug, authorization: auth.mode });
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const parts = pathParts(context.params);
    if (context.request.method === 'POST' && parts.length === 1 && parts[0] === 'publish') {
      return publishGame(context);
    }
    if (context.request.method === 'GET' && parts.length === 2 && parts[0] === 'admin' && parts[1] === 'list') {
      return listAdminGames(context);
    }
    if (context.request.method === 'GET' && parts.length === 3 && parts[0] === 'admin' && parts[1] === 'audit') {
      return getAdminAudit(context, parts[2]);
    }
    if (context.request.method === 'POST' && parts.length === 3 && parts[0] === 'admin' && parts[1] === 'audit' && parts[2] === 'verify') {
      return verifyAdminAuditStore(context);
    }
    if (context.request.method === 'POST' && parts.length === 3 && parts[0] === 'admin' && parts[1] === 'audit' && parts[2] === 'backfill') {
      return backfillAdminAudit(context);
    }
    if (context.request.method === 'GET' && parts.length === 0) {
      return listGames(context);
    }
    if (context.request.method === 'GET' && parts.length === 1) {
      return getGame(context, parts[0]);
    }
    if (context.request.method === 'PATCH' && parts.length === 1) {
      return updateGame(context, parts[0]);
    }
    if (context.request.method === 'DELETE' && parts.length === 1) {
      return deleteGame(context, parts[0]);
    }
    return json({ ok: false, error: 'Not found.' }, { status: 404 });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Game API failed.' }, { status: err.status || 500 });
  }
}
