import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { handleAiConnect, handleAiEditor, validRedirectUri, redirectMatches, MODERN_VERSION } from '../platform/server/ai-connect.mjs';
import { base64url, tokenHash } from '../platform/server/identity.mjs';

const migrationDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(n => n.endsWith('.sql')).sort().map(n => readFile(new URL(n, migrationDir), 'utf8')));
const ORIGIN = 'https://example.test', now = () => Math.floor(Date.now() / 1000), key = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const sha = async v => base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));

function fixture() {
  const sql = new DatabaseSync(':memory:'); for (const m of migrations) sql.exec(m);
  return { sql, env: { PLATFORM_DB: sqliteD1(sql), APP_ORIGIN: ORIGIN, AUTH_SECRET: key(), ENCRYPTION_KEY: key() } };
}
async function user(f) {
  const id = crypto.randomUUID(), token = key(), t = now();
  f.sql.prepare("INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at) VALUES(?,?,?,?,1,'active',?,?)").run(id, id + '@x.test', 'u' + id.slice(0, 8), 'Tester', t, t);
  f.sql.prepare("INSERT INTO platform_user_roles VALUES(?,'PLAYER',?)").run(id, t);
  f.sql.prepare('INSERT INTO platform_sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at,auth_time,user_agent,ip_hash) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), await tokenHash(token), id, t, t + 3600, t, t, 'test', 'test');
  return { id, cookie: '__Host-crateship_session=' + token };
}
const call = (f, path, init = {}) => handleAiConnect(new Request(ORIGIN + path, { ...init, headers: { 'cf-connecting-ip': '192.0.2.9', ...(init.headers || {}) } }), f.env);
const form = body => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
const editorApi = (f, u, path, method = 'GET', body) => handleAiEditor(new Request(ORIGIN + '/api/platform' + path, { method, headers: { cookie: u.cookie, origin: ORIGIN, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), f.env, path);

async function connect(f, u, { redirect = 'https://claude.ai/api/mcp/auth_callback' } = {}) {
  const reg = await (await call(f, '/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) })).json();
  const verifier = key() + key(), challenge = await sha(verifier);
  const query = { response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'st8', resource: ORIGIN + '/mcp', scope: 'editor' };
  const consent = await call(f, '/oauth/authorize?' + new URLSearchParams(query), { headers: { cookie: u.cookie } });
  assert.equal(consent.status, 200); assert.match(await consent.text(), /Connect Claude\?/);
  const allowed = await call(f, '/oauth/authorize', { ...form({ ...query, decision: 'allow' }), headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: u.cookie, origin: ORIGIN } });
  assert.equal(allowed.status, 303);
  const back = new URL(allowed.headers.get('location'));
  assert.equal(back.origin + back.pathname, redirect); assert.equal(back.searchParams.get('state'), 'st8'); assert.equal(back.searchParams.get('iss'), ORIGIN);
  const tokens = await (await call(f, '/oauth/token', form({ grant_type: 'authorization_code', code: back.searchParams.get('code'), code_verifier: verifier, client_id: reg.client_id, redirect_uri: redirect, resource: ORIGIN + '/mcp' }))).json();
  assert.equal(tokens.token_type, 'Bearer'); assert.ok(tokens.access_token && tokens.refresh_token);
  return { client: reg, tokens, verifier };
}
function mcp(f, accessToken, message, headers = {}) {
  return call(f, '/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + accessToken, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', ...message }) });
}
const modern = (method, params = {}, name) => [{ id: 1, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN_VERSION, 'io.modelcontextprotocol/clientCapabilities': {} } } }, { 'mcp-protocol-version': MODERN_VERSION, 'mcp-method': method, ...(name ? { 'mcp-name': name } : {}) }];

