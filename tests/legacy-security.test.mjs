import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as games } from '../functions/api/games/[[path]].js';
import { onRequest as assets } from '../functions/api/assets/[[path]].js';
import { accountOwnerHash } from '../functions/_security/legacy-write.mjs';
import { validateModelFile } from '../functions/_security/model-file.mjs';
import { tokenHash, base64url } from '../platform/server/identity.mjs';

const origin = 'https://crateshipgames.test';
const sessionToken = base64url(new Uint8Array(32).fill(7));
const time = () => Math.floor(Date.now() / 1000);
const clone = (value) => value === undefined ? undefined : structuredClone(value);

class MemoryKV {
  constructor(records = {}) { this.records = new Map(Object.entries(records)); this.mutations = []; }
  async get(key) { return clone(this.records.get(key)) || null; }
  async put(key, value) { this.mutations.push(['put', key]); this.records.set(key, JSON.parse(value)); }
  async delete(key) { this.mutations.push(['delete', key]); this.records.delete(key); }
  async list({ prefix = '' } = {}) { return { keys: [...this.records].filter(([name]) => name.startsWith(prefix)).map(([name, value]) => ({ name, metadata: value })), list_complete: true }; }
}

class MemoryR2 {
  constructor() { this.records = new Map(); this.mutations = []; }
  seed(key, value, contentType = 'application/json') {
    const data = value instanceof ArrayBuffer ? value : new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).buffer;
    this.records.set(key, { data, contentType });
  }
  async get(key) {
    const record = this.records.get(key); if (!record) return null;
    return { text: async () => new TextDecoder().decode(record.data), arrayBuffer: async () => record.data.slice(0),
      body: new Blob([record.data]).stream(), size: record.data.byteLength, httpMetadata: { contentType: record.contentType } };
  }
  async put(key, value, options = {}) {
    this.mutations.push(['put', key]);
    this.seed(key, value, options.httpMetadata?.contentType);
  }
  async delete(key) { this.mutations.push(['delete', key]); this.records.delete(key); }
  async list({ prefix = '' } = {}) { return { objects: [...this.records.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })), truncated: false }; }
}

