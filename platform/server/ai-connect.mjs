// AI app connections. People connect the AI they already use (Claude on a Pro/Max plan,
// ChatGPT, Cursor, VS Code, Claude Code, or anything that speaks MCP, on a subscription
// or an API key) to https://<site>/mcp. Nothing here calls a model or needs a platform key.
//
// - /mcp is a Streamable HTTP MCP server. It serves both the stateless 2026-07-28 protocol
//   and the older initialize-based revisions (2025-03-26 to 2025-11-25).
// - /oauth/* is an OAuth 2.1 authorization server (PKCE S256 only) with Client ID Metadata
//   Documents and Dynamic Client Registration. Tokens are bound to the /mcp resource.
// - /api/platform/ai/* lets the signed-in editor tab link itself, pick up tool calls and
//   return results. AI apps never reach the editor directly.
import { HttpError, json, id, now, database, appOrigin, requireMutationOrigin, audit } from './common.mjs';
import { requireUser, rateLimit, tokenHash, base64url } from './identity.mjs';
import { flags, rate } from './data.mjs';
import { toolDefinitions, validArguments, validResult, resultContent, MUTATING_COMMANDS, EDITOR_PROTOCOL } from '../../integrations/editor/contracts.mjs';
import starterLibrary from '../../starter-library/catalog.mjs';

export const MODERN_VERSION = '2026-07-28';
export const LEGACY_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26']);
export const SUPPORTED_VERSIONS = Object.freeze([MODERN_VERSION, ...LEGACY_VERSIONS]);
const SCOPE = 'editor', ACCESS_TTL = 3600, REFRESH_TTL = 30 * 86400, CODE_TTL = 600;
const LINK_FRESH_SECONDS = 30, COMMAND_TTL = 45, WAIT_MS = 40000, MAX_RESULT_BYTES = 512 * 1024, LONG_POLL_MS = 8000;
const SERVER_INFO = { name: 'crateship-games', title: 'Crate Ship Games', version: '1.0.0' };
const LIBRARY = new Map(starterLibrary.map(model => [model.path.toLowerCase(), model]));
const INSTRUCTIONS = [
  'You are connected to the Crate Ship Games browser game engine, in the user\'s own open editor tab.',
  'Start with editor_status. If no editor is open, ask the user to open the editor and turn on "Let AI apps build here".',
  'Read the scene with get_scene before changing it, and use only IDs it returns.',
  'Build worlds with preview_world, then apply_world with the returned previewId. Place 3D models with list_library_models and add_library_model. To use your own models (made in Blender, downloaded from Poly Haven, etc.), host the .glb (an https link, or a tiny local file server such as http://127.0.0.1:PORT/model.glb when you run on the same computer) and call import_model, then place the returned asset ID with preview_world as {type:"model",assetId}.',
  'Make it playable with components through edit_objects: player (with a dynamic rigidbody), goal, hazard, checkpoint, collectible, mover. Add a camera object to follow the player.',
  'Water: give a plane object components.water ({waveHeight metres, waveLength metres, speed, choppiness 0-1, opacity, deepColor, foam}) for animated Gerstner ocean waves with foam and sky reflection. The material.color of the plane is the shallow-water colour; scale x and z set the size (up to a few hundred metres is fine). Water cannot combine with physics or gameplay components.',
  'Static customMesh art collides along its drawn outline by default, so ramps, hills and curved platforms work. Set rigidbody collider "box" on one to force a plain box. Players, moving platforms, dynamic bodies and imported models always use boxes unless you choose otherwise.',
  'You have eyes: every change (apply_world, edit_objects, set_level_settings, add_library_model, place_on_ground, undo) returns a picture framed on what changed plus automatic warnings (for example an object floating above the ground or with nothing under it). Look at every picture and fix every warning before moving on; place_on_ground fixes floating props. Run check_scene and take a game-view screenshot before you tell the user a scene is done, and describe honestly what the pictures show.',
  'Check gameplay with play_test and scripted controls to prove a level can be won. Fix what you find.',
  'Never tell the user something cannot be built. Combine what you have: primitives and customMesh outlines for anything procedural (stalls, signs, rocks, fences), components.water for oceans and lakes, add_library_model for the rigged characters, and import_model for anything made outside the editor (Blender, Poly Haven, downloads). If a capability is truly missing, say what you built instead and what the engine would need. Match the setting: no street lamps on a wild beach, trees on islands, water wherever there should be water.',
  'Speed: build large scenes in a few big recipes (up to 64 operations and 500 objects each) rather than many small calls. preview_world lists only the first 12 objects to keep replies short; apply it with the previewId.',
  'If a tool says the editor tab is out of date, ask the user to refresh the editor tab (their work is kept) and turn AI apps back on.',
  'Changes need the user to have turned on "Allow changes". Every change is one Undo step. save_project saves the result when it is good. screenshot and play_test only need the editor open.',
].join(' ');