test('discovery metadata points AI apps at the authorization server and the /mcp resource', async () => {
  const f = fixture();
  try {
    const prm = await (await call(f, '/.well-known/oauth-protected-resource/mcp')).json();
    assert.equal(prm.resource, ORIGIN + '/mcp'); assert.deepEqual(prm.authorization_servers, [ORIGIN]);
    const as = await (await call(f, '/.well-known/oauth-authorization-server')).json();
    assert.equal(as.issuer, ORIGIN); assert.deepEqual(as.code_challenge_methods_supported, ['S256']); assert.equal(as.client_id_metadata_document_supported, true);
    const unauth = await mcp(f, 'x'.repeat(43), { id: 1, method: 'tools/list' });
    assert.equal(unauth.status, 401); assert.match(unauth.headers.get('www-authenticate'), /resource_metadata="https:\/\/example\.test\/\.well-known\/oauth-protected-resource\/mcp"/);
    const none = await call(f, '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(none.status, 401);
    assert.equal((await call(f, '/mcp')).status, 405);
  } finally { f.sql.close(); }
});

test('redirect URI rules accept https, loopback on any port and app schemes, and reject the rest', () => {
  for (const ok of ['https://claude.ai/api/mcp/auth_callback', 'http://localhost:33418/callback', 'http://127.0.0.1/cb', 'cursor://anysphere.cursor-mcp/oauth/callback']) assert.ok(validRedirectUri(ok), ok);
  for (const bad of ['http://evil.example/cb', 'javascript:alert(1)', 'data:text/html,x', 'https://x.test/cb#frag', 'not a url']) assert.ok(!validRedirectUri(bad), bad);
  assert.ok(redirectMatches(['http://127.0.0.1:1111/callback'], 'http://127.0.0.1:5555/callback'));
  assert.ok(!redirectMatches(['http://127.0.0.1:1111/callback'], 'http://127.0.0.1:5555/other'));
  assert.ok(!redirectMatches(['https://a.test/cb'], 'https://a.test/cb2'));
});

test('an unsigned-in user is sent to log in first, and bad requests never redirect to unregistered addresses', async () => {
  const f = fixture();
  try {
    const reg = await (await call(f, '/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://app.test/cb'] }) })).json();
    const q = { response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://app.test/cb', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' };
    const login = await call(f, '/oauth/authorize?' + new URLSearchParams(q));
    assert.equal(login.status, 302); assert.match(login.headers.get('location'), /^https:\/\/example\.test\/login\?next=%2Foauth%2Fauthorize%3F/);
    const wrongRedirect = await call(f, '/oauth/authorize?' + new URLSearchParams({ ...q, redirect_uri: 'https://evil.test/cb' }));
    assert.equal(wrongRedirect.status, 400); assert.equal(wrongRedirect.headers.get('location'), null);
    const plainPkce = await call(f, '/oauth/authorize?' + new URLSearchParams({ ...q, code_challenge_method: 'plain' }));
    assert.equal(plainPkce.status, 302); assert.match(plainPkce.headers.get('location'), /^https:\/\/app\.test\/cb\?error=invalid_request/);
    const otherResource = await call(f, '/oauth/authorize?' + new URLSearchParams({ ...q, resource: 'https://other.test/mcp' }));
    assert.match(otherResource.headers.get('location'), /error=invalid_target/);
  } finally { f.sql.close(); }
});

test('consent requires a same-origin form post; codes are single-use and PKCE-bound', async () => {
  const f = fixture();
  try {
    const u = await user(f), { client, tokens, verifier } = await connect(f, u);
    assert.ok(tokens.access_token);
    const q = { response_type: 'code', client_id: client.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: await sha(verifier), code_challenge_method: 'S256', decision: 'allow' };
    const forged = await call(f, '/oauth/authorize', { ...form(q), headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: u.cookie, origin: 'https://evil.test' } });
    assert.equal(forged.status, 403);
    const allowed = await call(f, '/oauth/authorize', { ...form(q), headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: u.cookie, origin: ORIGIN } });
    const code = new URL(allowed.headers.get('location')).searchParams.get('code');
    const wrongVerifier = await call(f, '/oauth/token', form({ grant_type: 'authorization_code', code, code_verifier: key() + key(), client_id: client.client_id }));
    assert.equal((await wrongVerifier.json()).error, 'invalid_grant');
    const replay = await call(f, '/oauth/token', form({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id }));
    assert.equal((await replay.json()).error, 'invalid_grant', 'a code is burned by its first redemption attempt');
  } finally { f.sql.close(); }
});