// Exercise the real opaque-cookie identity adapter against an in-memory D1
// boundary. Tests never add an authentication bypass to production handlers.
function identityDatabase(user) {
  return {
    batch: async () => [],
    prepare(sql) {
      let values = [];
      return {
        bind(...parameters) { values = parameters; return this; },
        async first() {
          if (/platform_sessions/.test(sql) && /SELECT/.test(sql)) {
            const hash = await tokenHash(sessionToken);
            if (!values.includes(hash) || !user) return null;
            return { id: user.id, user_id: user.id, session_id: 'session-test', email: `${user.id}@example.test`,
              username: user.id, display_name: user.id, email_verified: user.emailVerified === false ? 0 : 1,
              status: 'active', auth_time: time(), mfa_time: user.mfaTime || null, session_created_at: time(), last_seen_at: time(),
              expires_at: time() + 3600, revoked_at: null };
          }
          if (/platform_users/.test(sql) && /SELECT/.test(sql)) return { id: user.id, email: `${user.id}@example.test`, username: user.id, display_name: user.id, email_verified: 1, status: 'active' };
          throw new Error(`Unexpected first query in security test: ${sql}`);
        },
        async all() {
          if (/platform_user_roles/.test(sql)) return { results: (user?.roles || ['PLAYER']).map((role) => ({ role })) };
          throw new Error(`Unexpected all query in security test: ${sql}`);
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
  };
}

function setup(user = { id: 'alice', roles: ['PLAYER'] }, records = {}) {
  return { APP_ORIGIN: origin, AUTH_SECRET: base64url(new Uint8Array(32).fill(13)), PLATFORM_DB: identityDatabase(user), CRATE_GAMES: new MemoryKV(records), CRATE_USER_ASSETS: new MemoryR2() };
}

function requestContext(env, path, { method = 'GET', body, cookie = true, headers = {} } = {}) {
  const requestHeaders = { ...(cookie ? { Cookie: `__Host-crateship_session=${sessionToken}` } : {}), ...headers };
  if (!['GET', 'HEAD'].includes(method)) requestHeaders.Origin ??= origin;
  if (body && !(body instanceof FormData)) requestHeaders['Content-Type'] = 'application/json';
  return { env, params: { path: path ? path.split('/') : [] }, request: new Request(`${origin}/api/${path}`, {
    method, headers: requestHeaders, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  }) };
}

const game = (extra = {}) => ({ slug: 'owned-game', title: 'Original', ownerUserId: 'bob', visibility: 'public', moderationStatus: 'active', featured: false, cloudAssets: [], projectData: '{}', ...extra });

function glb(document = { asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }) {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const padded = Math.ceil(json.length / 4) * 4;
  const buffer = new ArrayBuffer(20 + padded); const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20).fill(32); new Uint8Array(buffer, 20, json.length).set(json);
  return buffer;
}

async function seedOwnedAsset(env, ownerId = 'alice') {
  const ownerHash = await accountOwnerHash({ id: ownerId });
  const record = { id: 'model-1', ownerUserId: ownerId, fileName: 'model.glb', contentType: 'model/gltf-binary', sizeBytes: glb().byteLength,
    key: `user-assets/${ownerHash}/model-1/model.glb` };
  env.CRATE_USER_ASSETS.seed(`user-assets/${ownerHash}/index.json`, { assets: [record] });
  env.CRATE_USER_ASSETS.seed(record.key, glb(), record.contentType);
  return record;
}

test('anonymous owner/admin bearer strings cannot mutate legacy games', async () => {
  const env = setup(null, { 'game:owned-game': game() });
  env.CRATE_ADMIN_TOKEN = 'legacy-secret';
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const path = method === 'POST' ? 'publish' : 'owned-game';
    const response = await games(requestContext(env, path, { method, cookie: false, body: method === 'DELETE' ? undefined : { title: 'Attack', projectData: '{}' }, headers: { 'X-Crate-Owner-Token': 'invented', 'X-Crate-Admin-Token': 'legacy-secret' } }));
    assert.ok([401, 403].includes(response.status));
  }
  assert.equal(env.CRATE_GAMES.mutations.length, 0);
});

test('missing identity database fails closed before a write', async () => {
  const env = setup(); delete env.PLATFORM_DB;
  const response = await games(requestContext(env, 'publish', { method: 'POST', body: { title: 'Attack', projectData: '{}' } }));
  assert.equal(response.status, 503); assert.equal(env.CRATE_GAMES.mutations.length, 0);
});

test('retired direct publishing never reads ownership storage or creates a game', async () => {
  const env = setup(); let lookups = 0; env.CRATE_GAMES.get = async () => { lookups++; throw new Error('Transient storage failure'); };
  const response = await games(requestContext(env, 'publish', { method: 'POST', body: { slug: 'owned-game', projectData: '{}' } }));
  assert.equal(response.status, 410); assert.equal(lookups, 0); assert.equal(env.CRATE_GAMES.mutations.length, 0);
});

test('cross-origin cookie requests and unverified accounts cannot write', async () => {
  const env = setup();
  const cross = await games(requestContext(env, 'publish', { method: 'POST', body: { projectData: '{}' }, headers: { Origin: 'https://attacker.test' } }));
  assert.equal(cross.status, 403);
  const unverified = setup({ id: 'alice', emailVerified: false, roles: ['PLAYER'] });
  const denied = await games(requestContext(unverified, 'publish', { method: 'POST', body: { projectData: '{}' } }));
  assert.equal(denied.status, 403);
  assert.equal(env.CRATE_GAMES.mutations.length + unverified.CRATE_GAMES.mutations.length, 0);
});

for (const role of ['PLAYER', 'MODERATOR', 'CONTENT_MANAGER']) {
  test(`${role} cannot delete, republish or change another owner's game metadata`, async () => {
    const env = setup({ id: 'alice', roles: [role] }, { 'game:owned-game': game() });
    for (const [method, path, body] of [['DELETE', 'owned-game'], ['POST', 'publish', { slug: 'owned-game', projectData: '{}' }], ['PATCH', 'owned-game', { title: 'Hijacked' }]]) {
      const response = await games(requestContext(env, path, { method, body })); assert.equal(response.status, method === 'POST' ? 410 : 403);
    }
    assert.equal(env.CRATE_GAMES.mutations.length, 0);
  });
}

test('moderator may hide content but cannot feature it', async () => {
  const env = setup({ id: 'alice', roles: ['MODERATOR'] }, { 'game:owned-game': game() });
  assert.equal((await games(requestContext(env, 'owned-game', { method: 'PATCH', body: { moderationStatus: 'hidden' } }))).status, 200);
  assert.equal((await games(requestContext(env, 'owned-game', { method: 'PATCH', body: { featured: true } }))).status, 403);
  assert.equal(env.CRATE_GAMES.records.get('game:owned-game').featured, false);
});

test('content manager may feature content but cannot hide it', async () => {
  const env = setup({ id: 'alice', roles: ['CONTENT_MANAGER'] }, { 'game:owned-game': game() });
  assert.equal((await games(requestContext(env, 'owned-game', { method: 'PATCH', body: { featured: true } }))).status, 200);
  assert.equal((await games(requestContext(env, 'owned-game', { method: 'PATCH', body: { moderationStatus: 'hidden' } }))).status, 403);
});

test('owner privileged mutation requires recent MFA', async () => {
  const env = setup({ id: 'alice', roles: ['OWNER'] }, { 'game:owned-game': game() });
  assert.equal((await games(requestContext(env, 'owned-game', { method: 'DELETE' }))).status, 403);
  assert.equal(env.CRATE_GAMES.mutations.length, 0);
});

test('legacy capability ownership is never silently migrated into an account', async () => {
  const env = setup(undefined, { 'game:owned-game': game({ ownerUserId: undefined, ownerHash: 'legacy-hash' }) });
  const response = await games(requestContext(env, 'publish', { method: 'POST', body: { slug: 'owned-game', ownerToken: 'legacy', projectData: '{}' } }));
  assert.equal(response.status, 410); assert.equal(env.CRATE_GAMES.mutations.length, 0);
});

test('platform administrators also cannot silently write unassigned legacy ownership', async () => {
  const env = setup({ id: 'alice', roles: ['PLATFORM_ADMIN'] }, { 'game:owned-game': game({ ownerUserId: undefined, ownerHash: 'legacy-hash' }) });
  for (const method of ['PATCH', 'DELETE']) {
    const response = await games(requestContext(env, 'owned-game', { method, body: method === 'PATCH' ? { title: 'Claimed' } : undefined }));
    assert.equal(response.status, 403);
  }
  assert.equal(env.CRATE_GAMES.mutations.length, 0);
});

test('client-supplied references cannot attach another owner public asset', async () => {
  const env = setup();
  env.CRATE_USER_ASSETS.seed('published-assets/victim/asset.json', { ownerUserId: 'bob', gameSlug: 'new-game', fileName: 'model.glb' });
  const response = await games(requestContext(env, 'publish', { method: 'POST', body: { slug: 'new-game', projectData: '{}', cloudAssets: [{ publicId: 'victim' }] } }));
  assert.equal(response.status, 410); assert.equal(env.CRATE_GAMES.mutations.length, 0);
  assert.equal(env.CRATE_USER_ASSETS.mutations.length, 0);
});

test('deleting an owned game never deletes client-referenced public assets', async () => {
  const env = setup(undefined, { 'game:owned-game': game({ ownerUserId: 'alice', cloudAssets: [{ publicId: 'victim' }] }) });
  env.CRATE_USER_ASSETS.seed('published-assets/victim/asset.json', { ownerUserId: 'bob' });
  const response = await games(requestContext(env, 'owned-game', { method: 'DELETE' }));
  assert.equal(response.status, 200); assert.equal((await response.json()).publicAssetCleanup.deferred, true);
  assert.equal(env.CRATE_USER_ASSETS.mutations.length, 0);
});

test('public id collision cannot replace another owner asset', async () => {
  const env = setup(undefined, { 'game:owned-game': game({ ownerUserId: 'alice' }) }); await seedOwnedAsset(env);
  env.CRATE_USER_ASSETS.seed('published-assets/victim/asset.json', { ownerUserId: 'bob', gameSlug: 'owned-game', key: 'victim-data' });
  const response = await assets(requestContext(env, 'model-1/publish', { method: 'POST', body: { gameSlug: 'owned-game', publicId: 'victim' } }));
  assert.equal(response.status, 403); assert.equal(env.CRATE_USER_ASSETS.mutations.length, 0);
});

test('new public ids are server assigned and bound to a verified owned game', async () => {
  const env = setup(undefined, { 'game:owned-game': game({ ownerUserId: 'alice' }) }); await seedOwnedAsset(env);
  const invented = await assets(requestContext(env, 'model-1/publish', { method: 'POST', body: { gameSlug: 'owned-game', publicId: 'chosen-id' } }));
  assert.equal(invented.status, 403);
  const mismatch = await assets(requestContext(env, 'model-1/publish', { method: 'POST', body: { gameSlug: 'other-game' } }));
  assert.equal(mismatch.status, 403);
  const valid = await assets(requestContext(env, 'model-1/publish', { method: 'POST', body: { gameSlug: 'owned-game' } }));
  assert.equal(valid.status, 200); assert.match((await valid.json()).asset.publicId, /^pub_[a-f0-9]{64}$/);
});

test('HTML disguised as GLB is rejected without writing storage', async () => {
  const env = setup(); const form = new FormData(); form.set('file', new Blob(['<!doctype html><script>alert(1)</script>'], { type: 'text/html' }), 'model.glb');
  const response = await assets(requestContext(env, '', { method: 'POST', body: form }));
  assert.equal(response.status, 400); assert.equal(env.CRATE_USER_ASSETS.mutations.length, 0);
});

test('validated models ignore caller-supplied executable MIME', async () => {
  const env = setup(); const form = new FormData(); form.set('file', new Blob([glb()], { type: 'text/html' }), 'model.glb');
  const response = await assets(requestContext(env, '', { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  const payload = await response.json(); assert.equal(payload.asset.contentType, 'model/gltf-binary');
  const read = await assets(requestContext(env, payload.asset.id + '/download'));
  assert.equal(read.status, 200); assert.equal(read.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
  assert.match(read.headers.get('content-disposition'), /^attachment;/);
});

test('old public downloads cannot serve stored executable MIME', async () => {
  const env = setup(); env.CRATE_USER_ASSETS.seed('published-assets/old/asset.json', { key: 'old-data', fileName: 'bad.glb', contentType: 'text/html' });
  env.CRATE_USER_ASSETS.seed('old-data', '<script>bad()</script>', 'text/html');
  const response = await assets(requestContext(env, 'public/old/download', { cookie: false }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
});

test('public cleanup deletion is disabled even for an authenticated platform admin', async () => {
  const env = setup({ id: 'alice', roles: ['PLATFORM_ADMIN'] });
  const response = await assets(requestContext(env, 'admin/public-cleanup', { method: 'POST', body: { delete: true } }));
  assert.equal(response.status, 503); assert.equal(env.CRATE_USER_ASSETS.mutations.length, 0);
});

test('public reads remain available without platform identity configuration', async () => {
  const env = setup(null, { 'game:owned-game': game() }); delete env.PLATFORM_DB;
  const response = await games(requestContext(env, 'owned-game', { cookie: false }));
  assert.equal(response.status, 200); assert.equal((await response.json()).game.title, 'Original');
});

test('authorized hidden game reads never declare shared caching', async () => {
  const env = setup({ id: 'alice', roles: ['PLATFORM_ADMIN'] }, { 'game:owned-game': game({ moderationStatus: 'hidden' }) });
  const response = await games(requestContext(env, 'owned-game'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('structural model validation rejects malformed GLB and external/active texture resources', () => {
  assert.doesNotThrow(() => validateModelFile(glb(), 'glb'));
  const malformed = glb(); new DataView(malformed).setUint32(8, 99, true);
  assert.throws(() => validateModelFile(malformed, 'glb'), /signature, version, or length/);
  const json = (value) => new TextEncoder().encode(JSON.stringify(value)).buffer;
  assert.throws(() => validateModelFile(json({ asset: { version: '2.0' }, buffers: [{ byteLength: 10, uri: 'https://attacker.test/tracker' }] }), 'gltf'), /self-contained/);
  assert.throws(() => validateModelFile(json({ asset: { version: '2.0' }, images: [{ uri: 'data:image/svg+xml;base64,AAAA' }] }), 'gltf'), /PNG, JPEG, or WebP/);
  assert.throws(() => validateModelFile(new TextEncoder().encode('<html></html>').buffer, 'gltf'), /invalid glTF JSON/);
});