const encoder = new TextEncoder();
const fail = (status, message, code = 'REQUEST_FAILED') => { throw new HttpError(status, message, code); };
const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async value => base64url(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const protocolOf = value => Number.isSafeInteger(value) && value > 0 && value < 1000 ? value : 0;

export function mcpResource(env) { return appOrigin(env).origin + '/mcp'; }
function metadataUrl(env) { return appOrigin(env).origin + '/.well-known/oauth-protected-resource/mcp'; }

// ---------- HTTP helpers ----------
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id', 'access-control-max-age': '600' };
function withCors(response) { const out = new Response(response.body, response); for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v); return out; }
function oauthError(status, error, description, extra = {}) {
  return withCors(new Response(JSON.stringify({ error, error_description: description }), { status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', pragma: 'no-cache', ...extra } }));
}
function rpc(body, status = 200, headers = {}) {
  return withCors(new Response(body === null ? null : JSON.stringify(body), { status,
    headers: { ...(body === null ? {} : { 'content-type': 'application/json; charset=utf-8' }), 'cache-control': 'no-store', ...headers } }));
}
const rpcError = (reqId, code, message, data) => ({ jsonrpc: '2.0', id: reqId ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });

// Canonical resource comparison: lowercase scheme/host, no trailing slash, no fragment.
function canonicalResource(value) {
  try { const u = new URL(value); if (u.hash || u.username || u.password) return null; return (u.protocol + '//' + u.host + u.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return null; }
}
function acceptsResource(env, value) {
  if (value === undefined || value === null || value === '') return true;
  const wanted = canonicalResource(value), origin = appOrigin(env).origin.toLowerCase();
  return wanted === mcpResource(env).toLowerCase() || wanted === origin;
}

// ---------- Redirect URIs and clients ----------
const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'blob:', 'ws:', 'wss:', 'ftp:', 'chrome:', 'intent:']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
export function validRedirectUri(value) {
  if (typeof value !== 'string' || value.length > 2000) return false;
  let u; try { u = new URL(value); } catch { return false; }
  if (u.hash || u.username || u.password || BLOCKED_SCHEMES.has(u.protocol)) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return LOOPBACK.has(u.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol); // private-use schemes for native apps (RFC 8252)
}
// Exact match, except loopback redirects may use any port (RFC 8252 section 7.3).
export function redirectMatches(registered, requested) {
  if (registered.includes(requested)) return true;
  let r; try { r = new URL(requested); } catch { return false; }
  if (r.protocol !== 'http:' || !LOOPBACK.has(r.hostname)) return false;
  return registered.some(value => { try { const u = new URL(value); return u.protocol === 'http:' && u.hostname === r.hostname && u.pathname === r.pathname && u.search === r.search; } catch { return false; } });
}
function isMetadataClientId(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.pathname.length > 1 && !u.hash && !u.username && !u.password && !LOOPBACK.has(u.hostname) && !/^[\d.]+$|^\[/.test(u.hostname) && u.hostname.includes('.'); } catch { return false; }
}

async function fetchClientMetadata(clientId) {
  let response;
  try { response = await fetch(clientId, { headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) }); } catch { return null; }
  if (response.status !== 200) return null;
  const reader = response.body?.getReader(); if (!reader) return null;
  const chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); return null; } chunks.push(value); }
  const doc = parse(new TextDecoder().decode(Uint8Array.from(chunks.flatMap(c => [...c]))));
  if (!doc || typeof doc !== 'object' || doc.client_id !== clientId || !Array.isArray(doc.redirect_uris) || !doc.redirect_uris.length || doc.redirect_uris.length > 20 || !doc.redirect_uris.every(validRedirectUri)) return null;
  const method = doc.token_endpoint_auth_method ?? 'none';
  if (method !== 'none') return null; // metadata-document clients here are public clients
  return { client_name: text(doc.client_name, 120) || new URL(clientId).hostname, client_uri: typeof doc.client_uri === 'string' && doc.client_uri.startsWith('https://') ? doc.client_uri.slice(0, 500) : null, redirect_uris: doc.redirect_uris };
}

export async function loadClient(env, clientId) {
  if (typeof clientId !== 'string' || !clientId || clientId.length > 500) return null;
  const db = database(env), row = await db.prepare('SELECT * FROM platform_oauth_clients WHERE client_id=?').bind(clientId).first();
  if (row && (row.kind === 'registered' || now() - row.refreshed_at < 86400)) return { ...row, redirect_uris: parse(row.redirect_uris_json, []) };
  if (!isMetadataClientId(clientId)) return null;
  const doc = await fetchClientMetadata(clientId);
  if (!doc) return null;
  await db.prepare(`INSERT INTO platform_oauth_clients(client_id,kind,client_name,client_uri,redirect_uris_json,token_endpoint_auth_method,created_at,refreshed_at)
    VALUES(?,'metadata_document',?,?,?,'none',?,?) ON CONFLICT(client_id) DO UPDATE SET client_name=excluded.client_name,client_uri=excluded.client_uri,redirect_uris_json=excluded.redirect_uris_json,refreshed_at=excluded.refreshed_at`)
    .bind(clientId, doc.client_name, doc.client_uri, JSON.stringify(doc.redirect_uris), now(), now()).run();
  return { client_id: clientId, kind: 'metadata_document', client_name: doc.client_name, client_uri: doc.client_uri, redirect_uris: doc.redirect_uris, token_endpoint_auth_method: 'none' };
}

// ---------- Discovery metadata ----------
function protectedResourceMetadata(env) {
  const origin = appOrigin(env).origin;
  return { resource: mcpResource(env), authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ['header'],
    resource_name: 'Crate Ship Games editor', resource_documentation: origin + '/settings/ai' };
}
function authorizationServerMetadata(env) {
  const origin = appOrigin(env).origin;
  return { issuer: origin, authorization_endpoint: origin + '/oauth/authorize', token_endpoint: origin + '/oauth/token',
    registration_endpoint: origin + '/oauth/register', revocation_endpoint: origin + '/oauth/revoke',
    response_types_supported: ['code'], response_modes_supported: ['query'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    scopes_supported: [SCOPE], client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true,
    service_documentation: origin + '/settings/ai' };
}

// ---------- Dynamic Client Registration (RFC 7591, kept for older clients) ----------
async function register(request, env) {
  await rateLimit(request, env, 'oauth-register', '', 30, 3600);
  const body = await readBody(request, 16384);
  const uris = body?.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 20 || !uris.every(validRedirectUri)) return oauthError(400, 'invalid_redirect_uri', 'Provide one to twenty redirect URIs that use https, a loopback http address, or an app scheme.');
  const grants = body.grant_types ?? ['authorization_code', 'refresh_token'];
  if (!Array.isArray(grants) || !grants.includes('authorization_code') || grants.some(g => !['authorization_code', 'refresh_token'].includes(g))) return oauthError(400, 'invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported.');
  if (body.response_types !== undefined && (!Array.isArray(body.response_types) || body.response_types.some(t => t !== 'code'))) return oauthError(400, 'invalid_client_metadata', 'Only the code response type is supported.');
  const method = body.token_endpoint_auth_method ?? 'none';
  if (!['none', 'client_secret_basic', 'client_secret_post'].includes(method)) return oauthError(400, 'invalid_client_metadata', 'Unsupported token endpoint authentication method.');
  const clientId = 'crate_' + randomToken(), secret = method === 'none' ? null : randomToken(), at = now();
  const name = text(body.client_name, 120) || 'AI app', clientUri = typeof body.client_uri === 'string' && body.client_uri.startsWith('https://') ? body.client_uri.slice(0, 500) : null;
  await database(env).prepare(`INSERT INTO platform_oauth_clients(client_id,kind,client_name,client_uri,redirect_uris_json,token_endpoint_auth_method,client_secret_hash,created_at,refreshed_at) VALUES(?,'registered',?,?,?,?,?,?,?)`)
    .bind(clientId, name, clientUri, JSON.stringify(uris), method, secret ? await sha256(secret) : null, at, at).run();
  return withCors(new Response(JSON.stringify({ client_id: clientId, client_id_issued_at: at, ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: name, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: method, scope: SCOPE }),
    { status: 201, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }));
}