test('legacy and modern MCP clients can list tools; header and version mismatches are refused', async () => {
  const f = fixture();
  try {
    const u = await user(f), { tokens } = await connect(f, u);
    const init = await (await mcp(f, tokens.access_token, { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Claude', version: '1' } } })).json();
    assert.equal(init.result.protocolVersion, '2025-06-18'); assert.ok(init.result.capabilities.tools);
    assert.equal((await mcp(f, tokens.access_token, { method: 'notifications/initialized' }, { 'mcp-protocol-version': '2025-06-18' })).status, 202);
    const legacyList = await (await mcp(f, tokens.access_token, { id: 2, method: 'tools/list' }, { 'mcp-protocol-version': '2025-06-18' })).json();
    const names = legacyList.result.tools.map(t => t.name);
    for (const name of ['editor_status', 'list_library_models', 'get_scene', 'preview_world', 'apply_world', 'edit_objects', 'add_library_model', 'screenshot', 'play_test', 'save_project', 'undo']) assert.ok(names.includes(name), name);
    assert.equal(legacyList.result.resultType, undefined);
    const discover = await (await mcp(f, tokens.access_token, ...modern('server/discover'))).json();
    assert.equal(discover.result.resultType, 'complete'); assert.ok(discover.result.supportedVersions.includes(MODERN_VERSION));
    const modernList = await (await mcp(f, tokens.access_token, ...modern('tools/list'))).json();
    assert.equal(modernList.result.resultType, 'complete'); assert.equal(typeof modernList.result.ttlMs, 'number');
    const [msg, headers] = modern('tools/list');
    const mismatch = await mcp(f, tokens.access_token, msg, { ...headers, 'mcp-method': 'tools/call' });
    assert.equal(mismatch.status, 400); assert.equal((await mismatch.json()).error.code, -32020);
    const future = await mcp(f, tokens.access_token, { id: 3, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } } }, { 'mcp-protocol-version': '2099-01-01', 'mcp-method': 'tools/list' });
    assert.equal(future.status, 400); const body = await future.json(); assert.equal(body.error.code, -32022); assert.ok(body.error.data.supported.includes('2025-06-18'));
    const unknown = await mcp(f, tokens.access_token, ...modern('resources/list'));
    assert.equal(unknown.status, 404); assert.equal((await unknown.json()).error.code, -32601);
  } finally { f.sql.close(); }
});

test('tool calls reach the linked editor tab; writes need "Allow changes"; results are checked', async () => {
  const f = fixture();
  try {
    const u = await user(f), { tokens } = await connect(f, u);
    const tool = (name, args = {}) => mcp(f, tokens.access_token, ...modern('tools/call', { name, arguments: args }, name)).then(r => r.json());
    let status = await tool('editor_status');
    assert.equal(status.result.structuredContent.editorOpen, false);
    assert.equal((await tool('get_scene')).result.isError, true, 'no editor open');
    const link = await (await editorApi(f, u, '/ai/editor/link', 'POST', { projectId: 'proj-1', projectName: 'Forest', allowWrites: false })).json();
    status = await tool('editor_status');
    assert.deepEqual([status.result.structuredContent.editorOpen, status.result.structuredContent.projectName, status.result.structuredContent.allowChanges], [true, 'Forest', false]);
    const blocked = await tool('undo');
    assert.equal(blocked.result.isError, true); assert.match(blocked.result.content[0].text, /Allow changes/);
    // A simulated editor tab answers the next command.
    const answer = (async () => {
      for (let i = 0; i < 40; i++) {
        const next = await (await editorApi(f, u, `/ai/editor/link/${link.linkId}/next`)).json();
        if (next.commands.length) { const c = next.commands[0]; assert.equal(c.command, 'get_scene'); assert.equal(c.app, 'Claude');
          const result = { projectId: 'proj-1', name: 'Forest', entities: [], assets: [], settings: {}, entityCount: 0, assetCount: 0, truncated: false, offset: 0, limit: 250 };
          return editorApi(f, u, `/ai/editor/link/${link.linkId}/results`, 'POST', { commandId: c.id, result }); }
        await new Promise(r => setTimeout(r, 50));
      }
    })();
    const [scene] = await Promise.all([tool('get_scene'), answer]);
    assert.equal(scene.result.isError, false); assert.equal(scene.result.structuredContent.name, 'Forest');
    // A result that does not match the contract is refused, not passed to the AI.
    const bad = (async () => { for (let i = 0; i < 40; i++) { const next = await (await editorApi(f, u, `/ai/editor/link/${link.linkId}/next`)).json(); if (next.commands.length) return editorApi(f, u, `/ai/editor/link/${link.linkId}/results`, 'POST', { commandId: next.commands[0].id, result: { projectId: 'other-project', secret: 'x' } }); await new Promise(r => setTimeout(r, 50)); } })();
    const [refused] = await Promise.all([tool('get_object', { id: 'abc' }), bad]);
    assert.equal(refused.result.isError, true);
    assert.equal((await tool('add_library_model', { path: 'not/in/library' })).result.isError, true);
    const library = await tool('list_library_models', { category: 'people' });
    assert.equal(library.result.structuredContent.count, 1); assert.equal((await tool('list_library_models')).result.structuredContent.count, 3);
  } finally { f.sql.close(); }
});

test('screenshot and play_test reach the editor; the AI gets a real image; save_project needs "Allow changes"', async () => {
  const f = fixture();
  try {
    const u = await user(f), { tokens } = await connect(f, u);
    const tool = (name, args = {}) => mcp(f, tokens.access_token, ...modern('tools/call', { name, arguments: args }, name)).then(r => r.json());
    const link = await (await editorApi(f, u, '/ai/editor/link', 'POST', { projectId: 'proj-1', projectName: 'Forest', allowWrites: false })).json();
    const jpeg = Buffer.from('not-a-real-jpeg-but-valid-base64-payload').toString('base64');
    const answer = (expected, result) => (async () => {
      for (let i = 0; i < 60; i++) {
        const next = await (await editorApi(f, u, `/ai/editor/link/${link.linkId}/next`)).json();
        if (next.commands.length) { const c = next.commands[0]; assert.equal(c.command, expected); return editorApi(f, u, `/ai/editor/link/${link.linkId}/results`, 'POST', { commandId: c.id, result }); }
        await new Promise(r => setTimeout(r, 50));
      }
    })();
    // Read-only tools work without "Allow changes" and come back as image + text blocks.
    const shot = { projectId: 'proj-1', view: 'game', width: 800, height: 450, image: { mimeType: 'image/jpeg', data: jpeg } };
    const [screenshot] = await Promise.all([tool('screenshot', { view: 'game', width: 800 }), answer('screenshot', shot)]);
    assert.equal(screenshot.result.isError, false);
    assert.deepEqual(screenshot.result.content[0], { type: 'image', data: jpeg, mimeType: 'image/jpeg' });
    assert.equal(screenshot.result.content[1].type, 'text'); assert.ok(!screenshot.result.content[1].text.includes(jpeg), 'the picture is not repeated as text');
    assert.equal(screenshot.result.structuredContent.width, 800);
    const report = { projectId: 'proj-1', seconds: 4, start: [0, 1, 0], end: [6.5, 1, 0], minY: 0.9, maxY: 2.4, path: [{ t: 0, x: 0, y: 1, z: 0 }, { t: 0.5, x: 1.2, y: 1, z: 0 }], state: { status: 'won', score: 30, lives: 3, maxLives: 3 }, events: [{ type: 'score', at: 1.2, score: 10 }, { type: 'win', at: 3.9, score: 30, lives: 3, message: 'You made it!' }], image: { mimeType: 'image/jpeg', data: jpeg } };
    const [played] = await Promise.all([tool('play_test', { steps: [{ move: 'right', seconds: 3 }, { move: 'right', jump: true, seconds: 1 }] }), answer('play_test', report)]);
    assert.equal(played.result.isError, false); assert.equal(played.result.content[0].type, 'image');
    assert.equal(played.result.structuredContent.state.status, 'won'); assert.equal(played.result.structuredContent.image.note, 'shown as an image');
    // A play report that breaks the contract (an unknown status) is refused, not passed to the AI.
    const [broken] = await Promise.all([tool('play_test', { seconds: 2 }), answer('play_test', { ...report, state: { ...report.state, status: 'cheating' } })]);
    assert.equal(broken.result.isError, true);
    // Bad arguments never reach the editor.
    for (const args of [{ seconds: 30 }, { seconds: 2, steps: [{ seconds: 1 }] }, { steps: [{ move: 'fly', seconds: 1 }] }, { steps: [{ seconds: 8 }, { seconds: 8 }] }]) assert.equal((await tool('play_test', args)).result.isError, true, JSON.stringify(args));
    assert.equal((await tool('screenshot', { width: 99999 })).result.isError, true);
    const saveBlocked = await tool('save_project', { where: 'account' });
    assert.equal(saveBlocked.result.isError, true); assert.match(saveBlocked.result.content[0].text, /Allow changes/);
    await editorApi(f, u, `/ai/editor/link/${link.linkId}`, 'PUT', { projectId: 'proj-1', projectName: 'Forest', allowWrites: true });
    const [saved] = await Promise.all([tool('save_project', { where: 'device' }), answer('save_project', { ok: true, projectId: 'proj-1', entityCount: 3, summary: 'Saved on this device.' })]);
    assert.equal(saved.result.isError, false); assert.equal(saved.result.structuredContent.summary, 'Saved on this device.');
  } finally { f.sql.close(); }
});

test('refresh tokens rotate, a reused refresh token ends the connection, and users can revoke apps', async () => {
  const f = fixture();
  try {
    const u = await user(f), { client, tokens } = await connect(f, u);
    const refreshed = await (await call(f, '/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }))).json();
    assert.ok(refreshed.access_token && refreshed.refresh_token !== tokens.refresh_token);
    const reuse = await (await call(f, '/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }))).json();
    assert.equal(reuse.error, 'invalid_grant');
    assert.equal((await mcp(f, refreshed.access_token, { id: 1, method: 'tools/list' })).status, 401, 'the whole grant was revoked');
    const second = await connect(f, u);
    const list = await (await editorApi(f, u, '/ai/connections')).json();
    assert.equal(list.mcpUrl, ORIGIN + '/mcp'); assert.equal(list.apps.length, 1);
    await editorApi(f, u, '/ai/connections/' + list.apps[0].id, 'DELETE');
    assert.equal((await mcp(f, second.tokens.access_token, { id: 1, method: 'tools/list' })).status, 401);
  } finally { f.sql.close(); }
});

test('Client ID Metadata Documents: the fetched document must name itself and its redirect URIs', async () => {
  const f = fixture(), realFetch = globalThis.fetch;
  try {
    const u = await user(f), clientId = 'https://client.example/oauth/metadata.json';
    globalThis.fetch = async url => url === clientId ? new Response(JSON.stringify({ client_id: clientId, client_name: 'Example AI', redirect_uris: ['http://127.0.0.1:4000/callback'], token_endpoint_auth_method: 'none' }), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('no', { status: 404 });
    const q = { response_type: 'code', client_id: clientId, redirect_uri: 'http://127.0.0.1:61234/callback', code_challenge: 'b'.repeat(43), code_challenge_method: 'S256' };
    const consent = await call(f, '/oauth/authorize?' + new URLSearchParams(q), { headers: { cookie: u.cookie } });
    assert.equal(consent.status, 200); assert.match(await consent.text(), /Connect Example AI\?/);
    globalThis.fetch = async () => new Response(JSON.stringify({ client_id: 'https://someone-else.example/x.json', redirect_uris: ['https://a.test/cb'] }), { status: 200 });
    const liar = await call(f, '/oauth/authorize?' + new URLSearchParams({ ...q, client_id: 'https://liar.example/client.json' }), { headers: { cookie: u.cookie } });
    assert.equal(liar.status, 400);
  } finally { globalThis.fetch = realFetch; f.sql.close(); }
});

test('the owner can pause AI app connections', async () => {
  const f = fixture();
  try {
    const u = await user(f), { tokens } = await connect(f, u);
    f.sql.prepare("UPDATE platform_feature_flags SET enabled=0 WHERE key='AI_APP_CONNECTIONS_ENABLED'").run();
    assert.equal((await mcp(f, tokens.access_token, { id: 1, method: 'tools/list' })).status, 503);
    await assert.rejects(editorApi(f, u, '/ai/editor/link', 'POST', { projectId: 'p' }), e => e.status === 503);
  } finally { f.sql.close(); }
});

test('the consent page keeps its Origin on the form post (no-referrer would make browsers send Origin: null)', async () => {
  const f = fixture();
  try {
    const u = await user(f);
    const reg = await (await call(f, '/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://app.test/cb'] }) })).json();
    const page = await call(f, '/oauth/authorize?' + new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://app.test/cb', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' }), { headers: { cookie: u.cookie } });
    assert.equal(page.status, 200); assert.notEqual(page.headers.get('referrer-policy'), 'no-referrer');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally { f.sql.close(); }
});
