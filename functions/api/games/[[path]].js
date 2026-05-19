const MAX_BODY_BYTES = 900000;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1200;
const MAX_CREATOR_LENGTH = 80;
const MAX_CREATOR_URL_LENGTH = 220;
const MAX_TAGS = 12;
const MAX_LIST_SCAN = 1000;
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

function cleanToken(value) {
  return String(value || '').trim().slice(0, 256);
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

async function isAdminRequest(context, payload = {}) {
  const expected = cleanToken(context.env.CRATE_GAMES_ADMIN_TOKEN || context.env.CRATE_ADMIN_TOKEN || '');
  if (!expected) return false;
  const provided = cleanToken(
    context.request.headers.get('x-crate-admin-token') ||
    payload.adminToken ||
    bearerToken(context.request)
  );
  return !!provided && provided === expected;
}

async function authorizeManagedGame(context, record, payload = {}) {
  if (await isAdminRequest(context, payload)) return { ok: true, mode: 'admin' };
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
    record.featuredAt = record.featured ? (cleanFeaturedAt(payload.featuredAt) || record.featuredAt || new Date().toISOString()) : '';
  } else {
    record.featured = !!record.featured;
    record.featuredAt = record.featuredAt || '';
  }
  record.visibility = cleanVisibility(record.visibility);
  record.updatedAt = new Date().toISOString();

  await store.put(key, JSON.stringify(record), {
    metadata: recordMetadata(record),
  });

  return json({ ok: true, game: publicGameSummary(record), authorization: auth.mode });
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