async function readBody(request, max) {
  const length = Number(request.headers.get('content-length') || 0); if (length > max) fail(413, 'Request is too large.', 'REQUEST_TOO_LARGE');
  const raw = await request.text(); if (raw.length > max) fail(413, 'Request is too large.', 'REQUEST_TOO_LARGE');
  const type = request.headers.get('content-type') || '';
  if (/^application\/json/i.test(type)) return parse(raw, {}) || {};
  return Object.fromEntries(new URLSearchParams(raw));
}

// ---------- Authorization endpoint ----------
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Crate Ship Games</title><meta name="color-scheme" content="dark">
<style>:root{--bg:#0f1511;--panel:#172019;--line:#2b372f;--ink:#e9eee9;--muted:#9fb0a4;--accent:#ff8a3d}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif;padding:16px}
main{width:100%;max-width:460px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:28px}h1{font-size:22px;margin:0 0 6px}p{margin:10px 0;color:var(--muted)}strong{color:var(--ink)}ul{padding-left:20px;color:var(--muted)}li{margin:6px 0}
.brand{font-weight:800;letter-spacing:.02em;color:var(--accent);margin-bottom:18px}.row{display:flex;gap:10px;margin-top:22px}button{flex:1;font:inherit;font-weight:700;border-radius:10px;padding:12px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#1b0d02}code{background:#0b100c;padding:2px 6px;border-radius:6px;word-break:break-all;color:var(--ink)}.warn{border:1px solid #6b4a1d;background:#261b0c;padding:10px 12px;border-radius:10px;color:#f3d3a7}</style></head>
<body><main><div class="brand">CRATE SHIP GAMES</div>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'", 'referrer-policy': 'same-origin', 'x-content-type-options': 'nosniff' } }); // same-origin: with no-referrer, browsers send Origin: null on the consent form post
}
const errorPage = message => page('Cannot connect', `<h1>This AI app cannot connect</h1><p>${escapeHtml(message)}</p><p>Go back to your AI app and try adding the connector again.</p>`, 400);

// Validates an authorization request. Errors that make the redirect untrustworthy are shown on a page instead.
async function authorizationRequest(env, params) {
  const client = await loadClient(env, params.client_id);
  if (!client) return { page: errorPage('The app did not identify itself in a way this site can verify.') };
  const redirectUri = params.redirect_uri || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '');
  if (!redirectUri || !redirectMatches(client.redirect_uris, redirectUri)) return { page: errorPage('The app asked to send you to an address it did not register.') };
  const back = (error, description) => { const u = new URL(redirectUri); u.searchParams.set('error', error); if (description) u.searchParams.set('error_description', description); if (params.state) u.searchParams.set('state', params.state); u.searchParams.set('iss', appOrigin(env).origin); return { redirect: u.href }; };
  if (params.response_type !== 'code') return back('unsupported_response_type', 'Only the code flow is supported.');
  if (!/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge || '') || params.code_challenge_method !== 'S256') return back('invalid_request', 'PKCE with S256 is required.');
  if (!acceptsResource(env, params.resource)) return back('invalid_target', 'This server only issues access to its own MCP endpoint.');
  const scopes = String(params.scope || SCOPE).split(/\s+/).filter(Boolean);
  if (!scopes.includes(SCOPE) && scopes.length) return back('invalid_scope', 'The only scope is "editor".');
  if (params.state && params.state.length > 1000) return back('invalid_request', 'The state value is too long.');
  return { client, redirectUri, state: params.state || '', challenge: params.code_challenge };
}

