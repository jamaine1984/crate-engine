import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { handleData, flags, DISABLED_PROVIDER_FLAGS } from '../platform/server/data.mjs';
import { handlePlayer } from '../platform/server/player.mjs';
import { handleUploads } from '../platform/server/uploads.mjs';
import { handleAdministration } from '../platform/server/administration.mjs';
import { handleMedia, imageInfo } from '../platform/server/media.mjs';
import { accountErasureStatements } from '../platform/server/erasure.mjs';
import { base64url, tokenHash, handleAuth, requireUser } from '../platform/server/identity.mjs';
import { HttpError } from '../platform/server/common.mjs';

const migrationDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(n => n.endsWith('.sql')).sort()
  .map(name => readFile(new URL(name, migrationDir), 'utf8')));
const now = () => Math.floor(Date.now() / 1000);
const key = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
function fixture() {
  const sql = new DatabaseSync(':memory:'); for (const migration of migrations) sql.exec(migration);
  return { sql, env: { PLATFORM_DB: sqliteD1(sql), APP_ORIGIN: 'https://example.test', AUTH_SECRET: key(),
    ENCRYPTION_KEY: key(), GAME_CONTENT_ORIGIN: 'https://isolated.example-games.test' } };
}
async function actor(f, roles = ['PLAYER'], options = {}) {
  const id = crypto.randomUUID(); const token = key(); const sessionId = crypto.randomUUID(); const stamp = now();
  f.sql.prepare(`INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'active',?,?)`).run(id, `${id}@example.test`, `user_${id}`, 'Test user', options.verified === false ? 0 : 1, stamp, stamp);
  for (const role of roles) f.sql.prepare('INSERT INTO platform_user_roles VALUES(?,?,?)').run(id, role, stamp);
  f.sql.prepare(`INSERT INTO platform_sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at,auth_time,mfa_time,user_agent,ip_hash)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(sessionId, await tokenHash(token), id, stamp, stamp + 3600, stamp,
    options.authTime ?? stamp, options.mfa ? stamp : null, 'Integration test fixture', 'test-ip-hash');
  return { id, cookie: `__Host-crateship_session=${token}`, sessionId };
}
function request(f, path, user, method = 'GET', body, extra = {}) {
  const headers = { origin: f.env.APP_ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.20', ...extra };
  if (user) headers.cookie = user.cookie;
  return new Request(`${f.env.APP_ORIGIN}/api/platform${path}`, { method, headers,
    ...(!['GET', 'HEAD'].includes(method) ? { body: JSON.stringify(body ?? {}) } : {}) });
}
const data = (f, path, user, method = 'GET', body) => handleData(request(f, path, user, method, body), f.env, path);
const player = (f, path, user, method = 'GET', body) => handlePlayer(request(f, path, user, method, body), f.env, path);
const uploads = (f, path, user, method = 'GET', body) => handleUploads(request(f, path, user, method, body), f.env, path);
const reject = (status, code) => error => error instanceof HttpError && error.status === status && (!code || error.code === code);
test('approved listings cannot be edited without a new review',async()=>{const f=fixture();try{const developer=await actor(f,['DEVELOPER']);const g=game(f,developer,{status:'approved'});await assert.rejects(()=>data(f,'/developer/games/'+g.id,developer,'PUT',{title:'Changed after approval'}),reject(409));assert.equal(f.sql.prepare('SELECT title FROM platform_games WHERE id=?').get(g.id).title,'Integration fixture game');}finally{f.sql.close();}});
function game(f, developer, options = {}) {
  const id = crypto.randomUUID(); const versionId = crypto.randomUUID(); const stamp = now();
  f.sql.prepare(`INSERT INTO platform_games(id,slug,developer_id,title,kind,status,price_minor,active_version_id,created_at,updated_at,published_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, `game-${id}`, developer.id, options.title || 'Integration fixture game', options.kind || 'web',
    options.status || 'published', options.price ?? 0, versionId, stamp, stamp, stamp);
  f.sql.prepare(`INSERT INTO platform_game_versions(id,game_id,version,platform,status,scan_status,uploaded_by,created_at)
    VALUES(?,?,?,? ,?,?,?,?)`).run(versionId, id, '1.0.0', options.platform || 'web', options.versionStatus || 'published',
    options.scanStatus || 'clean', developer.id, stamp);
  return { id, versionId };
}
function screenshot(f, gameId, user) {
  f.sql.prepare('INSERT INTO platform_game_media(id,game_id,position,object_key,content_type,size_bytes,width,height,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), gameId, 1, `media/${gameId}/${crypto.randomUUID()}.png`, 'image/png', 100, 640, 360, user.id, now());
}
function png(width, height, extra = 64) {
  const bytes = new Uint8Array(33 + extra); bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width); new DataView(bytes.buffer).setUint32(20, height); return bytes;
}
function mediaRequest(f, path, user, method, bytes) {
  const headers = { origin: f.env.APP_ORIGIN, cookie: user.cookie, 'cf-connecting-ip': '192.0.2.20' };
  if (bytes) { headers['content-type'] = 'image/png'; headers['content-length'] = String(bytes.length); }
  return handleMedia(new Request(`${f.env.APP_ORIGIN}/api/platform${path}`, { method, headers, ...(bytes ? { body: bytes } : {}) }), f.env, path);
}
function storage() {
  const transfers = new Map(); const events = [];
  return { events, async createMultipartUpload(key) {
    const uploadId = crypto.randomUUID(); transfers.set(uploadId, { key, parts: [] });
    events.push({ action: 'create', key });
    return { uploadId, async abort() { events.push({ action: 'abort', key }); } };
  }, resumeMultipartUpload(key, uploadId) {
    assert.equal(transfers.get(uploadId)?.key, key);
    return { async uploadPart(number, bytes) { const etag = `etag-${number}`; transfers.get(uploadId).parts.push({ number, bytes });
      events.push({ action: 'part', key, number }); return { partNumber: number, etag }; },
    async complete(parts) { events.push({ action: 'complete', key, parts }); },
    async abort() { events.push({ action: 'abort', key }); } };
  } };
}

test('all migrations produce working rate limit and persistent project tables', async () => {
  const f = fixture(); const user = await actor(f);
  const created = await data(f, '/projects', user, 'POST', { name: 'My project', project: { format: 'crate-engine-project', objects: [{ type: 'cube' }] } });
  assert.equal(created.status, 201); const { project } = await created.json();
  const reopened = await (await data(f, `/projects/${project.id}`, user)).json();
  assert.equal(reopened.project.data.objects[0].type, 'cube');
  assert.equal(f.sql.prepare('SELECT count FROM platform_operation_limits').get().count, 1);
  f.sql.close();
});

test('projects enforce account ownership and optimistic revision conflict detection', async () => {
  const f = fixture(); const a = await actor(f); const b = await actor(f);
  const { project } = await (await data(f, '/projects', a, 'POST', { name: 'Owned scene', project: { value: 1 } })).json();
  await assert.rejects(data(f, `/projects/${project.id}`, b), reject(404));
  await assert.rejects(data(f, `/projects/${project.id}`, b, 'PUT', { revision: 1, project: { stolen: true } }), reject(404));
  await data(f, `/projects/${project.id}`, a, 'PUT', { name: 'Renamed', revision: 1, project: { value: 2 } });
  await assert.rejects(data(f, `/projects/${project.id}`, a, 'PUT', { revision: 1, project: { value: 3 } }), reject(409, 'REVISION_CONFLICT'));
  const saved = await (await data(f, `/projects/${project.id}`, a)).json(); assert.equal(saved.project.revision, 2); assert.equal(saved.project.data.value, 2);
  await data(f, `/projects/${project.id}`, a, 'DELETE'); await assert.rejects(data(f, `/projects/${project.id}`, a), reject(404));
  f.sql.close();
});

test('catalog shows only published content and escapes literal search metacharacters', async () => {
  const f = fixture(); const dev = await actor(f, ['DEVELOPER']);
  game(f, dev, { title: 'Public 100% game' }); game(f, dev, { title: 'Private game', status: 'draft' });
  const result = await (await data(f, '/catalog', null)).json(); assert.equal(result.total, 1); assert.equal(result.games[0].title, 'Public 100% game');
  const search = new Request(`${f.env.APP_ORIGIN}/api/platform/catalog?q=${encodeURIComponent('%')}`);
  const found = await (await handleData(search, f.env, '/catalog')).json(); assert.equal(found.total, 1);
  const injection = new Request(`${f.env.APP_ORIGIN}/api/platform/catalog?q=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal((await (await handleData(injection, f.env, '/catalog')).json()).total, 0);
  f.sql.close();
});

test('favorites and free library claims persist once per user; premium never creates fake ownership', async () => {
  const f = fixture(); const a = await actor(f); const b = await actor(f); const free = game(f, a); const premium = game(f, a, { price: 1299 });
  await data(f, '/favorites', a, 'POST', { gameId: free.id }); await data(f, '/favorites', a, 'POST', { gameId: free.id });
  assert.equal((await (await data(f, '/favorites', a)).json()).items.length, 1);
  assert.equal((await (await data(f, '/favorites', b)).json()).items.length, 0);
  await data(f, '/library', a, 'POST', { gameId: free.id }); await data(f, '/library', a, 'POST', { gameId: free.id });
  assert.equal((await (await data(f, '/library', a)).json()).items.length, 1);
  await assert.rejects(data(f, '/library', a, 'POST', { gameId: premium.id }), reject(503, 'PAYMENTS_DISABLED'));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_purchases').get().n, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_licenses').get().n, 0);
  await data(f, `/favorites/${free.id}`, b, 'DELETE'); assert.equal((await (await data(f, '/favorites', a)).json()).items.length, 1);
  f.sql.close();
});

test('preferences and notifications cannot mutate another account or elevate roles', async () => {
  const f = fixture(); const a = await actor(f); const b = await actor(f);
  await data(f, '/preferences', a, 'PUT', { reducedMotion: true, language: 'es', advertisingConsent: false, roles: ['OWNER'] });
  assert.equal((await (await data(f, '/preferences', a)).json()).preferences.language, 'es');
  assert.deepEqual((await (await data(f, '/preferences', b)).json()).preferences, {});
  const notificationId = crypto.randomUUID();
  f.sql.prepare('INSERT INTO platform_notifications(id,user_id,type,title,body,created_at) VALUES(?,?,?,?,?,?)').run(notificationId, a.id, 'notice', 'Title', 'Body', now());
  await data(f, `/notifications/${notificationId}`, b, 'PATCH', {});
  assert.equal(f.sql.prepare('SELECT read_at FROM platform_notifications').get().read_at, null);
  assert.deepEqual(f.sql.prepare('SELECT role FROM platform_user_roles WHERE user_id=?').all(a.id).map(r => r.role), ['PLAYER']);
  f.sql.close();
});

test('any verified player becomes a creator instantly; unverified accounts and paused sign-up are refused', async () => {
  const f = fixture(); const verified = await actor(f); const unverified = await actor(f, ['PLAYER'], { verified: false });
  const roles = user => f.sql.prepare('SELECT role FROM platform_user_roles WHERE user_id=? ORDER BY role').all(user.id).map(r => r.role);
  await assert.rejects(data(f, '/creator/join', verified, 'POST', {}), reject(400));
  await assert.rejects(data(f, '/developer/games', verified, 'POST', { title: 'Too early', slug: 'too-early', kind: 'web' }), reject(403, 'ROLE_DENIED'));
  assert.equal((await data(f, '/creator/join', verified, 'POST', { guidelinesAccepted: true })).status, 201);
  assert.equal((await data(f, '/creator/join', verified, 'POST', { guidelinesAccepted: true })).status, 200);
  assert.deepEqual(roles(verified), ['DEVELOPER', 'PLAYER']);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='creator.join' AND target_id=?").get(verified.id).n, 1);
  assert.equal((await data(f, '/developer/games', verified, 'POST', { title: 'First game', slug: 'first-game', kind: 'web' })).status, 201);
  await assert.rejects(data(f, '/creator/join', unverified, 'POST', { guidelinesAccepted: true }), reject(403, 'EMAIL_VERIFICATION_REQUIRED'));
  assert.deepEqual(roles(unverified), ['PLAYER']);
  f.sql.prepare("UPDATE platform_feature_flags SET enabled=0 WHERE key='CREATOR_SIGNUP_ENABLED'").run(); const later = await actor(f);
  await assert.rejects(data(f, '/creator/join', later, 'POST', { guidelinesAccepted: true }), reject(503, 'FEATURE_DISABLED'));
  assert.equal((await flags(f.env)).CREATOR_WAITLIST_ENABLED, undefined);
  f.sql.close();
});

test('payment, ad and reward provider flags remain false even if database flags are toggled', async () => {
  const f = fixture(); f.sql.prepare('UPDATE platform_feature_flags SET enabled=1').run();
  const active = await flags(f.env); for (const flag of DISABLED_PROVIDER_FLAGS) assert.equal(active[flag], false);
  for (const path of ['/checkout', '/payments', '/ads', '/rewards', '/payouts']) await assert.rejects(data(f, path, null, 'POST', {}), reject(503, 'PROVIDER_DISABLED'));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_wallet_transactions').get().n, 0);
  f.sql.close();
});

test('owner portal denies partner/player, requires MFA and recent reauthentication for mutations', async () => {
  const f = fixture(); const playerUser = await actor(f); const partner = await actor(f, ['PARTNER_DEVELOPER']);
  const noMfaOwner = await actor(f, ['OWNER']); const owner = await actor(f, ['OWNER'], { mfa: true });
  for (const user of [playerUser, partner]) await assert.rejects(data(f, '/owner/overview', user), reject(403, 'ROLE_DENIED'));
  await assert.rejects(data(f, '/owner/overview', noMfaOwner), reject(403, 'MFA_REQUIRED'));
  const overview = await (await data(f, '/owner/overview', owner)).json(); assert.deepEqual(overview.revenue, []); assert.equal(overview.providerReporting.available, false);
  await assert.rejects(data(f, '/owner/flags', owner, 'PUT', { key: 'PAYMENTS_ENABLED', enabled: true, reason: 'test only' }), reject(409, 'RELEASE_GATE'));
  f.sql.prepare('UPDATE platform_sessions SET auth_time=? WHERE id=?').run(now() - 600, owner.sessionId);
  await assert.rejects(data(f, '/owner/flags', owner, 'PUT', { key: 'CREATOR_SIGNUP_ENABLED', enabled: false, reason: 'test' }), reject(403, 'REAUTH_REQUIRED'));
  f.sql.close();
});

test('owner feature mutations create audit history and cannot prematurely open uploads', async () => {
  const f = fixture(); const owner = await actor(f, ['OWNER'], { mfa: true });
  await data(f, '/owner/flags', owner, 'PUT', { key: 'CREATOR_SIGNUP_ENABLED', enabled: false, reason: 'Internal test transition' });
  assert.equal((await flags(f.env)).CREATOR_SIGNUP_ENABLED, false);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='flag.change'").get().n, 1);
  await assert.rejects(data(f, '/owner/flags', owner, 'PUT', { key: 'PUBLIC_CREATOR_UPLOADS_ENABLED', enabled: true, reason: 'test' }), reject(409));
  for (const key of ['ENGINE_PUBLISHING_ENABLED', 'PREMIUM_DOWNLOADS_ENABLED']) {
    await assert.rejects(data(f, '/owner/flags', owner, 'PUT', { key, enabled: true, reason: 'test' }), reject(409, 'NOT_IMPLEMENTED'));
    assert.equal((await flags(f.env))[key], false);
  }
  f.sql.close();
});

test('developers can edit only owned or explicitly assigned games and list assignments', async () => {
  const f = fixture(); const dev = await actor(f, ['DEVELOPER']); const partner = await actor(f, ['PARTNER_DEVELOPER']);
  const assigned = game(f, dev, { status: 'draft' }); const unassigned = game(f, dev, { status: 'draft' });
  f.sql.prepare('INSERT INTO platform_game_members VALUES(?,?,?,?)').run(assigned.id, partner.id, 'edit', now());
  await data(f, `/developer/games/${assigned.id}`, partner, 'PUT', { title: 'Partner updated game', kind: 'web' });
  assert.equal(f.sql.prepare('SELECT title FROM platform_games WHERE id=?').get(assigned.id).title, 'Partner updated game');
  await assert.rejects(data(f, `/developer/games/${unassigned.id}`, partner), reject(403, 'FORBIDDEN'));
  const listed = await (await data(f, '/developer/games', partner)).json(); assert.ok(listed.games.some(g => g.id === assigned.id));
  f.sql.close();
});

test('submission requires rights and clean reviewed build; creators cannot approve their own game', async () => {
  const f = fixture(); const dev = await actor(f, ['DEVELOPER']); const owner = await actor(f, ['OWNER'], { mfa: true });
  const draft = game(f, dev, { status: 'draft', versionStatus: 'ready' });
  await assert.rejects(data(f, `/developer/games/${draft.id}/submit`, dev, 'POST', { versionId: draft.versionId }), reject(400));
  await assert.rejects(data(f, `/developer/games/${draft.id}/submit`, dev, 'POST', { versionId: draft.versionId, rightsConfirmed: true }), reject(409, 'SCREENSHOT_REQUIRED'));
  screenshot(f, draft.id, dev);
  await data(f, `/developer/games/${draft.id}/submit`, dev, 'POST', { versionId: draft.versionId, rightsConfirmed: true });
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_rights_declarations').get().n, 1);
  await assert.rejects(data(f, `/owner/games/${draft.id}/review`, dev, 'POST', { decision: 'approve', reason: 'test' }), reject(403));
  const review = await (await data(f, `/owner/games/${draft.id}/review`, owner, 'POST', { decision: 'approve', reason: 'Internal test review' })).json();
  assert.equal(review.status, 'approved');
  const note = f.sql.prepare('SELECT user_id,title,body,href FROM platform_notifications WHERE user_id=?').get(dev.id);
  assert.match(note.title, /approved/); assert.equal(note.body, 'Internal test review'); assert.equal(note.href, `/developer/games/${draft.id}`);
  const queue = await (await data(f, '/owner/games', owner)).json(); assert.equal(queue.games.find(g => g.id === draft.id).developerName, 'Test user');
  const ownerGame = game(f, owner, { status: 'submitted', versionStatus: 'ready' });
  await assert.rejects(data(f, `/owner/games/${ownerGame.id}/review`, owner, 'POST', { decision: 'approve', reason: 'test' }), reject(403, 'SELF_APPROVAL_DENIED'));
  f.sql.close();
});

test('game player requires isolated HTTPS content and a scanned published browser build', async () => {
  const f = fixture(); const user = await actor(f); const playable = game(f, user);
  f.env.GAME_CONTENT_ORIGIN = f.env.APP_ORIGIN;
  await assert.rejects(player(f, '/player/sessions', user, 'POST', { gameId: playable.id }), reject(503, 'ISOLATION_INVALID'));
  delete f.env.GAME_CONTENT_ORIGIN;
  await assert.rejects(player(f, '/player/sessions', user, 'POST', { gameId: playable.id }), reject(503, 'ISOLATION_UNAVAILABLE'));
  f.env.GAME_CONTENT_ORIGIN = 'https://isolated.example-games.test';
  const unscanned = game(f, user, { scanStatus: 'pending' });
  await assert.rejects(player(f, '/player/sessions', user, 'POST', { gameId: unscanned.id }), reject(409));
  const opened = await (await player(f, '/player/sessions', user, 'POST', { gameId: playable.id })).json();
  assert.equal(new URL(opened.session.contentUrl).origin, f.env.GAME_CONTENT_ORIGIN); assert.equal(opened.session.cloudSaveAvailable, true);
  assert.equal(f.sql.prepare('SELECT play_count FROM platform_play_history').get().play_count, 1);
  f.sql.close();
});

test('premium browser play requires a backend license and cannot trust caller purchase claims', async () => {
  const f = fixture(); const user = await actor(f); const premium = game(f, user, { price: 1000 });
  await assert.rejects(player(f, '/player/sessions', null, 'POST', { gameId: premium.id, purchased: true }), reject(401));
  await assert.rejects(player(f, '/player/sessions', user, 'POST', { gameId: premium.id, purchased: true }), reject(403));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_game_sessions').get().n, 0); f.sql.close();
});

test('cloud progress is scoped to game session/account and rejects stale revisions and ended sessions', async () => {
  const f = fixture(); const a = await actor(f); const b = await actor(f); const playable = game(f, a);
  const { session } = await (await player(f, '/player/sessions', a, 'POST', { gameId: playable.id })).json();
  const route = `/player/sessions/${session.id}/progress`;
  await player(f, route, a, 'PUT', { revision: 0, progress: { checkpoint: 'camp', data: [1, 2, 3] } });
  assert.equal((await (await player(f, route, a)).json()).progress.checkpoint, 'camp');
  await assert.rejects(player(f, route, b), reject(403, 'SESSION_EXPIRED'));
  await assert.rejects(player(f, route, a, 'PUT', { revision: 0, progress: {} }), reject(409, 'REVISION_CONFLICT'));
  await player(f, route, a, 'PUT', { revision: 1, progress: { checkpoint: 'bridge' } });
  assert.equal((await (await player(f, route, a)).json()).revision, 2);
  const config = await (await player(f, `/player/sessions/${session.id}/config`, a)).json(); assert.equal(config.rewardsEnabled, false); assert.equal(config.adsEnabled, false);
  await player(f, `/player/sessions/${session.id}/end`, a, 'POST', {});
  await assert.rejects(player(f, route, a), reject(403, 'SESSION_EXPIRED')); f.sql.close();
});

test('uploads require developer permission, enabled flag, real storage and game ownership', async () => {
  const f = fixture(); const dev = await actor(f, ['DEVELOPER']); const stranger = await actor(f, ['DEVELOPER']); const ordinary = await actor(f);
  const draft = game(f, dev, { status: 'draft' }); const payload = { gameId: draft.id, platform: 'web', version: '2.0.0', fileName: 'build.zip', sizeBytes: 22 };
  await assert.rejects(uploads(f, '/developer/uploads', ordinary, 'POST', payload), reject(403));
  await assert.rejects(uploads(f, '/developer/uploads', dev, 'POST', payload), reject(503, 'STORAGE_UNAVAILABLE'));
  f.env.PLATFORM_UPLOADS = storage(); await assert.rejects(uploads(f, '/developer/uploads', dev, 'POST', payload), reject(503, 'FEATURE_DISABLED'));
  f.sql.prepare('UPDATE platform_feature_flags SET enabled=1 WHERE key=?').run('PUBLIC_CREATOR_UPLOADS_ENABLED');
  await assert.rejects(uploads(f, '/developer/uploads', stranger, 'POST', payload), reject(403, 'FORBIDDEN'));
  await assert.rejects(uploads(f, '/developer/uploads', dev, 'POST', { ...payload, fileName: '../build.zip' }), reject(400));
  await assert.rejects(uploads(f, '/developer/uploads', dev, 'POST', { ...payload, sizeBytes: 600 * 1024 * 1024 }), reject(413));
  f.sql.close();
});

test('completed multipart uploads stay quarantined; client scan claims cannot publish or unlock them', async () => {
  const f = fixture(); const dev = await actor(f, ['PARTNER_DEVELOPER']); const stranger = await actor(f, ['DEVELOPER']);
  const draft = game(f, dev, { status: 'draft' }); f.env.PLATFORM_UPLOADS = storage();
  f.sql.prepare('UPDATE platform_feature_flags SET enabled=1 WHERE key=?').run('PUBLIC_CREATOR_UPLOADS_ENABLED');
  const { upload } = await (await uploads(f, '/developer/uploads', dev, 'POST', {
    gameId: draft.id, platform: 'web', version: '2.0.0', fileName: 'build.zip', sizeBytes: 22,
  })).json();
  const stored = f.sql.prepare('SELECT * FROM platform_uploads WHERE id=?').get(upload.id);
  assert.match(stored.object_key, /^quarantine\//);
  await assert.rejects(uploads(f, `/developer/uploads/${upload.id}`, stranger), reject(404));
  await assert.rejects(uploads(f, `/developer/uploads/${upload.id}/complete`, dev, 'POST', {}), reject(409));
  const partPath = `/developer/uploads/${upload.id}/parts/1`;
  const part = new Request(`${f.env.APP_ORIGIN}/api/platform${partPath}`, { method: 'PUT',
    headers: { origin: f.env.APP_ORIGIN, cookie: dev.cookie, 'content-type': 'application/octet-stream', 'content-length': '22' }, body: new Uint8Array(22) });
  await handleUploads(part, f.env, partPath);
  const complete = await uploads(f, `/developer/uploads/${upload.id}/complete`, dev, 'POST', { scan_status: 'clean' }); assert.equal(complete.status, 202);
  assert.equal(f.sql.prepare('SELECT status FROM platform_uploads WHERE id=?').get(upload.id).status, 'quarantined');
  await assert.rejects(uploads(f, `/developer/uploads/${upload.id}/process`, dev, 'POST', { status: 'clean', sha256: 'a'.repeat(64) }), reject(503, 'SCANNER_UNAVAILABLE'));
  assert.equal(f.sql.prepare('SELECT status FROM platform_games WHERE id=?').get(draft.id).status, 'draft');
  assert.equal(f.sql.prepare('SELECT scan_status FROM platform_game_versions WHERE id=?').get(upload.versionId).scan_status, 'pending');
  f.env.GAME_SCANNER = { async fetch() { return Response.json({ status: 'infected', errors: ['Test scanner fixture detection'] }); } };
  await assert.rejects(uploads(f, `/developer/uploads/${upload.id}/process`, dev, 'POST', {}), reject(422, 'VALIDATION_FAILED'));
  assert.equal(f.sql.prepare('SELECT status FROM platform_uploads WHERE id=?').get(upload.id).status, 'validation_failed');
  assert.equal(f.sql.prepare('SELECT scan_status FROM platform_game_versions WHERE id=?').get(upload.versionId).scan_status, 'infected');
  f.sql.close();
});

test('immutable wallet and revenue history cannot be silently edited or deleted', async () => {
  const f = fixture(); const user = await actor(f);
  f.sql.prepare('INSERT INTO platform_wallet_transactions VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), user.id, null, 'credits', 10, 'internal_test', 'test-ref', null, 'test fixture only', now());
  assert.throws(() => f.sql.prepare('UPDATE platform_wallet_transactions SET amount=100').run(), /immutable/);
  assert.throws(() => f.sql.prepare('DELETE FROM platform_wallet_transactions').run(), /immutable/);
  f.sql.close();
});

test('owner administration requires recent MFA and prevents partner finance escalation or owner self-modification', async () => {
  const f = fixture(); const owner = await actor(f, ['OWNER'], { mfa: true }); const partner = await actor(f, ['PARTNER_DEVELOPER']);
  const ordinary = await actor(f); const noMfa = await actor(f, ['OWNER']);
  const route = `/owner/players/${ordinary.id}/roles`;
  const invoke = (path, user, body) => handleAdministration(request(f, path, user, 'PUT', body), f.env, path);
  await assert.rejects(invoke(route, ordinary, { roles: ['DEVELOPER'], reason: 'Test role assignment' }), reject(403));
  await assert.rejects(invoke(route, noMfa, { roles: ['DEVELOPER'], reason: 'Test role assignment' }), reject(403, 'MFA_REQUIRED'));
  await assert.rejects(invoke(`/owner/players/${owner.id}/roles`, owner, { roles: ['PLAYER'], reason: 'Test self demotion' }), reject(409));
  await assert.rejects(invoke(`/owner/players/${partner.id}/roles`, owner,
    { roles: ['PARTNER_DEVELOPER', 'FINANCE_ADMIN'], reason: 'Test forbidden combined privileges' }), reject(409));
  await assert.rejects(invoke(`/owner/players/${partner.id}/roles`, owner,
    { roles: ['FINANCE_ADMIN'], reason: 'Test forbidden disguised reclassification' }), reject(409));
  await assert.rejects(invoke(route, owner, { roles: ['OWNER'], reason: 'Test unauthorized owner creation path' }), reject(400));
  f.sql.prepare('UPDATE platform_sessions SET auth_time=? WHERE id=?').run(now() - 600, owner.sessionId);
  await assert.rejects(invoke(route, owner, { roles: ['DEVELOPER'], reason: 'Test expired authentication' }), reject(403, 'REAUTH_REQUIRED'));
  f.sql.close();
});

test('role changes revoke sessions, advance credential version and record audit; suspension blocks access', async () => {
  const f = fixture(); const owner = await actor(f, ['OWNER'], { mfa: true }); const target = await actor(f);
  const rolePath = `/owner/players/${target.id}/roles`;
  await handleAdministration(request(f, rolePath, owner, 'PUT', { roles: ['DEVELOPER'], reason: 'Test developer onboarding' }), f.env, rolePath);
  const roles = f.sql.prepare('SELECT role FROM platform_user_roles WHERE user_id=?').all(target.id).map(row => row.role).sort();
  assert.deepEqual(roles, ['DEVELOPER', 'PLAYER']);
  assert.equal(f.sql.prepare('SELECT auth_version FROM platform_users WHERE id=?').get(target.id).auth_version, 1);
  assert.ok(f.sql.prepare('SELECT revoked_at FROM platform_sessions WHERE id=?').get(target.sessionId).revoked_at);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='account.roles' AND target_id=?").get(target.id).n, 1);
  await assert.rejects(requireUser(request(f, '/me', target), f.env), reject(401));
  const statusPath = `/owner/players/${target.id}/status`;
  await handleAdministration(request(f, statusPath, owner, 'PUT', { status: 'suspended', reason: 'Test account suspension' }), f.env, statusPath);
  assert.equal(f.sql.prepare('SELECT status FROM platform_users WHERE id=?').get(target.id).status, 'suspended');
  assert.equal(f.sql.prepare('SELECT auth_version FROM platform_users WHERE id=?').get(target.id).auth_version, 2);
  f.sql.close();
});

test('owner may assign/remove only verified developer game members and configure auditable cost thresholds', async () => {
  const f = fixture(); const owner = await actor(f, ['OWNER'], { mfa: true }); const dev = await actor(f, ['DEVELOPER']);
  const partner = await actor(f, ['PARTNER_DEVELOPER']); const unverified = await actor(f, ['DEVELOPER'], { verified: false });
  const g = game(f, dev, { status: 'draft' }); const memberPath = `/owner/games/${g.id}/members`;
  const invoke = (path, user, body) => handleAdministration(request(f, path, user, 'PUT', body), f.env, path);
  await assert.rejects(invoke(memberPath, owner, { userId: unverified.id, permission: 'edit', reason: 'Test verification boundary' }), reject(400));
  await invoke(memberPath, owner, { userId: partner.id, permission: 'edit', reason: 'Test approved partner assignment' });
  assert.equal(f.sql.prepare('SELECT permission FROM platform_game_members WHERE game_id=? AND user_id=?').get(g.id, partner.id).permission, 'edit');
  await invoke(memberPath, owner, { userId: partner.id, permission: 'remove', reason: 'Test assignment removal' });
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_game_members WHERE game_id=?').get(g.id).n, 0);
  await assert.rejects(invoke('/owner/thresholds', partner, { key: 'storage_bytes', limitValue: 100000, reason: 'Test forbidden threshold' }), reject(403));
  await invoke('/owner/thresholds', owner, { key: 'storage_bytes', limitValue: 100000, reason: 'Test budget threshold' });
  assert.equal(f.sql.prepare('SELECT limit_value FROM platform_usage_thresholds WHERE key=?').get('storage_bytes').limit_value, 100000);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='usage.threshold'").get().n, 1);
  f.sql.close();
});

test('actual account erasure builder removes private product data atomically and retains pseudonymous financial history', async () => {
  const f = fixture(); const user = await actor(f); const g = game(f, user);
  await data(f, '/projects', user, 'POST', { name: 'Private project', project: { private: true } });
  await data(f, '/preferences', user, 'PUT', { language: 'es' });
  await data(f, '/favorites', user, 'POST', { gameId: g.id }); await data(f, '/library', user, 'POST', { gameId: g.id });
  await data(f, '/creator/join', user, 'POST', { guidelinesAccepted: true });
  const { session } = await (await player(f, '/player/sessions', user, 'POST', { gameId: g.id })).json();
  await player(f, `/player/sessions/${session.id}/progress`, user, 'PUT', { revision: 0, progress: { level: 3 } });
  f.sql.prepare('INSERT INTO platform_wallet_transactions VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), user.id, null, 'credits', 1, 'internal_test', 'test-erasure-reference', null, 'Internal retention fixture', now());
  const response = await handleAuth(request(f, '/auth/account', user, 'DELETE', { confirmation: 'DELETE' }), f.env, '/auth/account', {
    accountErasureStatements: userId => accountErasureStatements(f.env, userId),
  });
  const result = await response.json(); assert.equal(result.deleted, true); assert.equal(result.privateDataErased, true); assert.match(result.retention, /pseudonymous/);
  for (const table of ['platform_projects', 'platform_preferences', 'platform_favorites', 'platform_library', 'platform_waitlist', 'platform_progress', 'platform_play_history']) {
    assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id=?`).get(user.id).n, 0, table);
  }
  assert.equal(f.sql.prepare('SELECT user_id FROM platform_game_sessions WHERE id=?').get(session.id).user_id, null);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_wallet_transactions WHERE user_id=?').get(user.id).n, 1);
  assert.equal(f.sql.prepare('SELECT status FROM platform_users WHERE id=?').get(user.id).status, 'deleted');
  f.sql.close();
});

