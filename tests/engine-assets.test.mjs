import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { base64url, tokenHash } from '../platform/server/identity.mjs';
import { HttpError } from '../platform/server/common.mjs';
import { handleEngineAssets, engineAssetErasureStatements, purgeEngineAssets } from '../platform/server/engine-assets.mjs';
import { hashBytes, MAX_MODEL_BYTES } from '../engine/core/gltf.mjs';

const migrationDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort().map(name => readFile(new URL(name, migrationDir), 'utf8')));
const stamp = () => Math.floor(Date.now() / 1000);
const key = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const reject = (status, code) => error => error instanceof HttpError && error.status === status && (!code || error.code === code);
test('maintenance preserves recent uploads and queues abandoned reservations before releasing quota',async t=>{const f=fixture(t),user=await actor(f);await upload(f,user);await upload(f,user,glb({extras:{fixture:'recent'}}));const rows=f.sql.prepare('SELECT * FROM platform_engine_assets ORDER BY created_at,id').all();f.sql.prepare("UPDATE platform_engine_assets SET status='pending',created_at=? WHERE id=?").run(stamp()-90000,rows[0].id);f.sql.prepare("UPDATE platform_engine_assets SET status='pending' WHERE id=?").run(rows[1].id);assert.deepEqual(await purgeEngineAssets(f.env),{deleted:0,failed:0});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_assets').get().n,1);assert.equal(f.sql.prepare('SELECT id FROM platform_engine_assets').get().id,rows[1].id);const queued=f.sql.prepare('SELECT * FROM platform_engine_asset_purge_queue').get();assert.equal(queued.id,rows[0].id);assert.ok(queued.not_before>stamp());assert.equal(f.env.ENGINE_ASSETS.files.has(rows[0].storage_key),true);});
function glb(extra = {}) {
  const document = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], ...extra }));
  const size = Math.ceil(document.byteLength / 4) * 4, bytes = new Uint8Array(20 + size), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, size, true); view.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20); bytes.set(document, 20); return bytes;
}
function bucket() {
  const files = new Map(), events = [];
  return { files, events, async put(key, bytes, options) { events.push({ op: 'put', key, options }); files.set(key, new Uint8Array(bytes)); return { key }; },
    async get(key) { events.push({ op: 'get', key }); const bytes = files.get(key); return bytes ? { body: bytes, size: bytes.length } : null; },
    async delete(key) { events.push({ op: 'delete', key }); files.delete(key); } };
}
function fixture(t, extra = {}) {
  const sql = new DatabaseSync(':memory:'); migrations.forEach(migration => sql.exec(migration));
  const f = { sql, env: { PLATFORM_DB: sqliteD1(sql), APP_ORIGIN: 'https://example.test', AUTH_SECRET: key(), ENCRYPTION_KEY: key(), ENGINE_ASSETS: bucket(), ...extra } };
  t.after(() => sql.close()); return f;
}
async function actor(f, verified = true) {
  const id = crypto.randomUUID(), token = key(), at = stamp();
  f.sql.prepare(`INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)`)
    .run(id, `${id}@example.test`, `u_${id}`, 'Fixture', Number(verified), at, at);
  f.sql.prepare('INSERT INTO platform_user_roles VALUES(?,?,?)').run(id, 'PLAYER', at);
  f.sql.prepare(`INSERT INTO platform_sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at,auth_time,user_agent,ip_hash) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), await tokenHash(token), id, at, at + 3600, at, at, 'fixture', 'fixture');
  return { id, cookie: `__Host-crateship_session=${token}` };
}
function request(f, user, path = '/engine/assets', method = 'POST', bytes = glb(), headers = {}) {
  return new Request(`${f.env.APP_ORIGIN}/api/platform${path}`, { method,
    headers: { origin: f.env.APP_ORIGIN, 'content-type': 'model/gltf-binary', 'x-asset-name': encodeURIComponent('My model.glb'), ...(user ? { cookie: user.cookie } : {}), ...headers },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body: bytes }) });
}
const upload = (f, user, bytes = glb(), headers = {}) => handleEngineAssets(request(f, user, '/engine/assets', 'POST', bytes, headers), f.env, '/engine/assets');
const download = (f, user, id) => handleEngineAssets(request(f, user, `/engine/assets/${id}`, 'GET'), f.env, `/engine/assets/${id}`);

test('stores validated GLB bytes privately and returns only safe asset metadata', async t => {
  const f = fixture(t), user = await actor(f), bytes = glb();
  const response = await upload(f, user, bytes), result = await response.json(); assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(result.asset).sort(), ['id', 'name', 'sha256', 'size']); assert.equal(result.asset.sha256, await hashBytes(bytes));
  assert.equal(result.asset.size, bytes.length); assert.equal(result.asset.name, 'My model.glb');
  const saved = f.sql.prepare('SELECT * FROM platform_engine_assets').get(); assert.equal(saved.status, 'ready'); assert.equal(saved.user_id, user.id);
  assert.match(saved.storage_key, /^engine-private\//); assert.deepEqual(f.env.ENGINE_ASSETS.files.get(saved.storage_key), bytes);
  assert.equal(f.env.ENGINE_ASSETS.events[0].options.httpMetadata.contentType, 'model/gltf-binary');
});

test('authenticated own downloads preserve bytes with private no-store and inert headers', async t => {
  const f = fixture(t), user = await actor(f), bytes = glb(), { asset } = await (await upload(f, user, bytes)).json();
  const response = await download(f, user, asset.id);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary'); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.match(response.headers.get('content-disposition'), /^attachment;/); assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('real session, email verification, origin, and object ownership are required', async t => {
  const f = fixture(t), owner = await actor(f), other = await actor(f), unverified = await actor(f, false);
  await assert.rejects(upload(f, null), reject(401)); await assert.rejects(upload(f, unverified), reject(403, 'EMAIL_VERIFICATION_REQUIRED'));
  await assert.rejects(upload(f, owner, glb(), { origin: 'https://evil.test' }), reject(403, 'ORIGIN_DENIED'));
  const { asset } = await (await upload(f, owner)).json(); const events = f.env.ENGINE_ASSETS.events.length;
  await assert.rejects(download(f, other, asset.id), reject(404)); await assert.rejects(download(f, null, asset.id), reject(401));
  assert.equal(f.env.ENGINE_ASSETS.events.length, events);
});

test('unconfigured R2 returns an explicit unavailable state before reserving', async t => {
  const f = fixture(t, { ENGINE_ASSETS: undefined }), user = await actor(f);
  await assert.rejects(upload(f, user), reject(503, 'ENGINE_ASSET_STORAGE_UNAVAILABLE'));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_assets').get().n, 0);
});

test('requires binary GLB content type and a valid encoded display name', async t => {
  const f = fixture(t), user = await actor(f);
  await assert.rejects(upload(f, user, glb(), { 'content-type': 'text/html' }), reject(415, 'ENGINE_ASSET_TYPE_INVALID'));
  for (const name of ['', '%ZZ', encodeURIComponent('../evil.glb'), encodeURIComponent('bad\nname.glb'), 'x'.repeat(121)]) {
    await assert.rejects(upload(f, user, glb(), { 'x-asset-name': name }), reject(400, 'ENGINE_ASSET_NAME_INVALID'));
  }
  assert.equal(f.env.ENGINE_ASSETS.events.length, 0);
});

test('rejects invalid GLB headers, lengths, external URLs, and excessive complexity', async t => {
  const f = fixture(t), user = await actor(f);
  const wrongLength = glb(); new DataView(wrongLength.buffer).setUint32(8, 9999, true);
  for (const bytes of [new TextEncoder().encode('<script>bad</script>'), wrongLength,
    glb({ images: [{ uri: 'https://private.example/texture.png' }] }), glb({ buffers: [{ uri: 'file:///private/path.bin' }] }),
    glb({ nodes: Array.from({ length: 10001 }, () => ({})) })]) {
    await assert.rejects(upload(f, user, bytes), reject(400, 'ENGINE_ASSET_INVALID_GLB'));
  }
  assert.equal(f.env.ENGINE_ASSETS.events.length, 0);
});

test('32 MiB cap is enforced on declared size and actual body bytes', async t => {
  const f = fixture(t), user = await actor(f);
  await assert.rejects(upload(f, user, glb(), { 'content-length': String(MAX_MODEL_BYTES + 1) }), reject(413, 'ENGINE_ASSET_TOO_LARGE'));
  await assert.rejects(upload(f, user, new Uint8Array(MAX_MODEL_BYTES + 1)), reject(413, 'ENGINE_ASSET_TOO_LARGE'));
  assert.equal(f.env.ENGINE_ASSETS.events.length, 0);
});

test('identical content deduplicates within an account without cross-account sharing', async t => {
  const f = fixture(t), a = await actor(f), b = await actor(f), bytes = glb();
  const first = await (await upload(f, a, bytes)).json(), repeated = await (await upload(f, a, bytes)).json(), secondUser = await (await upload(f, b, bytes)).json();
  assert.equal(repeated.reused, true); assert.equal(first.asset.id, repeated.asset.id); assert.notEqual(first.asset.id, secondUser.asset.id);
  assert.equal(f.env.ENGINE_ASSETS.events.filter(e => e.op === 'put').length, 2);
});

test('concurrent identical content reserves only one upload', async t => {
  const f = fixture(t), user = await actor(f); let release, started;
  const gate = new Promise(resolve => { release = resolve; }), began = new Promise(resolve => { started = resolve; });
  const realPut = f.env.ENGINE_ASSETS.put;
  f.env.ENGINE_ASSETS.put = async (...args) => { started(); await gate; return realPut(...args); };
  const first = upload(f, user); await began;
  await assert.rejects(upload(f, user), reject(409, 'ENGINE_ASSET_PENDING')); release(); await first;
  assert.equal(f.env.ENGINE_ASSETS.events.filter(e => e.op === 'put').length, 1);
});

test('atomic count quota includes pending uploads across concurrent requests', async t => {
  const f = fixture(t, { ENGINE_ASSET_QUOTA_COUNT: '1' }), user = await actor(f);
  const outcomes = await Promise.allSettled([upload(f, user, glb({ extras: { name: 'a' } })), upload(f, user, glb({ extras: { name: 'b' } }))]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'ENGINE_ASSET_QUOTA');
  assert.equal(f.env.ENGINE_ASSETS.events.filter(e => e.op === 'put').length, 1);
});

test('byte quota prevents storage calls before upload', async t => {
  const f = fixture(t, { ENGINE_ASSET_QUOTA_BYTES: '1' }), user = await actor(f);
  await assert.rejects(upload(f, user), reject(409, 'ENGINE_ASSET_QUOTA')); assert.equal(f.env.ENGINE_ASSETS.events.length, 0);
});

test('ambiguous storage failure releases quota but keeps an object purge reference', async t => {
  const f = fixture(t), user = await actor(f), realPut = f.env.ENGINE_ASSETS.put;
  f.env.ENGINE_ASSETS.put = async (...args) => { await realPut(...args); throw new Error('storage failure with private details'); };
  await assert.rejects(upload(f, user), error => reject(503, 'ENGINE_ASSET_WRITE_FAILED')(error) && !error.message.includes('private details'));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_assets').get().n, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_asset_purge_queue').get().n, 1);
  assert.equal(f.env.ENGINE_ASSETS.files.size, 1);
});

test('missing or incomplete saved objects fail closed', async t => {
  const f = fixture(t), user = await actor(f), { asset } = await (await upload(f, user)).json();
  const stored = f.sql.prepare('SELECT * FROM platform_engine_assets').get(); f.env.ENGINE_ASSETS.files.set(stored.storage_key, new Uint8Array(1));
  await assert.rejects(download(f, user, asset.id), reject(503, 'ENGINE_ASSET_OBJECT_UNAVAILABLE'));
  f.env.ENGINE_ASSETS.files.clear(); await assert.rejects(download(f, user, asset.id), reject(503, 'ENGINE_ASSET_OBJECT_UNAVAILABLE'));
});

test('account erasure atomically removes access and queues only its private objects', async t => {
  const f = fixture(t), a = await actor(f), b = await actor(f), { asset } = await (await upload(f, a)).json(); await upload(f, b);
  await f.env.PLATFORM_DB.batch(engineAssetErasureStatements(f.env, a.id));
  await assert.rejects(download(f, a, asset.id), reject(404));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_assets WHERE user_id=?').get(b.id).n, 1);
  const queued = f.sql.prepare('SELECT * FROM platform_engine_asset_purge_queue').get(); assert.equal(queued.user_id, a.id); assert.ok(queued.not_before >= stamp() + 899);
  assert.deepEqual(await purgeEngineAssets(f.env), { deleted: 0, failed: 0 });
  f.sql.prepare('UPDATE platform_engine_asset_purge_queue SET not_before=0').run();
  assert.deepEqual(await purgeEngineAssets(f.env), { deleted: 1, failed: 0 }); assert.equal(f.env.ENGINE_ASSETS.files.size, 1);
});

test('erasure transaction rollback retains both ownership and purge atomicity', async t => {
  const f = fixture(t), user = await actor(f); await upload(f, user);
  await assert.rejects(f.env.PLATFORM_DB.batch([...engineAssetErasureStatements(f.env, user.id), f.env.PLATFORM_DB.prepare('INSERT INTO nonexistent_table VALUES(1)')]));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_assets').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_asset_purge_queue').get().n, 0);
});

test('trusted purge retries failed R2 deletion and never deletes a foreign namespace', async t => {
  const f = fixture(t), user = await actor(f); await upload(f, user); await f.env.PLATFORM_DB.batch(engineAssetErasureStatements(f.env, user.id));
  f.sql.prepare('UPDATE platform_engine_asset_purge_queue SET not_before=0').run();
  const realDelete = f.env.ENGINE_ASSETS.delete; f.env.ENGINE_ASSETS.delete = async () => { throw new Error('offline'); };
  assert.deepEqual(await purgeEngineAssets(f.env), { deleted: 0, failed: 1 }); assert.equal(f.sql.prepare('SELECT attempts FROM platform_engine_asset_purge_queue').get().attempts, 1);
  f.env.ENGINE_ASSETS.delete = realDelete; assert.deepEqual(await purgeEngineAssets(f.env), { deleted: 1, failed: 0 });
  f.sql.prepare('INSERT INTO platform_engine_asset_purge_queue(id,user_id,storage_key,created_at,not_before) VALUES(?,?,?,?,?)').run('foreign', user.id, 'published-games/game.glb', stamp(), 0);
  assert.deepEqual(await purgeEngineAssets(f.env), { deleted: 0, failed: 1 });
  assert.equal(f.env.ENGINE_ASSETS.events.some(e => e.key === 'published-games/game.glb'), false);
});

test('account deletion during upload prevents a new accessible object and retains purge', async t => {
  const f = fixture(t), user = await actor(f); let release, started;
  const gate = new Promise(resolve => { release = resolve; }), began = new Promise(resolve => { started = resolve; });
  const realPut = f.env.ENGINE_ASSETS.put; f.env.ENGINE_ASSETS.put = async (...args) => { started(); await gate; return realPut(...args); };
  const uploading = upload(f, user); await began;
  await f.env.PLATFORM_DB.batch(engineAssetErasureStatements(f.env, user.id));
  f.sql.prepare("UPDATE platform_users SET status='deleted' WHERE id=?").run(user.id); release();
  await assert.rejects(uploading, reject(503, 'ENGINE_ASSET_WRITE_FAILED'));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_assets').get().n, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_asset_purge_queue').get().n, 1);
});

test('upload rate limit prevents repeated invalid body work beyond cap', async t => {
  const f = fixture(t), user = await actor(f), bytes = new Uint8Array(1);
  for (let i = 0; i < 20; i++) await assert.rejects(upload(f, user, bytes), reject(400, 'ENGINE_ASSET_INVALID_GLB'));
  await assert.rejects(upload(f, user, bytes), reject(429, 'RATE_LIMITED'));
  assert.equal(f.env.ENGINE_ASSETS.events.length, 0);
});