async function authorize(request, env) {
  const url = new URL(request.url), origin = appOrigin(env).origin;
  const params = request.method === 'POST' ? await readBody(request, 8192) : Object.fromEntries(url.searchParams);
  if (!(await flags(env)).AI_APP_CONNECTIONS_ENABLED) return page('Paused', '<h1>AI app connections are paused</h1><p>The site owner has paused AI app connections for now. Please try again later.</p>', 503);
  const checked = await authorizationRequest(env, params);
  if (checked.page) return checked.page;
  if (checked.redirect) return Response.redirect(checked.redirect, 302);
  let user;
  try { user = await requireUser(request, env); } catch (error) {
    if (error.status !== 401) throw error;
    const back = '/oauth/authorize?' + new URLSearchParams(Object.entries(params).filter(([k]) => ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource'].includes(k))).toString();
    return Response.redirect(origin + '/login?next=' + encodeURIComponent(back), 302);
  }
  const { client, redirectUri, state, challenge } = checked, target = new URL(redirectUri);
  if (request.method === 'GET') {
    const hidden = ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource'].map(k => params[k] === undefined ? '' : `<input type="hidden" name="${k}" value="${escapeHtml(params[k])}">`).join('');
    const where = target.protocol === 'https:' ? target.host : target.protocol === 'http:' ? 'this computer (' + target.host + ')' : 'the ' + target.protocol.slice(0, -1) + ' app on this device';
    return page('Connect an AI app', `<h1>Connect ${escapeHtml(client.client_name)}?</h1>
<p>Signed in as <strong>${escapeHtml(user.displayName || user.username)}</strong>.</p>
<p><strong>${escapeHtml(client.client_name)}</strong> is asking to work in your Crate Ship game editor. If you allow it, it can:</p>
<ul><li>Read the scene in the editor tab you open for AI apps, and take pictures of it.</li><li>Play your level for a few seconds to test it. This never changes your project.</li><li>Build, change and save that scene, but only while you have <strong>Allow changes</strong> turned on in the editor. Every change can be undone.</li></ul>
<p>It cannot see your password, your other projects, your payments or your account settings. You can disconnect it at any time in Settings → AI apps.</p>
${client.kind === 'registered' ? '<p class="warn">This app registered itself automatically, so its name is not verified. Only continue if you just added Crate Ship Games to an AI app yourself.</p>' : ''}
<p>After you allow it, you will be sent to <code>${escapeHtml(where)}</code>.</p>
<form method="post" action="/oauth/authorize">${hidden}<div class="row"><button type="submit" name="decision" value="deny">Cancel</button><button class="primary" type="submit" name="decision" value="allow">Allow</button></div></form>`);
  }
  requireMutationOrigin(request, env);
  const done = (query) => { for (const [k, v] of Object.entries(query)) target.searchParams.set(k, v); if (state) target.searchParams.set('state', state); target.searchParams.set('iss', origin); return new Response(null, { status: 303, headers: { location: target.href, 'cache-control': 'no-store' } }); };
  if (params.decision !== 'allow') return done({ error: 'access_denied', error_description: 'The user did not allow the connection.' });
  await rate(env, user.id, 'oauth-authorize', 30, 3600);
  const code = randomToken();
  await database(env).prepare('INSERT INTO platform_oauth_codes(code_hash,client_id,user_id,redirect_uri,code_challenge,resource,scope,expires_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(await tokenHash(code), client.client_id, user.id, redirectUri, challenge, mcpResource(env), SCOPE, now() + CODE_TTL).run();
  await audit(env, { actor: user.id, action: 'ai.connect.authorize', target: client.client_id, clientName: client.client_name });
  return done({ code });
}

// ---------- Token endpoint ----------
async function clientCredentials(request, body) {
  const header = request.headers.get('authorization') || '';
  if (/^basic /i.test(header)) {
    try { const [clientId, secret] = atob(header.slice(6).trim()).split(':').map(decodeURIComponent); return { clientId, secret, method: 'client_secret_basic' }; } catch { return { invalid: true }; }
  }
  if (body.client_secret) return { clientId: body.client_id, secret: body.client_secret, method: 'client_secret_post' };
  return { clientId: body.client_id, secret: null, method: 'none' };
}
async function authenticateClient(env, request, body) {
  const creds = await clientCredentials(request, body);
  if (creds.invalid || !creds.clientId) return null;
  const client = await loadClient(env, creds.clientId);
  if (!client) return null;
  if ((client.token_endpoint_auth_method || 'none') === 'none') return creds.secret ? null : client;
  if (!creds.secret || await sha256(creds.secret) !== client.client_secret_hash) return null;
  return client;
}
async function issueTokens(env, grantId, extraStatements = []) {
  const db = database(env), access = randomToken(), refresh = randomToken(), at = now();
  await db.batch([...extraStatements,
    db.prepare("INSERT INTO platform_oauth_tokens(token_hash,grant_id,kind,expires_at) VALUES(?,?,'access',?)").bind(await tokenHash(access), grantId, at + ACCESS_TTL),
    db.prepare("INSERT INTO platform_oauth_tokens(token_hash,grant_id,kind,expires_at) VALUES(?,?,'refresh',?)").bind(await tokenHash(refresh), grantId, at + REFRESH_TTL),
    db.prepare('UPDATE platform_oauth_grants SET last_used_at=? WHERE id=?').bind(at, grantId)]);
  return withCors(new Response(JSON.stringify({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: SCOPE }),
    { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', pragma: 'no-cache' } }));
}
async function token(request, env) {
  await rateLimit(request, env, 'oauth-token', '', 120, 600);
  const body = await readBody(request, 8192), db = database(env);
  const client = await authenticateClient(env, request, body);
  if (!client) return oauthError(401, 'invalid_client', 'Client authentication failed.');
  if (!acceptsResource(env, body.resource)) return oauthError(400, 'invalid_target', 'This server only issues access to its own MCP endpoint.');
  if (body.grant_type === 'authorization_code') {
    if (typeof body.code !== 'string' || typeof body.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier)) return oauthError(400, 'invalid_request', 'code and a valid code_verifier are required.');
    const hash = await tokenHash(body.code);
    const claim = await db.prepare('UPDATE platform_oauth_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>? RETURNING *').bind(now(), hash, now()).first();
    if (!claim || claim.client_id !== client.client_id) return oauthError(400, 'invalid_grant', 'The authorization code is invalid, expired or already used.');
    if (body.redirect_uri !== undefined && body.redirect_uri !== claim.redirect_uri) return oauthError(400, 'invalid_grant', 'redirect_uri does not match the authorization request.');
    if (await sha256(body.code_verifier) !== claim.code_challenge) return oauthError(400, 'invalid_grant', 'PKCE verification failed.');
    const user = await db.prepare("SELECT id FROM platform_users WHERE id=? AND status='active'").bind(claim.user_id).first();
    if (!user) return oauthError(400, 'invalid_grant', 'This account is not active.');
    const grantId = id();
    await db.prepare('DELETE FROM platform_oauth_codes WHERE expires_at<?').bind(now() - 86400).run();
    return issueTokens(env, grantId, [db.prepare('INSERT INTO platform_oauth_grants(id,user_id,client_id,client_name,resource,scope,created_at) VALUES(?,?,?,?,?,?,?)').bind(grantId, claim.user_id, client.client_id, client.client_name, claim.resource, claim.scope, now())]);
  }
  if (body.grant_type === 'refresh_token') {
    if (typeof body.refresh_token !== 'string') return oauthError(400, 'invalid_request', 'refresh_token is required.');
    const hash = await tokenHash(body.refresh_token);
    const row = await db.prepare(`SELECT t.*,g.client_id,g.revoked_at,u.status user_status FROM platform_oauth_tokens t JOIN platform_oauth_grants g ON g.id=t.grant_id JOIN platform_users u ON u.id=g.user_id WHERE t.token_hash=? AND t.kind='refresh'`).bind(hash).first();
    if (!row || row.client_id !== client.client_id || row.revoked_at || row.user_status !== 'active' || row.expires_at <= now()) return oauthError(400, 'invalid_grant', 'The refresh token is invalid or expired.');
    if (row.used_at) { // A rotated refresh token came back: assume theft and end the whole connection.
      await db.prepare('UPDATE platform_oauth_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(now(), row.grant_id).run();
      await audit(env, { actor: null, action: 'ai.connect.refresh_reuse', target: row.grant_id, result: 'denied' });
      return oauthError(400, 'invalid_grant', 'The refresh token was already used. Reconnect the app.');
    }
    const claim = await db.prepare('UPDATE platform_oauth_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL').bind(now(), hash).run();
    if (!claim.meta?.changes) return oauthError(400, 'invalid_grant', 'The refresh token was already used.');
    return issueTokens(env, row.grant_id, [db.prepare("DELETE FROM platform_oauth_tokens WHERE grant_id=? AND expires_at<?").bind(row.grant_id, now())]);
  }
  return oauthError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
}

async function revoke(request, env) {
  await rateLimit(request, env, 'oauth-revoke', '', 60, 600);
  const body = await readBody(request, 4096), client = await authenticateClient(env, request, body);
  if (!client) return oauthError(401, 'invalid_client', 'Client authentication failed.');
  if (typeof body.token === 'string') {
    const db = database(env), row = await db.prepare('SELECT t.grant_id,g.client_id FROM platform_oauth_tokens t JOIN platform_oauth_grants g ON g.id=t.grant_id WHERE t.token_hash=?').bind(await tokenHash(body.token)).first();
    if (row && row.client_id === client.client_id) await db.prepare('UPDATE platform_oauth_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(now(), row.grant_id).run();
  }
  return withCors(new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } }));
}

// ---------- MCP endpoint ----------
function unauthorized(env, error) {
  const challenge = `Bearer resource_metadata="${metadataUrl(env)}", scope="${SCOPE}"${error ? `, error="${error}"` : ''}`;
  return rpc(rpcError(null, -32001, error ? 'The access token is invalid or expired.' : 'Sign in to Crate Ship Games to use this connector.'), 401, { 'www-authenticate': challenge });
}
async function bearerGrant(request, env) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  if (!match) return { missing: !header };
  const row = await database(env).prepare(`SELECT g.id grant_id,g.user_id,g.client_id,g.client_name,g.resource,g.last_used_at,u.username,u.display_name FROM platform_oauth_tokens t
    JOIN platform_oauth_grants g ON g.id=t.grant_id JOIN platform_users u ON u.id=g.user_id
    WHERE t.token_hash=? AND t.kind='access' AND t.expires_at>? AND g.revoked_at IS NULL AND u.status='active'`).bind(await tokenHash(match[1]), now()).first();
  if (!row || canonicalResource(row.resource) !== mcpResource(env).toLowerCase()) return { invalid: true };
  if (!row.last_used_at || now() - row.last_used_at > 300) await database(env).prepare('UPDATE platform_oauth_grants SET last_used_at=? WHERE id=?').bind(now(), row.grant_id).run();
  return { grant: row };
}
function decodeHeader(value) {
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(value || '');
  if (!m) return value;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(m[1]), c => c.charCodeAt(0))); } catch { return null; }
}
const complete = (modern, result) => modern ? { resultType: 'complete', ...result, _meta: { ...(result._meta || {}), 'io.modelcontextprotocol/serverInfo': SERVER_INFO } } : result;

