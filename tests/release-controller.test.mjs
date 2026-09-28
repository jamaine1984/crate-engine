import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { base64url, tokenHash } from '../platform/server/identity.mjs';
import { HttpError } from '../platform/server/common.mjs';
import { handleReleases } from '../platform/server/releases.mjs';
import { REVENUE_TYPES } from '../platform/server/commerce.mjs';

const directory = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.sql')).sort().map(name => readFile(new URL(name, directory), 'utf8')));
const stamp = () => Math.floor(Date.now() / 1000);
const key = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const reject = (status, code) => error => error instanceof HttpError && error.status === status && (!code || error.code === code);
async function actor(f, role = 'OWNER', options = {}) {
  const id = crypto.randomUUID(), token = key(), at = stamp(), sessionId = crypto.randomUUID();
  f.sql.prepare(`INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at)
    VALUES(?,?,?,?,?,'active',?,?)`).run(id, `${id}@example.test`, `u_${id}`, 'Fixture user', options.verified === false ? 0 : 1, at, at);
  f.sql.prepare('INSERT INTO platform_user_roles VALUES(?,?,?)').run(id, role, at);
  f.sql.prepare(`INSERT INTO platform_sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at,auth_time,mfa_time,user_agent,ip_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(sessionId, await tokenHash(token), id, at, at + 3600, at,
    options.authTime ?? at, options.mfaTime === null ? null : options.mfaTime ?? at, 'fixture', 'fixture');
  return { id, sessionId, cookie: `__Host-crateship_session=${token}` };
}
async function fixture(t) {
  const sql = new DatabaseSync(':memory:'); migrations.forEach(migration => sql.exec(migration)); t.after(() => sql.close());
  const f = { sql, calls: [], env: { PLATFORM_DB: sqliteD1(sql), APP_ORIGIN: 'https://platform.example.test', AUTH_SECRET: key(),
    ENCRYPTION_KEY: key(), GAME_CONTENT_ORIGIN: 'https://isolated-game.test', PUBLISHER_INTERNAL_SECRET: key() } };
  f.owner = await actor(f); f.developer = await actor(f, 'DEVELOPER');
  f.gameId = crypto.randomUUID(); f.versionId = crypto.randomUUID(); f.uploadId = crypto.randomUUID();
  f.agreementId = crypto.randomUUID(); f.agreementVersionId = crypto.randomUUID(); f.assignmentId = crypto.randomUUID();
  f.checksum = 'a'.repeat(64); f.manifest = JSON.stringify({ entry: 'index.html', files: [{ path: 'index.html', sha256: 'b'.repeat(64), size: 10 }] });
  const at = stamp();
  sql.prepare(`INSERT INTO platform_games(id,slug,developer_id,title,kind,status,price_minor,active_version_id,created_at,updated_at)
    VALUES(?,?,?,'Release test fixture','web','approved',0,?,?,?)`).run(f.gameId, `test-${f.gameId}`, f.developer.id, f.versionId, at, at);
  sql.prepare(`INSERT INTO platform_game_versions(id,game_id,version,platform,upload_id,status,checksum,file_size,manifest_json,scan_status,scan_reference,uploaded_by,created_at)
    VALUES(?,?,'1.0.0','web',?,'ready',?,100,?,'clean','trusted-scan-fixture',?,?)`).run(f.versionId, f.gameId, f.uploadId, f.checksum, f.manifest, f.developer.id, at);
  sql.prepare(`INSERT INTO platform_uploads(id,game_id,user_id,version_id,object_key,upload_id,file_name,size_bytes,status,created_at,expires_at,checksum)
    VALUES(?,?,?,?,?,?,'build.zip',100,'ready',?,?,?)`).run(f.uploadId, f.gameId, f.developer.id, f.versionId, `quarantine/${f.uploadId}`, 'multipart-fixture', at, at + 3600, f.checksum);
  sql.prepare('INSERT INTO platform_agreements VALUES(?,?,?,?,?,?)').run(f.agreementId, 'Fixture explicit platform agreement', 'platform_owned', null, f.owner.id, at);
  const terms = Object.fromEntries(REVENUE_TYPES.map(type => [type, { creatorBps: 0, platformBps: 10000 }]));
  sql.prepare(`INSERT INTO platform_agreement_versions(id,agreement_id,version,terms_json,effective_at,created_by,created_at)
    VALUES(?,?,1,?,?,?,?)`).run(f.agreementVersionId, f.agreementId, JSON.stringify(terms), at - 100, f.owner.id, at);
  sql.prepare('INSERT INTO platform_game_agreements VALUES(?,?,?,?,?,?,?)').run(f.assignmentId, f.gameId, f.agreementVersionId, at - 100, null, f.owner.id, at);
  sql.prepare("UPDATE platform_feature_flags SET enabled=1 WHERE key='PUBLIC_CREATOR_PUBLISHING_ENABLED'").run();
  f.proof = { status: 'ready', gameId: f.gameId, versionId: f.versionId, checksum: f.checksum };
  f.env.GAME_PUBLISHER = { async fetch(request) { f.calls.push(request); return Response.json(f.proof); } };
  return f;
}
function request(f, user = f.owner, body = { reason: 'Reviewed fixture approved for release' }, headers = {}) {
  return new Request(`${f.env.APP_ORIGIN}/api/platform/owner/games/${f.gameId}/publish`, { method: 'POST',
    headers: { origin: f.env.APP_ORIGIN, 'content-type': 'application/json', ...(user ? { cookie: user.cookie } : {}), ...headers }, body: JSON.stringify(body) });
}
const publish = (f, user = f.owner, body) => handleReleases(request(f, user, body), f.env, `/owner/games/${f.gameId}/publish`);
function noPublication(f) {
  assert.notEqual(f.sql.prepare('SELECT status FROM platform_games WHERE id=?').get(f.gameId).status, 'published');
  assert.notEqual(f.sql.prepare('SELECT status FROM platform_game_versions WHERE id=?').get(f.versionId).status, 'published');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_release_manifests').get().n, 0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='game.publish'").get().n, 0);
}

test('owner publication atomically commits exact ready version, immutable manifest snapshot and one audit claim', async t => {
  const f = await fixture(t), result = await (await publish(f)).json();
  assert.deepEqual(result, { published: true, gameId: f.gameId, versionId: f.versionId }); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://publisher.internal/promote'); assert.equal(f.calls[0].headers.get('authorization'), `Bearer ${f.env.PUBLISHER_INTERNAL_SECRET}`);
  assert.deepEqual(await f.calls[0].json(), { gameId: f.gameId, versionId: f.versionId, checksum: f.checksum });
  assert.equal(f.sql.prepare('SELECT status FROM platform_games').get().status, 'published'); assert.equal(f.sql.prepare('SELECT status FROM platform_game_versions').get().status, 'published');
  const manifest = f.sql.prepare('SELECT * FROM platform_release_manifests').get(); assert.equal(manifest.checksum, f.checksum); assert.equal(manifest.manifest_json, f.manifest);
  const audit = f.sql.prepare("SELECT * FROM platform_audit WHERE action='game.publish'").all(); assert.equal(audit.length, 1);
  assert.equal(JSON.parse(audit[0].detail_json).agreementVersionId, f.agreementVersionId); assert.equal(audit[0].actor_id, f.owner.id);
});

test('NULL free price matches catalog and isolated content delivery semantics', async t => {
  const f = await fixture(t); f.sql.prepare('UPDATE platform_games SET price_minor=NULL').run();
  assert.equal((await (await publish(f)).json()).published, true);
});

test('owner role, verified account, recent authentication, MFA and origin are mandatory', async t => {
  const f = await fixture(t);
  await assert.rejects(publish(f, null), reject(401)); await assert.rejects(publish(f, f.developer), reject(403));
  const noMfa = await actor(f, 'OWNER', { mfaTime: null }); await assert.rejects(publish(f, noMfa), reject(403, 'MFA_REQUIRED'));
  const stale = await actor(f, 'OWNER', { authTime: stamp() - 301 }); await assert.rejects(publish(f, stale), reject(403, 'REAUTH_REQUIRED'));
  const unverified = await actor(f, 'OWNER', { verified: false }); await assert.rejects(publish(f, unverified), reject(403, 'EMAIL_VERIFICATION_REQUIRED'));
  await assert.rejects(handleReleases(request(f, f.owner, undefined, { origin: 'https://evil.test' }), f.env, `/owner/games/${f.gameId}/publish`), reject(403, 'ORIGIN_DENIED'));
  assert.equal(f.calls.length, 0); noPublication(f);
});

test('publishing and maintenance flags stop work before promotion', async t => {
  const f = await fixture(t); f.sql.prepare("UPDATE platform_feature_flags SET enabled=0 WHERE key='PUBLIC_CREATOR_PUBLISHING_ENABLED'").run();
  await assert.rejects(publish(f), reject(503, 'FEATURE_DISABLED'));
  f.sql.prepare("UPDATE platform_feature_flags SET enabled=1 WHERE key IN ('PUBLIC_CREATOR_PUBLISHING_ENABLED','MAINTENANCE_MODE')").run();
  await assert.rejects(publish(f), reject(503, 'RELEASE_BLOCKED')); assert.equal(f.calls.length, 0); noPublication(f);
});

test('publisher configuration and isolated secure content origin are required', async t => {
  const f = await fixture(t), saved = f.env.GAME_PUBLISHER;
  delete f.env.GAME_PUBLISHER; await assert.rejects(publish(f), reject(503)); f.env.GAME_PUBLISHER = saved;
  for (const origin of [undefined, f.env.APP_ORIGIN, 'http://games.test', 'https://user:password@games.test', 'https://games.test/subpath']) {
    f.env.GAME_CONTENT_ORIGIN = origin; await assert.rejects(publish(f), reject(503));
  }
  assert.equal(f.calls.length, 0); noPublication(f);
});

test('unapproved, paid, or unscanned games never reach the publisher', async t => {
  const f = await fixture(t);
  f.sql.prepare("UPDATE platform_games SET status='submitted'").run(); await assert.rejects(publish(f), reject(409));
  f.sql.prepare("UPDATE platform_games SET status='approved',price_minor=100").run(); await assert.rejects(publish(f), reject(409));
  f.sql.prepare('UPDATE platform_games SET price_minor=0').run(); f.sql.prepare("UPDATE platform_game_versions SET scan_status='infected'").run();
  await assert.rejects(publish(f), reject(409)); assert.equal(f.calls.length, 0); noPublication(f);
});

test('an explicit currently effective agreement is required for free platform games', async t => {
  const f = await fixture(t); f.sql.prepare('UPDATE platform_game_agreements SET end_at=?').run(stamp());
  await assert.rejects(publish(f), reject(409)); assert.equal(f.calls.length, 0); noPublication(f);
});

for (const [name, proof] of [
  ['checksum mismatch', f => ({ ...f.proof, checksum: 'c'.repeat(64) })], ['wrong game', f => ({ ...f.proof, gameId: 'other' })],
  ['wrong version', f => ({ ...f.proof, versionId: 'other' })], ['not ready', f => ({ ...f.proof, status: 'pending' })],
]) test(`publisher ${name} cannot commit publication`, async t => {
  const f = await fixture(t); f.env.GAME_PUBLISHER.fetch = async () => Response.json(proof(f));
  await assert.rejects(publish(f), reject(502, 'RELEASE_BLOCKED')); noPublication(f);
});

test('publisher network, service, and malformed JSON failures remain unpublished', async t => {
  const f = await fixture(t);
  f.env.GAME_PUBLISHER.fetch = async () => { throw new Error('private service error'); }; await assert.rejects(publish(f), reject(503));
  f.env.GAME_PUBLISHER.fetch = async () => new Response('offline', { status: 503 }); await assert.rejects(publish(f), reject(503));
  f.env.GAME_PUBLISHER.fetch = async () => new Response('not JSON'); await assert.rejects(publish(f), reject(502)); noPublication(f);
});

const races = [
  ['game approval revoked', f => f.sql.prepare("UPDATE platform_games SET status='suspended'").run()],
  ['active version replaced', f => f.sql.prepare('UPDATE platform_games SET active_version_id=?').run(crypto.randomUUID())],
  ['game ownership changed', f => f.sql.prepare('UPDATE platform_games SET developer_id=?').run(f.owner.id)],
  ['free game made paid', f => f.sql.prepare('UPDATE platform_games SET price_minor=100').run()],
  ['publishing disabled', f => f.sql.prepare("UPDATE platform_feature_flags SET enabled=0 WHERE key='PUBLIC_CREATOR_PUBLISHING_ENABLED'").run()],
  ['maintenance enabled', f => f.sql.prepare("UPDATE platform_feature_flags SET enabled=1 WHERE key='MAINTENANCE_MODE'").run()],
  ['version readiness revoked', f => f.sql.prepare("UPDATE platform_game_versions SET status='suspended'").run()],
  ['scan result revoked', f => f.sql.prepare("UPDATE platform_game_versions SET scan_status='infected'").run()],
  ['scan attestation replaced', f => f.sql.prepare("UPDATE platform_game_versions SET scan_reference='different-scan'").run()],
  ['build checksum replaced', f => f.sql.prepare('UPDATE platform_game_versions SET checksum=?').run('d'.repeat(64))],
  ['manifest replaced', f => f.sql.prepare('UPDATE platform_game_versions SET manifest_json=?').run('{"changed":true}')],
  ['upload readiness revoked', f => f.sql.prepare("UPDATE platform_uploads SET status='aborted'").run()],
  ['upload checksum replaced', f => f.sql.prepare('UPDATE platform_uploads SET checksum=?').run('e'.repeat(64))],
  ['upload storage key replaced', f => f.sql.prepare("UPDATE platform_uploads SET object_key='quarantine/replacement'").run()],
  ['agreement expired', f => f.sql.prepare('UPDATE platform_game_agreements SET end_at=?').run(stamp())],
  ['agreement assignment replaced', f => {
    const previous = f.sql.prepare('SELECT * FROM platform_game_agreements WHERE id=?').get(f.assignmentId);
    f.sql.prepare('DELETE FROM platform_game_agreements WHERE id=?').run(f.assignmentId);
    f.sql.prepare('INSERT INTO platform_game_agreements VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(), previous.game_id, previous.version_id,
      previous.effective_at, previous.end_at, previous.created_by, previous.created_at);
  }],
  ['agreement version replaced', f => {
    const id = crypto.randomUUID(); f.sql.prepare(`INSERT INTO platform_agreement_versions(id,agreement_id,version,terms_json,effective_at,created_by,created_at)
      SELECT ?,agreement_id,2,terms_json,effective_at,created_by,created_at FROM platform_agreement_versions WHERE id=?`).run(id, f.agreementVersionId);
    f.sql.prepare('UPDATE platform_game_agreements SET version_id=?').run(id);
  }],
  ['owner role revoked', f => f.sql.prepare("DELETE FROM platform_user_roles WHERE user_id=? AND role='OWNER'").run(f.owner.id)],
  ['owner suspended', f => f.sql.prepare("UPDATE platform_users SET status='suspended' WHERE id=?").run(f.owner.id)],
  ['owner email verification revoked', f => f.sql.prepare('UPDATE platform_users SET email_verified=0 WHERE id=?').run(f.owner.id)],
  ['owner session revoked', f => f.sql.prepare('UPDATE platform_sessions SET revoked_at=? WHERE id=?').run(stamp(), f.owner.sessionId)],
  ['owner MFA proof expired', f => f.sql.prepare('UPDATE platform_sessions SET mfa_time=? WHERE id=?').run(stamp() - 301, f.owner.sessionId)],
];
for (const [name, mutate] of races) test(`promotion race: ${name} prevents every publication write`, async t => {
  const f = await fixture(t); f.env.GAME_PUBLISHER.fetch = async () => { mutate(f); return Response.json(f.proof); };
  await assert.rejects(publish(f), reject(409, 'RELEASE_BLOCKED')); noPublication(f);
});

test('concurrent publication winner creates one audit/manifest and loser writes nothing', async t => {
  const f = await fixture(t); let started, release, calls = 0;
  const began = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  f.env.GAME_PUBLISHER.fetch = async () => { calls++; if (calls === 1) { started(); await gate; } return Response.json(f.proof); };
  const slow = publish(f); await began;
  const winner = await publish(f); assert.equal((await winner.json()).published, true); release();
  await assert.rejects(slow, reject(409, 'RELEASE_BLOCKED'));
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='game.publish'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_release_manifests').get().n, 1);
  assert.equal(f.sql.prepare('SELECT status FROM platform_games').get().status, 'published');
});

test('a late manifest failure rolls back audit claim, game and version atomically', async t => {
  const f = await fixture(t);
  f.sql.exec("CREATE TRIGGER fixture_manifest_failure BEFORE INSERT ON platform_release_manifests BEGIN SELECT RAISE(ABORT,'fixture storage failure'); END;");
  await assert.rejects(publish(f), /fixture storage failure/); noPublication(f);
  assert.equal(f.sql.prepare('SELECT status FROM platform_games').get().status, 'approved'); assert.equal(f.sql.prepare('SELECT status FROM platform_game_versions').get().status, 'ready');
});

test('a conflicting existing release manifest cannot be silently retained during publication', async t => {
  const f = await fixture(t);
  f.sql.prepare('INSERT INTO platform_release_manifests VALUES(?,?,?,?,?)').run(f.versionId, f.gameId, 'c'.repeat(64), '{}', stamp());
  await assert.rejects(publish(f), reject(409, 'RELEASE_BLOCKED'));
  assert.equal(f.sql.prepare('SELECT status FROM platform_games').get().status, 'approved');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='game.publish'").get().n, 0);
  assert.equal(f.sql.prepare('SELECT checksum FROM platform_release_manifests').get().checksum, 'c'.repeat(64));
});

test('upload attachment to a different version is rejected before promotion', async t => {
  const f = await fixture(t), otherVersion = crypto.randomUUID();
  f.sql.prepare(`INSERT INTO platform_game_versions(id,game_id,version,platform,uploaded_by,created_at)
    VALUES(?,?,'2.0.0','web',?,?)`).run(otherVersion, f.gameId, f.developer.id, stamp());
  f.sql.prepare('UPDATE platform_uploads SET version_id=?').run(otherVersion);
  await assert.rejects(publish(f), reject(409, 'RELEASE_BLOCKED')); assert.equal(f.calls.length, 0); noPublication(f);
});

test("the owner's own game gets an automatic platform-owned agreement; creator games still need one", async t => {
  const f = await fixture(t);
  f.sql.prepare('DELETE FROM platform_game_agreements').run();
  await assert.rejects(publish(f), reject(409, 'RELEASE_BLOCKED'));
  noPublication(f);
  f.sql.prepare('UPDATE platform_games SET developer_id=? WHERE id=?').run(f.owner.id, f.gameId);
  f.sql.prepare('UPDATE platform_uploads SET user_id=?').run(f.owner.id);
  assert.equal((await (await publish(f)).json()).published, true);
  const agreement = f.sql.prepare("SELECT a.type,v.terms_json FROM platform_game_agreements g JOIN platform_agreement_versions v ON v.id=g.version_id JOIN platform_agreements a ON a.id=v.agreement_id WHERE g.game_id=?").get(f.gameId);
  assert.equal(agreement.type, 'platform_owned');
  assert.ok(Object.values(JSON.parse(agreement.terms_json)).every(term => term.creatorBps === 0));
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='agreement.owner_auto'").get().n, 1);
});

test('an approved update to a live game swaps in at release; the old build serves until then', async t => {
  const f = await fixture(t), liveId = crypto.randomUUID(), at = stamp();
  f.sql.prepare(`INSERT INTO platform_game_versions(id,game_id,version,platform,status,checksum,scan_status,uploaded_by,created_at)
    VALUES(?,?,'0.9.0','web','published',?,'clean',?,?)`).run(liveId, f.gameId, 'c'.repeat(64), f.developer.id, at - 50);
  f.sql.prepare("UPDATE platform_games SET status='published',active_version_id=?,pending_version_id=?,update_status='submitted',published_at=? WHERE id=?").run(liveId, f.versionId, at - 1000, f.gameId);
  await assert.rejects(publish(f), error => error.status === 409); assert.equal(f.calls.length, 0);
  assert.equal(f.sql.prepare('SELECT active_version_id a FROM platform_games').get().a, liveId);
  f.sql.prepare("UPDATE platform_games SET update_status='approved'").run();
  assert.deepEqual(await (await publish(f)).json(), { published: true, gameId: f.gameId, versionId: f.versionId });
  const g = f.sql.prepare('SELECT * FROM platform_games').get();
  assert.equal(g.status, 'published'); assert.equal(g.active_version_id, f.versionId); assert.equal(g.pending_version_id, null); assert.equal(g.update_status, null);
  assert.equal(g.published_at, at - 1000, 'the original publish date is kept');
  assert.equal(f.sql.prepare('SELECT status FROM platform_game_versions WHERE id=?').get(f.versionId).status, 'published');
});