test('owner-made games are approved automatically on submit; creator games still wait for review', async () => {
  const f = fixture(); const owner = await actor(f, ['OWNER'], { mfa: true }); const dev = await actor(f, ['DEVELOPER']);
  const mine = game(f, owner, { status: 'draft', versionStatus: 'ready' }); screenshot(f, mine.id, owner);
  const result = await (await data(f, `/developer/games/${mine.id}/submit`, owner, 'POST', { versionId: mine.versionId, rightsConfirmed: true })).json();
  assert.equal(result.status, 'approved');
  assert.equal(f.sql.prepare('SELECT decision FROM platform_reviews WHERE game_id=?').get(mine.id).decision, 'approve');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='game.owner_auto_approve'").get().n, 1);
  const theirs = game(f, dev, { status: 'draft', versionStatus: 'ready' }); screenshot(f, theirs.id, dev);
  assert.equal((await (await data(f, `/developer/games/${theirs.id}/submit`, dev, 'POST', { versionId: theirs.versionId, rightsConfirmed: true })).json()).status, 'submitted');
  f.sql.close();
});

test('screenshots: three checked image slots, private until published, locked during review', async () => {
  const f = fixture(); const objects = new Map();
  f.env.PLATFORM_UPLOADS = { async put(k, v) { objects.set(k, v); }, async get(k) { return objects.has(k) ? { body: objects.get(k) } : null; }, async delete(k) { objects.delete(k); } };
  const dev = await actor(f, ['DEVELOPER']); const stranger = await actor(f); const owner = await actor(f, ['OWNER'], { mfa: true });
  const g = game(f, dev, { status: 'draft' });
  assert.deepEqual(imageInfo(png(1280, 720)), { type: 'image/png', width: 1280, height: 720 });
  await assert.rejects(mediaRequest(f, `/developer/games/${g.id}/media/1`, dev, 'PUT', new TextEncoder().encode('<svg onload=alert(1)>')), reject(415));
  await assert.rejects(mediaRequest(f, `/developer/games/${g.id}/media/1`, dev, 'PUT', png(100, 100)), reject(400));
  await assert.rejects(mediaRequest(f, `/developer/games/${g.id}/media/1`, dev, 'PUT', png(1280, 720, 1024 * 1024)), reject(413));
  await assert.rejects(mediaRequest(f, `/developer/games/${g.id}/media/1`, stranger, 'PUT', png(1280, 720)), reject(403));
  const first = await (await mediaRequest(f, `/developer/games/${g.id}/media/1`, dev, 'PUT', png(1280, 720))).json();
  assert.equal(first.media.length, 1); assert.equal(objects.size, 1);
  assert.equal(f.sql.prepare('SELECT cover_url FROM platform_games WHERE id=?').get(g.id).cover_url, first.media[0].url);
  const replaced = await (await mediaRequest(f, `/developer/games/${g.id}/media/1`, dev, 'PUT', png(1920, 1080))).json();
  assert.notEqual(replaced.media[0].id, first.media[0].id); assert.equal(objects.size, 1);
  const path = `/media/${replaced.media[0].id}`;
  assert.equal((await mediaRequest(f, path, dev, 'GET')).status, 200);
  assert.equal((await mediaRequest(f, path, owner, 'GET')).status, 200);
  await assert.rejects(mediaRequest(f, path, stranger, 'GET'), reject(404));
  f.sql.prepare("UPDATE platform_games SET status='published' WHERE id=?").run(g.id);
  const open = await mediaRequest(f, path, stranger, 'GET'); assert.equal(open.status, 200); assert.match(open.headers.get('cache-control'), /public/);
  assert.equal(open.headers.get('content-type'), 'image/png');
  await assert.rejects(mediaRequest(f, `/developer/games/${g.id}/media/2`, dev, 'PUT', png(1280, 720)), reject(409, 'LISTING_LOCKED'));
  f.sql.prepare("UPDATE platform_games SET status='draft' WHERE id=?").run(g.id);
  const removed = await (await mediaRequest(f, `/developer/games/${g.id}/media/1`, dev, 'DELETE')).json();
  assert.equal(removed.media.length, 0); assert.equal(objects.size, 0);
  assert.equal(f.sql.prepare('SELECT cover_url FROM platform_games WHERE id=?').get(g.id).cover_url, null);
  f.sql.close();
});