async function mcp(request, env) {
  if (request.method === 'GET' || request.method === 'DELETE') return rpc(rpcError(null, -32000, 'This MCP endpoint accepts POST requests only.'), 405, { allow: 'POST, OPTIONS' });
  if (request.method !== 'POST') return rpc(null, 405, { allow: 'POST, OPTIONS' });
  const origin = request.headers.get('origin');
  if (origin) { let ok = false; try { const u = new URL(origin); ok = u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname)); } catch {} if (!ok) return rpc(rpcError(null, -32000, 'Origin not allowed.'), 403); }
  const auth = await bearerGrant(request, env);
  if (!auth.grant) return unauthorized(env, auth.invalid ? 'invalid_token' : null);
  if (!(await flags(env)).AI_APP_CONNECTIONS_ENABLED) return rpc(rpcError(null, -32000, 'AI app connections are paused by the site owner. Try again later.'), 503);
  if (!/^application\/json/i.test(request.headers.get('content-type') || '')) return rpc(rpcError(null, -32700, 'Send application/json.'), 415);
  const raw = await request.text();
  if (raw.length > 1024 * 1024) return rpc(rpcError(null, -32600, 'Request too large.'), 413);
  const message = parse(raw);
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') return rpc(rpcError(null, -32600, 'Send one JSON-RPC 2.0 message per request.'), 400);
  if (typeof message.method !== 'string') return rpc(null, 202); // a client response: nothing to do
  const hasId = Object.hasOwn(message, 'id');
  if (hasId && !(typeof message.id === 'string' && message.id.length <= 200 || Number.isSafeInteger(message.id))) return rpc(rpcError(null, -32600, 'Invalid request id.'), 400);
  if (!hasId) return rpc(null, 202); // notifications (initialized, cancelled) need no work here
  const reqId = message.id, params = message.params && typeof message.params === 'object' && !Array.isArray(message.params) ? message.params : {};
  const header = request.headers.get('mcp-protocol-version');
  const metaVersion = params._meta?.['io.modelcontextprotocol/protocolVersion'];
  const modern = typeof metaVersion === 'string';
  if (message.method === 'initialize') {
    const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
    const version = LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0];
    return rpc({ jsonrpc: '2.0', id: reqId, result: { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS } });
  }
  if (modern) {
    if (header !== metaVersion) return rpc(rpcError(reqId, -32020, 'Header mismatch: MCP-Protocol-Version must match the request _meta protocol version.'), 400);
    if (metaVersion !== MODERN_VERSION) return rpc(rpcError(reqId, -32022, 'Unsupported protocol version', { supported: [...SUPPORTED_VERSIONS], requested: metaVersion }), 400);
    if (request.headers.get('mcp-method') !== message.method) return rpc(rpcError(reqId, -32020, 'Header mismatch: Mcp-Method must match the request method.'), 400);
    if (['tools/call', 'resources/read', 'prompts/get'].includes(message.method)) {
      const name = decodeHeader(request.headers.get('mcp-name'));
      if (name === null || name !== (params.name ?? params.uri)) return rpc(rpcError(reqId, -32020, 'Header mismatch: Mcp-Name must match the request.'), 400);
    }
  } else if (header && !LEGACY_VERSIONS.includes(header)) {
    return rpc(rpcError(reqId, -32022, 'Unsupported protocol version', { supported: [...SUPPORTED_VERSIONS], requested: header }), 400);
  }
  const reply = result => rpc({ jsonrpc: '2.0', id: reqId, result: complete(modern, result) });
  if (message.method === 'server/discover') return reply({ supportedVersions: [...SUPPORTED_VERSIONS], capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS, ttlMs: 3600000, cacheScope: 'public' });
  if (message.method === 'ping') return reply({});
  if (message.method === 'tools/list') return reply({ tools: await mcpTools(), ...(modern ? { ttlMs: 300000, cacheScope: 'public' } : {}) });
  if (message.method === 'tools/call') return reply(await callTool(env, auth.grant, params));
  return rpc(rpcError(reqId, -32601, 'Method not found.'), modern ? 404 : 200);
}

