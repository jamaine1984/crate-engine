import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import contentWorker from '../worker/game-content/index.mjs';
import { mountIsolatedPlayer } from '../platform/client/player-bridge.mjs';
import { createCrateShipSDK } from '../platform/sdk/crateship.mjs';

const APP = 'https://app.crateship.test', CONTENT = 'https://play-gamecontent.net';
const checksum = 'a'.repeat(64), fileBytes = new TextEncoder().encode('<!doctype html><p>Isolated game</p>');
const fileHash = createHash('sha256').update(fileBytes).digest('hex');
const manifest = [{ path: 'index.html', size: fileBytes.length, sha256: fileHash }];
const tick = () => new Promise((resolve) => setImmediate(resolve));

function workerFixture(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE platform_games(id TEXT PRIMARY KEY,status TEXT,active_version_id TEXT,price_minor INTEGER);
    CREATE TABLE platform_game_versions(id TEXT PRIMARY KEY,game_id TEXT,status TEXT,platform TEXT,scan_status TEXT,checksum TEXT);
    CREATE TABLE platform_release_manifests(game_id TEXT,version_id TEXT,manifest_json TEXT,checksum TEXT);`);
  db.prepare('INSERT INTO platform_games VALUES(?,?,?,?)').run('game-1', 'published', 'version-1', 0);
  db.prepare('INSERT INTO platform_game_versions VALUES(?,?,?,?,?,?)').run('version-1', 'game-1', 'published', 'web', 'clean', checksum);
  db.prepare('INSERT INTO platform_release_manifests VALUES(?,?,?,?)').run('game-1', 'version-1', JSON.stringify(manifest), checksum);
  const reads = [], objects = new Map([['games/game-1/version-1/index.html', { data: fileBytes, hash: fileHash }]]);
  const env = { APP_ORIGIN: APP, GAME_CONTENT_ORIGIN: CONTENT, PLATFORM_DB: sqliteD1(db), PUBLISHED_GAMES: {
    async get(key) { reads.push(key); const object = objects.get(key); return object ? { body: new Blob([object.data]).stream(), size: object.size ?? object.data.length, customMetadata: object.noMetadata ? {} : { sha256: object.hash } } : null; },
  } };
  return { db, env, reads, objects, fetch: (path = '/games/game-1/version-1/index.html', init = {}) => contentWorker.fetch(new Request(CONTENT + path, init), env) };
}

test('content worker serves only exact free reviewed web release with restrictive headers', async (t) => {
  const f = workerFixture(t); const response = await f.fetch();
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), fileBytes);
  assert.deepEqual(f.reads, ['games/game-1/version-1/index.html']);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('content-length'), String(fileBytes.length));
  assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, new RegExp(`connect-src ${CONTENT.replaceAll('.', '\\.')} blob:`));
  assert.match(csp, /'wasm-unsafe-eval'/); assert.doesNotMatch(csp, /'unsafe-eval'|(?:^|\s)https:(?:;|\s)/);
  assert.doesNotMatch(csp, /allow-same-origin|allow-top-navigation|allow-forms/);
  assert.match(csp, /sandbox allow-scripts allow-pointer-lock/); assert.match(csp, /form-action 'none'/);
});

test('HEAD has identical access checks and no response body', async (t) => {
  const f = workerFixture(t); const response = await f.fetch(undefined, { method: 'HEAD' });
  assert.equal(response.status, 200); assert.equal(await response.text(), '');
  assert.equal(response.headers.get('content-length'), String(fileBytes.length));
});

for (const [name, statement] of [
  ['paid', 'UPDATE platform_games SET price_minor=100'],
  ['suspended game', "UPDATE platform_games SET status='suspended'"],
  ['inactive version', "UPDATE platform_games SET active_version_id='other-version'"],
  ['unpublished version', "UPDATE platform_game_versions SET status='ready'"],
  ['unclean scan', "UPDATE platform_game_versions SET scan_status='pending'"],
  ['native build', "UPDATE platform_game_versions SET platform='windows'"],
  ['wrong game version', "UPDATE platform_game_versions SET game_id='other-game'"],
  ['different scan checksum', "UPDATE platform_game_versions SET checksum='bad'"],
]) {
  test(`${name} is unavailable even with caller cookies and claimed license`, async (t) => {
    const f = workerFixture(t); f.db.exec(statement);
    const response = await f.fetch('/games/game-1/version-1/index.html?license=claimed', { headers: { Cookie: 'licensed=true', Authorization: 'Bearer invented' } });
    assert.equal(response.status, 404); assert.equal(f.reads.length, 0);
  });
}

test('worker fails closed for unavailable or related-domain configuration', async (t) => {
  const f = workerFixture(t);
  for (const origin of [APP, 'https://games.crateship.test', 'http://play-gamecontent.net', 'https://play-gamecontent.net/with-path']) {
    const env = { ...f.env, GAME_CONTENT_ORIGIN: origin };
    const response = await contentWorker.fetch(new Request(CONTENT + '/games/game-1/version-1/index.html'), env);
    assert.equal(response.status, 503);
  }
  assert.equal((await contentWorker.fetch(new Request(CONTENT + '/games/game-1/version-1/index.html'), { ...f.env, GAME_CONTENT_ORIGIN: undefined })).status, 503);
  assert.equal((await f.fetch(undefined, { method: 'POST' })).status, 405);
  assert.equal(f.reads.length, 0);
});

for (const path of ['%2fsecret', '%5csecret', 'nested/%252e%252e/secret', 'nested//file.js', 'file%00.js', 'file:stream', 'NUL.txt', 'index.html.', '%ZZ', 'assets%2findex.html']) {
  test(`worker rejects unsafe path ${path} before object lookup`, async (t) => {
    const f = workerFixture(t); const response = await f.fetch(`/games/game-1/version-1/${path}`);
    assert.ok([400, 404].includes(response.status)); assert.equal(f.reads.length, 0);
  });
}

test('URL normalization cannot reuse the original game/version authorization', async (t) => {
  const f = workerFixture(t);
  const response = await f.fetch('/games/game-1/version-1/%2e%2e/other-version/index.html');
  assert.equal(response.status, 404); assert.equal(f.reads.length, 0);
  assert.equal((await f.fetch('/games/game-1/version-1/missing.js')).status, 404);
});

test('invalid manifest data, case collisions, and missing hashes fail closed', async (t) => {
  const f = workerFixture(t);
  for (const value of ['not json', '{}', JSON.stringify([{ path: 'index.html', size: 1 }]), JSON.stringify([...manifest, { ...manifest[0], path: 'INDEX.HTML' }]), JSON.stringify([...manifest, { ...manifest[0], path: '../secret' }])]) {
    f.db.prepare('UPDATE platform_release_manifests SET manifest_json=?').run(value);
    const response = await f.fetch(); assert.equal(response.status, 503); assert.equal(f.reads.length, 0);
  }
});

test('missing or inconsistent immutable object metadata blocks delivery', async (t) => {
  const f = workerFixture(t), key = 'games/game-1/version-1/index.html';
  for (const object of [{ data: fileBytes, hash: 'bad' }, { data: fileBytes, hash: fileHash, size: fileBytes.length + 1 }, { data: fileBytes, noMetadata: true }]) {
    f.objects.set(key, object); assert.equal((await f.fetch()).status, 503);
  }
  f.objects.delete(key); assert.equal((await f.fetch()).status, 404);
});

test('backend failures never disclose exception text or secrets', async (t) => {
  const f = workerFixture(t); f.env.PLATFORM_DB = { prepare() { throw new Error('SECRET=db-token bucket/private-user'); } };
  const response = await f.fetch(); assert.equal(response.status, 503);
  assert.equal(await response.text(), 'Game content unavailable');
});

function browser(t) {
  const saved = new Map(); const listeners = new Set(); const sent = [], frames = [], cleanup = [];
  const replace = (name, value) => { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); };
  replace('location', { origin: APP });
  replace('addEventListener', (type, handler) => { if (type === 'message') listeners.add(handler); });
  replace('removeEventListener', (type, handler) => { if (type === 'message') listeners.delete(handler); });
  replace('document', { createElement(name) { assert.equal(name, 'iframe'); const frame = { removed: false, contentWindow: { postMessage(data, origin) { sent.push({ data, origin }); } }, remove() { this.removed = true; } }; frames.push(frame); return frame; } });
  const parentWindow = { postMessage(data, origin) { sent.push({ data, origin }); } }; replace('parent', parentWindow);
  t.after(() => { for (const close of cleanup) close(); for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const container = { replaceChildren(frame) { this.child = frame; } };
  const dispatch = (data, override = {}) => { for (const listener of listeners) listener({ data, origin: 'null', source: frames[0]?.contentWindow, ...override }); };
  return { listeners, sent, frames, container, parentWindow, dispatch, cleanup };
}

const session = (extra = {}) => ({ id: 'session-1', gameId: 'game-1', expiresAt: Math.floor(Date.now() / 1000) + 3600, contentUrl: CONTENT + '/games/game-1/version-1/index.html', cloudSaveAvailable: true, ...extra });
const msg = (id, action, payload = {}) => ({ channel: 'crateship-v1', id, action, payload });

test('parent bridge rejects same/related origins, mismatched games and expired sessions', (t) => {
  const b = browser(t); const options = { api: async () => ({}) };
  for (const invalid of [session({ contentUrl: APP + '/games/game-1/version-1/index.html' }), session({ contentUrl: 'https://games.crateship.test/games/game-1/version-1/index.html' }), session({ gameId: 'wrong-game' }), session({ expiresAt: 1 }), session({ id: '../wallet' })]) {
    assert.throws(() => mountIsolatedPlayer(b.container, invalid, options), /secure|session/);
  }
  assert.equal(b.listeners.size, 0);
});

test('parent bridge pins opaque origin/source, validates schema and refuses wallet/reward claims', async (t) => {
  const b = browser(t); const calls = []; const player = mountIsolatedPlayer(b.container, session(), { api: async (...args) => { calls.push(args); return {}; } }); b.cleanup.push(() => player.destroy());
  b.dispatch(msg('spoof-1', 'ready'), { source: {} }); b.dispatch(msg('spoof-2', 'ready'), { origin: CONTENT });
  b.dispatch(msg('bad-1', 'wallet.credit', { amount: 1000 })); b.dispatch(msg('bad-2', 'ads.rewarded', { amount: 1000 }));
  b.dispatch(msg('bad-3', 'progress.save', { progress: {}, revision: -1 })); b.dispatch(msg('bad-4', 'progress.save', { progress: { value: 2n }, revision: 0 }));
  const circular = {}; circular.self = circular; b.dispatch(msg('bad-5', 'progress.save', { progress: circular, revision: 0 }));
  b.dispatch(msg('bad-6', 'progress.save', { progress: { text: 'x'.repeat(100000) }, revision: 0 }));
  b.dispatch(msg('ready-1', 'ready')); b.dispatch(msg('ad-1', 'ads.rewarded'));
  await tick();
  assert.equal(calls.length, 0); assert.equal(b.sent.length, 2);
  assert.deepEqual(b.sent[0].data.result, { cloudSaveAvailable: true, adsEnabled: false, rewardsEnabled: false });
  assert.deepEqual(b.sent[1].data.result, { available: false, rewardGranted: false });
  assert.equal(player.frame.sandbox, 'allow-scripts allow-pointer-lock'); assert.doesNotMatch(player.frame.sandbox, /allow-same-origin/);
});

test('progress requests are pinned to a captured session and only approved response fields cross back', async (t) => {
  const b = browser(t), calls = [], active = session();
  const player = mountIsolatedPlayer(b.container, active, { api: async (path, options) => { calls.push({ path, options }); return options.method === 'PUT' ? { saved: true, revision: 2, token: 'SECRET' } : { progress: { level: 3 }, revision: 1, token: 'SECRET' }; } }); b.cleanup.push(() => player.destroy());
  active.id = 'other-session'; active.cloudSaveAvailable = false;
  b.dispatch(msg('load-1', 'progress.load')); b.dispatch(msg('save-1', 'progress.save', { progress: { level: 4 }, revision: 1 }));
  await tick();
  assert.equal(calls.length, 2); assert.ok(calls.every((call) => call.path === '/player/sessions/session-1/progress'));
  assert.deepEqual(calls[1].options.body, { progress: { level: 4 }, revision: 1 });
  assert.equal(JSON.stringify(b.sent).includes('SECRET'), false);
  assert.deepEqual(b.sent.map((entry) => entry.data.result), [{ progress: { level: 3 }, revision: 1 }, { saved: true, revision: 2 }]);
});

test('replayed message ids stay rejected across minute rate-window resets', async (t) => {
  const b = browser(t); const originalNow = Date.now; let clock = originalNow(); Date.now = () => clock; t.after(() => { Date.now = originalNow; });
  const player = mountIsolatedPlayer(b.container, session(), { api: async () => ({}) }); b.cleanup.push(() => player.destroy());
  b.dispatch(msg('same-id', 'ready')); await tick(); clock += 61000; b.dispatch(msg('same-id', 'ready')); await tick();
  assert.equal(b.sent.length, 1);
});

test('message floods cannot create an unbounded privileged request queue', async (t) => {
  const b = browser(t); let resolveFirst; let calls = 0;
  const player = mountIsolatedPlayer(b.container, session(), { api: async () => { calls++; if (calls === 1) await new Promise((resolve) => { resolveFirst = resolve; }); return { progress: null, revision: 0 }; } }); b.cleanup.push(() => player.destroy());
  for (let i = 0; i < 10000; i++) b.dispatch(msg('flood-' + i, 'progress.load'));
  await tick(); assert.equal(calls, 1); assert.equal(b.sent.length, 82);
  resolveFirst(); await tick(); assert.equal(calls, 8); assert.equal(b.sent.length, 90);
});

test('private backend exception text never crosses the parent bridge', async (t) => {
  const b = browser(t); const player = mountIsolatedPlayer(b.container, session(), { api: async () => { throw new Error('SECRET=provider-token internal/account/key'); } }); b.cleanup.push(() => player.destroy());
  b.dispatch(msg('load-error', 'progress.load')); await tick();
  assert.equal(b.sent[0].data.error, 'The platform request could not be completed.');
  assert.equal(JSON.stringify(b.sent).includes('SECRET'), false);
});

test('guest cloud requests are denied and destroying the player aborts pending work', async (t) => {
  const b = browser(t); let calls = 0;
  const guest = mountIsolatedPlayer(b.container, session({ cloudSaveAvailable: false }), { api: async () => { calls++; } });
  b.dispatch(msg('guest', 'progress.load')); await tick(); assert.equal(calls, 0); assert.equal(b.sent[0].data.error, 'Sign in for cloud saves.'); guest.destroy();
  b.frames.length = 0; b.sent.length = 0; let signal;
  const active = mountIsolatedPlayer(b.container, session(), { api: async (_path, options) => { signal = options.signal; return new Promise(() => {}); } });
  b.dispatch(msg('pending', 'progress.load')); await tick(); active.destroy(); await tick();
  assert.equal(signal.aborted, true); assert.equal(b.listeners.size, 0); assert.equal(b.sent.length, 0);
});

test('SDK accepts only responses from the pinned parent origin/source and ignores replay', async (t) => {
  const b = browser(t); const sdk = createCrateShipSDK(APP); b.cleanup.push(() => sdk.destroy());
  const promise = sdk.configuration(), request = b.sent[0];
  assert.equal(request.origin, APP); assert.equal(request.data.action, 'configuration');
  const response = { channel: 'crateship-v1', id: request.data.id, result: { adsEnabled: false, rewardsEnabled: false } };
  let resolved = false; promise.then(() => { resolved = true; });
  b.dispatch(response, { source: {}, origin: APP }); b.dispatch(response, { source: b.parentWindow, origin: CONTENT }); await tick(); assert.equal(resolved, false);
  b.dispatch(response, { source: b.parentWindow, origin: APP }); assert.deepEqual(await promise, { adsEnabled: false, rewardsEnabled: false });
  b.dispatch({ ...response, result: { rewardsEnabled: true } }, { source: b.parentWindow, origin: APP }); await tick();
  assert.equal(b.sent.length, 1);
});

