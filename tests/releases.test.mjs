import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { zipSync, strToU8 } from 'fflate';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { validateGameArchive } from '../platform/server/archive.mjs';
import publisher from '../worker/game-publisher/index.mjs';

async function fixture(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE platform_games(id TEXT PRIMARY KEY,status TEXT,active_version_id TEXT,price_minor INTEGER,pending_version_id TEXT,update_status TEXT);
    CREATE TABLE platform_uploads(id TEXT PRIMARY KEY,object_key TEXT,status TEXT,checksum TEXT);
    CREATE TABLE platform_game_versions(id TEXT PRIMARY KEY,game_id TEXT,upload_id TEXT,status TEXT,platform TEXT,scan_status TEXT,scan_reference TEXT,checksum TEXT,file_size INTEGER,manifest_json TEXT);`);
  const bytes = zipSync({ 'index.html': strToU8('<!doctype html><script src="game.js"></script>'), 'game.js': strToU8('window.start = () => 1;'), 'media/pixel.bin': new Uint8Array([0, 255, 12, 0]) });
  const checked = await validateGameArchive(bytes);
  db.prepare('INSERT INTO platform_games VALUES(?,?,?,?,?,?)').run('game-1', 'approved', 'version-1', 0, null, null);
  db.prepare('INSERT INTO platform_uploads VALUES(?,?,?,?)').run('upload-1', 'quarantine/safe.zip', 'ready', checked.sha256);
  db.prepare('INSERT INTO platform_game_versions VALUES(?,?,?,?,?,?,?,?,?,?)').run('version-1', 'game-1', 'upload-1', 'ready', 'web', 'clean', 'scanner-attestation-test-only', checked.sha256, bytes.length, JSON.stringify(checked.manifest));
  const reads = [], writes = [];
  const f = { db, bytes, checked, reads, writes, object: { size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } };
  f.env = { PUBLISHER_INTERNAL_SECRET: 'x'.repeat(48), PLATFORM_DB: sqliteD1(db), PLATFORM_UPLOADS: { async get(key) { reads.push(key); return f.object; } }, PUBLISHED_GAMES: { async put(...args) { writes.push(args); } } };
  f.request = (body = { gameId: 'game-1', versionId: 'version-1', checksum: checked.sha256 }, extra = {}) => new Request('https://publisher.internal/promote', { method: 'POST', headers: { authorization: 'Bearer ' + f.env.PUBLISHER_INTERNAL_SECRET, 'content-type': 'application/json', ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  f.fetch = (...args) => publisher.fetch(f.request(...args), f.env);
  return f;
}

test('publisher revalidates real ZIP and promotes exact binary bytes with per-file hash metadata', async t => {
  const f = await fixture(t); const response = await f.fetch(); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ready', gameId: 'game-1', versionId: 'version-1', checksum: f.checked.sha256 });
  assert.deepEqual(f.reads, ['quarantine/safe.zip']); assert.equal(f.writes.length, 3);
  for (const [key, bytes, options] of f.writes) {
    const path = key.slice('games/game-1/version-1/'.length), entry = f.checked.manifest.find(x => x.path === path);
    assert.ok(entry); assert.deepEqual(bytes, f.checked.files.get(path)); assert.equal(options.customMetadata.sha256, entry.sha256);
  }
});

for (const [name, sql] of [
  ['pending scan', "UPDATE platform_game_versions SET scan_status='pending'"],
  ['missing attestation', "UPDATE platform_game_versions SET scan_reference=NULL"],
  ['unapproved game', "UPDATE platform_games SET status='submitted'"],
  ['superseded version', "UPDATE platform_games SET active_version_id='version-2'"],
  ['already published version', "UPDATE platform_game_versions SET status='published'"],
  ['native executable', "UPDATE platform_game_versions SET platform='windows'"],
  ['quarantined upload', "UPDATE platform_uploads SET status='quarantined'"],
  ['upload checksum mismatch', "UPDATE platform_uploads SET checksum='bad'"],
  ['paid game', 'UPDATE platform_games SET price_minor=100'],
]) test(`publisher rejects ${name} without fetching or writing content`, async t => {
  const f = await fixture(t); f.db.exec(sql); assert.equal((await f.fetch()).status, 409); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
});

test('publisher requires service secret, not a browser session', async t => {
  const f = await fixture(t); assert.equal((await f.fetch(undefined, { authorization: 'Bearer wrong', cookie: '__Host-crateship_session=any' })).status, 401);
  assert.equal(f.reads.length, 0); delete f.env.PUBLISHER_INTERNAL_SECRET; assert.equal((await f.fetch()).status, 401);
});
test('publisher rejects unavailable storage', async t => { const f = await fixture(t); delete f.env.PUBLISHED_GAMES; assert.equal((await f.fetch()).status, 503); });
test('publisher rejects malformed JSON', async t => { const f = await fixture(t); assert.equal((await f.fetch('{')).status, 400); });
test('publisher enforces actual streamed JSON byte limit without Content-Length', async t => {
  const f = await fixture(t); const bytes = new TextEncoder().encode(JSON.stringify({ gameId: 'game-1', versionId: 'version-1', checksum: f.checked.sha256, padding: 'x'.repeat(2500) }));
  const request = new Request('https://publisher.internal/promote', { method: 'POST', duplex: 'half', headers: { authorization: 'Bearer ' + f.env.PUBLISHER_INTERNAL_SECRET, 'content-type': 'application/json' }, body: new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 1000)); controller.enqueue(bytes.subarray(1000)); controller.close(); } }) });
  assert.equal((await publisher.fetch(request, f.env)).status, 413); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
});
test('publisher rejects compressed size beyond bounded Worker mode', async t => { const f = await fixture(t); f.db.exec('UPDATE platform_game_versions SET file_size=20000000'); assert.equal((await f.fetch()).status, 413); assert.equal(f.writes.length, 0); });
test('publisher rejects object size mismatch', async t => { const f = await fixture(t); f.object.size++; assert.equal((await f.fetch()).status, 409); assert.equal(f.writes.length, 0); });
test('publisher rejects corrupted archive before promotion', async t => { const f = await fixture(t); f.bytes[0] = 0; assert.equal((await f.fetch()).status, 422); assert.equal(f.writes.length, 0); });
test('publisher rejects valid replacement archive with different checksum', async t => {
  const f = await fixture(t); const replacement = zipSync({ 'index.html': strToU8('different') });
  f.object = { size: replacement.length, arrayBuffer: async () => replacement.buffer }; f.db.prepare('UPDATE platform_game_versions SET file_size=?').run(replacement.length);
  assert.equal((await f.fetch()).status, 409); assert.equal(f.writes.length, 0);
});
test('publisher rejects altered stored scan manifest', async t => { const f = await fixture(t); f.db.exec("UPDATE platform_game_versions SET manifest_json='[]'"); assert.equal((await f.fetch()).status, 409); assert.equal(f.writes.length, 0); });
test('publisher promotes an approved update to a live game, and nothing unapproved', async t => {
  const f = await fixture(t);
  f.db.exec("UPDATE platform_games SET status='published',active_version_id='version-0',pending_version_id='version-1',update_status='submitted'");
  assert.equal((await f.fetch()).status, 409); assert.equal(f.writes.length, 0);
  f.db.exec("UPDATE platform_games SET update_status='approved'");
  const response = await f.fetch(); assert.equal(response.status, 200);
  assert.equal((await response.json()).versionId, 'version-1'); assert.ok(f.writes.length > 0);
});