const objectSchema = properties => ({ type: 'object', properties, additionalProperties: false });
export async function mcpTools() {
  const editorTools = await toolDefinitions();
  return [
    { name: 'editor_status', title: 'Editor status', description: 'Check whether the user has a Crate Ship editor tab open for AI apps, which project it shows, and whether changes are allowed. Call this first.', inputSchema: objectSchema({}), annotations: { readOnlyHint: true } },
    { name: 'list_library_models', title: 'List library models', description: 'List the Starter Library: three rigged, animated characters (Human, Goat Kid and Blue Robot, each with Walking and Running clips). It is deliberately tiny. For anything else, build it in the scene from shapes, customMesh vector art or procedural recipes, or ask the user to import their own model. Place one with add_library_model.', inputSchema: objectSchema({ category: { type: 'string', maxLength: 60 }, search: { type: 'string', maxLength: 60 } }), annotations: { readOnlyHint: true } },
    ...editorTools,
  ];
}
// Pictures (screenshot, play_test) are returned as real MCP image blocks so the AI can look at them.
function editorResult(value) {
  const { content, structured } = resultContent(value);
  return { content, structuredContent: structured, isError: false };
}
const toolText = (value, isError = false) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], ...(typeof value === 'string' ? {} : { structuredContent: value }), isError });

async function liveLink(env, userId) {
  return database(env).prepare('SELECT * FROM platform_ai_editor_links WHERE user_id=? AND closed_at IS NULL AND last_seen_at>=? ORDER BY last_seen_at DESC LIMIT 1').bind(userId, now() - LINK_FRESH_SECONDS).first();
}
const OUTDATED = 'The user\'s editor tab is running an older version of Crate Ship that does not have the newest tools. Ask the user to refresh the editor tab (F5; their work is kept in the browser), open AI apps and turn on "Let AI apps build here" and "Allow changes" again. Then try again.';
const NO_EDITOR = 'No Crate Ship editor is open for AI apps. Ask the user to open the editor at {origin}/play, click "AI apps" in the top bar, and turn on "Let AI apps build here" (and "Allow changes" if you should edit). Then try again.';