test('owner handles player reports: dismiss, or take the game off the site and notify its creator', async () => {
  const f = fixture(); const owner = await actor(f, ['OWNER'], { mfa: true }); const dev = await actor(f, ['DEVELOPER']); const reporter = await actor(f);
  const g = game(f, dev);
  await data(f, '/reports', reporter, 'POST', { gameId: g.id, category: 'content', detail: 'Offensive art' });
  await data(f, '/reports', reporter, 'POST', { gameId: g.id, category: 'broken', detail: 'Black screen' });
  assert.equal((await (await data(f, '/owner/overview', owner)).json()).openReports, 2);
  const [first, second] = (await (await data(f, '/owner/reports', owner)).json()).items;
  await assert.rejects(data(f, `/owner/reports/${first.id}`, owner, 'POST', { action: 'dismissed' }), reject(400));
  await assert.rejects(data(f, `/owner/reports/${first.id}`, dev, 'POST', { action: 'dismissed', note: 'nope' }), reject(403));
  await data(f, `/owner/reports/${first.id}`, owner, 'POST', { action: 'dismissed', note: 'Works for me' });
  await data(f, `/owner/reports/${second.id}`, owner, 'POST', { action: 'suspend_game', note: 'Removed until fixed' });
  assert.equal(f.sql.prepare('SELECT status FROM platform_games WHERE id=?').get(g.id).status, 'suspended');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_reports WHERE status='open'").get().n, 0);
  assert.match(f.sql.prepare('SELECT title FROM platform_notifications WHERE user_id=?').get(dev.id).title, /suspended/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action LIKE 'report.%'").get().n, 2);
  f.sql.close();
});