async function callTool(env, grant, params) {
  const name = params.name, args = params.arguments === undefined ? {} : params.arguments, origin = appOrigin(env).origin;
  if (typeof name !== 'string') return toolText('Tool name is required.', true);
  if (!args || typeof args !== 'object' || Array.isArray(args)) return toolText('Tool arguments must be an object.', true);
  try { await rate(env, grant.user_id, 'ai-tool-call', 120, 60); } catch { return toolText('Too many tool calls in the last minute. Wait a moment and try again.', true); }
  if (name === 'editor_status') {
    const link = await liveLink(env, grant.user_id);
    return toolText(link ? { editorOpen: true, projectName: link.project_name, allowChanges: Boolean(link.allow_writes), editorUpToDate: (link.editor_protocol || 0) >= EDITOR_PROTOCOL, ...((link.editor_protocol || 0) < EDITOR_PROTOCOL ? { help: OUTDATED } : {}), secondsSinceLastSeen: now() - link.last_seen_at, editorUrl: origin + '/play' }
      : { editorOpen: false, allowChanges: false, editorUrl: origin + '/play', help: NO_EDITOR.replace('{origin}', origin) });
  }
  if (name === 'list_library_models') {
    const category = text(args.category, 60).toLowerCase(), search = text(args.search, 60).toLowerCase();
    const models = starterLibrary.filter(m => (!category || m.cat.toLowerCase().includes(category)) && (!search || `${m.name} ${m.path} ${m.cat}`.toLowerCase().includes(search)));
    return toolText({ categories: [...new Set(starterLibrary.map(m => m.cat))], count: models.length, models });
  }
  if (!(await toolDefinitions()).some(tool => tool.name === name)) return toolText('Unknown tool: ' + name, true);
  if (!validArguments(name, args)) return toolText('Those arguments do not match the ' + name + ' input schema. Check field names, ranges and required fields.', true);
  if (name === 'add_library_model' && !LIBRARY.has(args.path.toLowerCase())) return toolText('That path is not in the Starter Library. Call list_library_models for valid paths.', true);
  const link = await liveLink(env, grant.user_id);
  if (!link) return toolText(NO_EDITOR.replace('{origin}', origin), true);
  if ((link.editor_protocol || 0) < EDITOR_PROTOCOL) return toolText(OUTDATED, true);
  if (MUTATING_COMMANDS.includes(name) && !link.allow_writes) return toolText('Changes are turned off in the editor. Ask the user to turn on "Allow changes" in the AI apps panel, then try again.', true);
  const db = database(env), commandId = id(), at = now();
  await db.prepare("INSERT INTO platform_ai_commands(id,link_id,grant_id,command,arguments_json,status,created_at,expires_at) VALUES(?,?,?,?,?,'queued',?,?)")
    .bind(commandId, link.id, grant.grant_id, name, JSON.stringify(args), at, at + COMMAND_TTL).run();
  const deadline = Date.now() + WAIT_MS;
  for (let delay = 60; Date.now() < deadline; delay = Math.min(delay + 30, 300)) {
    await sleep(delay);
    const row = await db.prepare('SELECT status,result_json,error FROM platform_ai_commands WHERE id=?').bind(commandId).first();
    if (row?.status === 'completed') return editorResult(parse(row.result_json, {}));
    if (row?.status === 'failed') return toolText('The editor could not do that: ' + (row.error || 'unknown problem') + '.', true);
    if (!row || row.status === 'expired') break;
  }
  const expired = await db.prepare("UPDATE platform_ai_commands SET status='expired',completed_at=? WHERE id=? AND status IN ('queued','delivered') RETURNING status").bind(now(), commandId).first();
  if (!expired) { const row = await db.prepare('SELECT status,result_json,error FROM platform_ai_commands WHERE id=?').bind(commandId).first(); if (row?.status === 'completed') return editorResult(parse(row.result_json, {})); }
  return toolText('The editor did not answer in time. ' + (MUTATING_COMMANDS.includes(name) ? 'The change may or may not have been applied: read the scene with get_scene before trying again.' : 'Check that the editor tab is still open and try again.'), true);
}

// ---------- Editor relay (signed-in editor tab) ----------
export async function handleAiEditor(request, env, path) {
  if (!path.startsWith('/ai/')) return null;
  const method = request.method, user = await requireUser(request, env), db = database(env), origin = appOrigin(env).origin;
  if (method !== 'GET') requireMutationOrigin(request, env);
  if (path === '/ai/connections' && method === 'GET') {
    const apps = (await db.prepare('SELECT id,client_name clientName,created_at createdAt,last_used_at lastUsedAt FROM platform_oauth_grants WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 50').bind(user.id).all()).results || [];
    const link = await liveLink(env, user.id);
    return json({ mcpUrl: origin + '/mcp', enabled: Boolean((await flags(env)).AI_APP_CONNECTIONS_ENABLED), apps, editor: link ? { projectName: link.project_name, allowChanges: Boolean(link.allow_writes) } : null });
  }
  const revokeMatch = /^\/ai\/connections\/([A-Za-z0-9-]{1,64})$/.exec(path);
  if (revokeMatch && method === 'DELETE') {
    const result = await db.prepare('UPDATE platform_oauth_grants SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL').bind(now(), revokeMatch[1], user.id).run();
    if (!result.meta?.changes) fail(404, 'That connection was not found.');
    await audit(env, { actor: user.id, action: 'ai.connect.revoke', target: revokeMatch[1] });
    return json({ revoked: true });
  }
  if (path === '/ai/editor/link' && method === 'POST') {
    if (!(await flags(env)).AI_APP_CONNECTIONS_ENABLED) fail(503, 'AI app connections are paused by the site owner.', 'AI_PAUSED');
    await rate(env, user.id, 'ai-editor-link', 60, 3600);
    const body = await readJsonBody(request), projectId = text(body.projectId, 100);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) fail(400, 'A project is required.');
    const linkId = id(), at = now();
    await db.batch([
      db.prepare("UPDATE platform_ai_commands SET status='expired',completed_at=? WHERE status IN ('queued','delivered') AND link_id IN (SELECT id FROM platform_ai_editor_links WHERE user_id=? AND closed_at IS NULL)").bind(at, user.id),
      db.prepare('UPDATE platform_ai_editor_links SET closed_at=? WHERE user_id=? AND closed_at IS NULL').bind(at, user.id),
      db.prepare('INSERT INTO platform_ai_editor_links(id,user_id,project_id,project_name,allow_writes,created_at,last_seen_at,editor_protocol) VALUES(?,?,?,?,?,?,?,?)').bind(linkId, user.id, projectId, text(body.projectName, 120), body.allowWrites === true ? 1 : 0, at, at, protocolOf(body.protocol))]);
    return json({ linkId, allowWrites: body.allowWrites === true, latestProtocol: EDITOR_PROTOCOL }, 201);
  }
  const linkMatch = /^\/ai\/editor\/link\/([a-f0-9-]{36})(\/next|\/results)?$/.exec(path);
  if (!linkMatch) return null;
  const link = await db.prepare('SELECT * FROM platform_ai_editor_links WHERE id=? AND user_id=?').bind(linkMatch[1], user.id).first();
  if (!link) fail(404, 'This AI link was not found.');
  if (link.closed_at) fail(410, 'This AI link was closed or replaced by another editor tab.', 'LINK_CLOSED');
  const at = now();
  if (!linkMatch[2] && method === 'PUT') {
    const body = await readJsonBody(request), projectId = text(body.projectId, 100) || link.project_id;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) fail(400, 'A project is required.');
    await db.prepare('UPDATE platform_ai_editor_links SET allow_writes=?,project_id=?,project_name=?,last_seen_at=?,editor_protocol=MAX(editor_protocol,?) WHERE id=?').bind(body.allowWrites === true ? 1 : 0, projectId, text(body.projectName, 120) || link.project_name, at, protocolOf(body.protocol), link.id).run();
    return json({ linkId: link.id, allowWrites: body.allowWrites === true });
  }
  if (!linkMatch[2] && method === 'DELETE') {
    await db.batch([db.prepare('UPDATE platform_ai_editor_links SET closed_at=? WHERE id=?').bind(at, link.id), db.prepare("UPDATE platform_ai_commands SET status='expired',completed_at=? WHERE link_id=? AND status IN ('queued','delivered')").bind(at, link.id)]);
    return json({ closed: true });
  }
  if (linkMatch[2] === '/next' && method === 'GET') {
    const query = new URL(request.url).searchParams, protocol = protocolOf(Number(query.get('p'))), wait = query.get('wait') === '1';
    await db.prepare('UPDATE platform_ai_editor_links SET last_seen_at=?,editor_protocol=MAX(editor_protocol,?) WHERE id=?').bind(at, protocol, link.id).run();
    const take = () => db.prepare(`UPDATE platform_ai_commands SET status='delivered' WHERE id=(SELECT id FROM platform_ai_commands WHERE link_id=? AND status='queued' AND expires_at>? ORDER BY created_at LIMIT 1) AND status='queued' RETURNING id,command,arguments_json,expires_at,grant_id`).bind(link.id, now()).first();
    // Long poll: the tab keeps one request open and gets a tool call within ~0.1 s of the AI sending it.
    let command = await take();
    for (const until = Date.now() + LONG_POLL_MS; wait && !command && Date.now() < until;) { await sleep(100); command = await take(); }
    if (Math.random() < 0.02) await db.prepare("DELETE FROM platform_ai_commands WHERE link_id=? AND created_at<?").bind(link.id, at - 86400).run();
    if (!command) return json({ commands: [], allowWrites: Boolean(link.allow_writes), latestProtocol: EDITOR_PROTOCOL });
    const app = await db.prepare('SELECT client_name FROM platform_oauth_grants WHERE id=?').bind(command.grant_id).first();
    return json({ commands: [{ id: command.id, command: command.command, arguments: parse(command.arguments_json, {}), projectId: link.project_id, expiresAt: command.expires_at * 1000, app: app?.client_name || 'AI app' }], allowWrites: Boolean(link.allow_writes), latestProtocol: EDITOR_PROTOCOL });
  }
  if (linkMatch[2] === '/results' && method === 'POST') {
    const body = await readJsonBody(request, MAX_RESULT_BYTES + 4096);
    const command = await db.prepare("SELECT * FROM platform_ai_commands WHERE id=? AND link_id=? AND status='delivered'").bind(text(body.commandId, 64), link.id).first();
    if (!command) return json({ accepted: false });
    let status = 'completed', resultJson = null, error = null;
    if (body.error) { status = 'failed'; error = text(String(body.error.message || body.error.code || 'The editor refused the command'), 300); }
    else {
      resultJson = JSON.stringify(body.result ?? null);
      if (resultJson.length > MAX_RESULT_BYTES || !validResult(command.command, body.result, link.project_id, parse(command.arguments_json, {}))) { status = 'failed'; resultJson = null; error = 'the editor returned a result this connector could not check'; }
    }
    await db.prepare("UPDATE platform_ai_commands SET status=?,result_json=?,error=?,completed_at=? WHERE id=? AND status='delivered'").bind(status, resultJson, error, now(), command.id).run();
    return json({ accepted: true });
  }
  return null;
}
async function readJsonBody(request, max = 8192) {
  if (!/^application\/json/i.test(request.headers.get('content-type') || '')) fail(415, 'Send an application/json request.', 'JSON_REQUIRED');
  const raw = await request.text(); if (raw.length > max) fail(413, 'Request is too large.', 'REQUEST_TOO_LARGE');
  const body = parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Send a JSON object.'); return body;
}

// ---------- Entry point for /mcp, /oauth/* and /.well-known/* ----------
export async function handleAiConnect(request, env) {
  const path = new URL(request.url).pathname;
  const known = path === '/mcp' || path.startsWith('/oauth/') || path.startsWith('/.well-known/oauth-');
  if (!known) return null;
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') return withCors(json(protectedResourceMetadata(env)));
    if (path === '/.well-known/oauth-authorization-server' || path === '/.well-known/oauth-authorization-server/mcp') return withCors(json(authorizationServerMetadata(env)));
    if (path === '/oauth/register' && request.method === 'POST') return await register(request, env);
    if (path === '/oauth/authorize' && ['GET', 'POST'].includes(request.method)) return await authorize(request, env);
    if (path === '/oauth/token' && request.method === 'POST') return await token(request, env);
    if (path === '/oauth/revoke' && request.method === 'POST') return await revoke(request, env);
    if (path === '/mcp') return await mcp(request, env);
    return withCors(json({ error: 'not_found' }, 404));
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(JSON.stringify({ event: 'ai-connect.failed', path, code: error.code || 'INTERNAL_ERROR' }));
    if (path === '/mcp') return rpc(rpcError(null, -32603, status === 500 ? 'Internal error.' : error.message), status);
    if (path.startsWith('/oauth/') && path !== '/oauth/authorize') return oauthError(status, status === 429 ? 'slow_down' : status === 500 ? 'server_error' : 'invalid_request', status === 500 ? 'Something went wrong.' : error.message);
    if (path === '/oauth/authorize') return page('Error', `<h1>Something went wrong</h1><p>${escapeHtml(status === 500 ? 'Please try again.' : error.message)}</p>`, status);
    return withCors(json({ error: 'server_error' }, status));
  }
}
