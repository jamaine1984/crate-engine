import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { handleAuth, requireUser, requireRole, hashPassword, verifyPassword, tokenHash,
  base64url, totpCode, rateLimit, verifyGoogleIdToken, PASSWORD_ITERATIONS } from '../platform/server/identity.mjs';
import { HttpError, readJson, requireMutationOrigin, database, audit } from '../platform/server/common.mjs';

const migration = await readFile(new URL('../platform/migrations/0001_identity.sql', import.meta.url), 'utf8');
const firebaseMigration = await readFile(new URL('../platform/migrations/0006_firebase_identity.sql', import.meta.url), 'utf8');
const stamp = () => Math.floor(Date.now() / 1000);
const secret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const password = 'correct horse battery stapler';

// Real SQLite executes all application SQL. This thin adapter models D1 result shapes and atomic batch.
function sqliteD1(sqlite) {
  class Statement {
    constructor(sql, values = []) { this.sql = sql; this.values = values; }
    bind(...values) { return new Statement(this.sql, values); }
    async first(column) { const row = sqlite.prepare(this.sql).get(...this.values) || null; return column && row ? row[column] : row; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
    async run() { const result = sqlite.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; }
  }
  return { prepare: sql => new Statement(sql), async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.all());
      sqlite.exec('COMMIT'); return result;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
}
function fixture(extra = {}) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(migration); sqlite.exec(firebaseMigration);
  const env = { PLATFORM_DB: sqliteD1(sqlite), APP_ORIGIN: 'https://example.test', AUTH_SECRET: secret(),
    ENCRYPTION_KEY: secret(), AUTH_PASSWORD_POLICY_APPROVED: 'true', ...extra };
  return { sqlite, env };
}
function req(env, path, body, cookie, method = 'POST', extraHeaders = {}) {
  const headers = { origin: env.APP_ORIGIN, 'content-type': 'application/json',
    'cf-connecting-ip': '192.0.2.10', 'user-agent': 'Identity test browser', ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  return new Request(`${env.APP_ORIGIN}/api/platform${path}`, { method, headers,
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}) });
}
async function call(env, path, body, cookie, method = 'POST', headers) {
  return handleAuth(req(env, path, body, cookie, method, headers), env, path);
}
async function seed(f, roles = ['PLAYER'], options = {}) {
  const userId = crypto.randomUUID(); const email = options.email || `${userId}@example.test`;
  f.sqlite.prepare(`INSERT INTO platform_users (id,email,username,display_name,password_hash,email_verified,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(userId, email, `u_${userId.replaceAll('-', '')}`, 'Test Player',
    await hashPassword(password, f.env), options.verified === false ? 0 : 1, options.status || 'active', stamp(), stamp());
  for (const role of roles) f.sqlite.prepare('INSERT INTO platform_user_roles (user_id,role,created_at) VALUES (?,?,?)').run(userId, role, stamp());
  return { id: userId, email };
}
async function signIn(f, user) {
  const response = await call(f.env, '/auth/login', { email: user.email, password });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { response, cookie, body: await response.json() };
}
function enableRegistration(f) {
  Object.assign(f.env, { MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'test-provider-key-never-a-real-key', MAIL_FROM: 'games@example.test' });
  f.sqlite.prepare('UPDATE platform_feature_flags SET enabled=1 WHERE key=?').run('PUBLIC_REGISTRATION_ENABLED');
}
function expectError(status, code) {
  return error => error instanceof HttpError && error.status === status && (!code || error.code === code);
}

test('password hashes use unique salts, pepper and supported bounded PBKDF2 parameters', async () => {
  const f = fixture();
  const a = await hashPassword(password, f.env); const b = await hashPassword(password, f.env);
  assert.notEqual(a, b); assert.equal(PASSWORD_ITERATIONS, 100000);
  assert.equal(await verifyPassword(password, a, f.env), true);
  assert.equal(await verifyPassword('wrong password', a, f.env), false);
  assert.equal(await verifyPassword(password, a, { ...f.env, AUTH_SECRET: secret() }), false);
  assert.equal(await verifyPassword(password, a.replace('$100000$', '$1$'), f.env), false);
  await assert.rejects(hashPassword('short', f.env), expectError(400, 'INVALID_PASSWORD'));
  f.sqlite.close();
});

test('database and origin configuration fail closed; production never gets development cookies', async () => {
  assert.throws(() => database({ DB: {} }), expectError(503));
  const f = fixture(); const user = await seed(f);
  await assert.rejects(call({ ...f.env, AUTH_SECRET: 'weak' }, '/auth/login', { email: user.email, password }), expectError(503));
  await assert.rejects(call({ ...f.env, APP_ORIGIN: 'http://example.test' }, '/auth/login', {}), expectError(503));
  const signed = await signIn(f, user); const header = signed.response.headers.get('set-cookie');
  assert.match(header, /^__Host-crateship_session=/); assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/); assert.match(header, /Secure/); assert.match(header, /Path=\//); assert.doesNotMatch(header, /Domain=/);
  f.sqlite.close();
});

test('localhost cookies require explicit local opt-in and never honor arbitrary insecure origins', async () => {
  const f = fixture({ APP_ORIGIN: 'http://localhost:8788' }); const user = await seed(f);
  await assert.rejects(call(f.env, '/auth/login', { email: user.email, password }), expectError(503));
  f.env.AUTH_LOCAL_DEV = 'true'; const signed = await signIn(f, user);
  assert.match(signed.response.headers.get('set-cookie'), /^crateship_session_local=/);
  assert.doesNotMatch(signed.response.headers.get('set-cookie'), /Secure/);
  await assert.rejects(call({ ...f.env, APP_ORIGIN: 'http://evil.test' }, '/auth/login', {}), expectError(503));
  f.sqlite.close();
});

test('CSRF origin and JSON/body size enforcement reject browser form and cross-site writes', async () => {
  const f = fixture();
  const cross = req(f.env, '/auth/login', {}, null, 'POST', { origin: 'https://evil.test' });
  assert.throws(() => requireMutationOrigin(cross, f.env), expectError(403, 'ORIGIN_DENIED'));
  await assert.rejects(handleAuth(cross, f.env, '/auth/login'), expectError(403));
  const noOrigin = req(f.env, '/auth/login', {}); noOrigin.headers.delete('origin');
  await assert.rejects(handleAuth(noOrigin, f.env, '/auth/login'), expectError(403));
  await assert.rejects(readJson(new Request('https://example.test', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })), expectError(415));
  await assert.rejects(readJson(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ huge: 'x'.repeat(500) }), headers: { 'content-type': 'application/json' } }), 100), expectError(413));
  f.sqlite.close();
});

test('persistent sessions store only token hashes and resolve normalized database roles', async () => {
  const f = fixture(); const user = await seed(f, ['PARTNER_DEVELOPER']); const signed = await signIn(f, user);
  const row = f.sqlite.prepare('SELECT * FROM platform_sessions').get();
  const raw = signed.cookie.split('=')[1]; assert.notEqual(row.token_hash, raw); assert.equal(row.token_hash, await tokenHash(raw));
  const restored = await requireUser(req(f.env, '/auth/session', null, signed.cookie, 'GET'), f.env);
  assert.equal(restored.id, user.id); assert.equal(restored.emailVerified, true);
  assert.deepEqual(restored.roles, ['PARTNER_DEVELOPER']); assert.equal(restored.sessionId, row.id);
  await assert.rejects(requireRole(req(f.env, '/owners', {}, signed.cookie), f.env, ['OWNER']), expectError(403, 'ROLE_DENIED'));
  assert.equal((await call(f.env, '/auth/session', null, signed.cookie, 'GET')).status, 200);
  f.sqlite.close();
});

test('expired, revoked, duplicate-cookie and suspended-account sessions are rejected', async () => {
  const f = fixture(); const user = await seed(f); const signed = await signIn(f, user);
  await assert.rejects(requireUser(req(f.env, '/auth/session', null, `${signed.cookie}; ${signed.cookie}`, 'GET'), f.env), expectError(401));
  f.sqlite.prepare('UPDATE platform_sessions SET expires_at=?').run(stamp() - 1);
  await assert.rejects(requireUser(req(f.env, '/auth/session', null, signed.cookie, 'GET'), f.env), expectError(401));
  const again = await signIn(f, user); f.sqlite.prepare('UPDATE platform_users SET status=? WHERE id=?').run('suspended', user.id);
  await assert.rejects(requireUser(req(f.env, '/auth/session', null, again.cookie, 'GET'), f.env), expectError(401));
  f.sqlite.close();
});

test('logout and device revocation are scoped to authenticated account', async () => {
  const f = fixture(); const user = await seed(f); const other = await seed(f);
  const a = await signIn(f, user); const b = await signIn(f, user); const c = await signIn(f, other);
  const devices = await (await call(f.env, '/auth/sessions', null, a.cookie, 'GET')).json();
  assert.equal(devices.sessions.length, 2); assert.equal(devices.sessions.filter(s => s.current).length, 1);
  await call(f.env, `/auth/sessions/${c.body.user.sessionId}`, {}, a.cookie, 'DELETE');
  await requireUser(req(f.env, '/auth/session', null, c.cookie, 'GET'), f.env);
  await call(f.env, `/auth/sessions/${b.body.user.sessionId}`, {}, a.cookie, 'DELETE');
  await assert.rejects(requireUser(req(f.env, '/auth/session', null, b.cookie, 'GET'), f.env), expectError(401));
  const logout = await call(f.env, '/auth/logout', {}, a.cookie); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  await assert.rejects(requireUser(req(f.env, '/auth/session', null, a.cookie, 'GET'), f.env), expectError(401));
  f.sqlite.close();
});

test('unverified users and unsupported role names cannot authorize protected operations', async () => {
  const f = fixture(); const user = await seed(f, ['DEVELOPER'], { verified: false }); const signed = await signIn(f, user);
  await assert.rejects(requireRole(req(f.env, '/developer', {}, signed.cookie), f.env, ['DEVELOPER']), expectError(403, 'EMAIL_VERIFICATION_REQUIRED'));
  await assert.rejects(requireRole(req(f.env, '/developer', {}, signed.cookie), f.env, ['ADMIN']), expectError(403, 'ROLE_DENIED'));
  assert.throws(() => f.sqlite.prepare('INSERT INTO platform_user_roles (user_id,role,created_at) VALUES (?,?,?)').run(user.id, 'ADMIN', stamp()), /CHECK/);
  f.sqlite.close();
});

test('rate limits use atomic database upserts for concurrent attempts', async () => {
  const f = fixture(); const request = req(f.env, '/auth/login', {});
  const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => rateLimit(request, f.env, 'burst', 'one-user', 3, 900)));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 3);
  assert.equal(outcomes.filter(r => r.status === 'rejected' && r.reason.status === 429).length, 17);
  assert.equal(f.sqlite.prepare('SELECT attempts FROM platform_rate_limits').get().attempts, 20);
  f.sqlite.close();
});

test('public registration is disabled until flag, real mail configuration and policy review are present', async () => {
  const f = fixture(); const body = { email: 'new@example.test', username: 'newplayer', password };
  await assert.rejects(call(f.env, '/auth/register', body), expectError(503, 'REGISTRATION_DISABLED'));
  f.sqlite.prepare('UPDATE platform_feature_flags SET enabled=1').run();
  await assert.rejects(call(f.env, '/auth/register', body), expectError(503, 'REGISTRATION_DISABLED'));
  enableRegistration(f); delete f.env.AUTH_PASSWORD_POLICY_APPROVED;
  await assert.rejects(call(f.env, '/auth/register', body), expectError(503, 'REGISTRATION_DISABLED'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM platform_users').get().n, 0);
  f.sqlite.close();
});

test('registration never accepts roles and sends a real provider request without returning its secret token', async () => {
  const f = fixture(); enableRegistration(f); const original = globalThis.fetch; const messages = [];
  globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); messages.push(JSON.parse(options.body)); return Response.json({ id: 'mail-receipt' }); };
  try {
    const body = { email: 'new@example.test', username: 'newplayer', password, roles: ['OWNER'] };
    await assert.rejects(call(f.env, '/auth/register', body), expectError(400, 'INVALID_REGISTRATION'));
    delete body.roles; const response = await call(f.env, '/auth/register', body);
    assert.equal(response.status, 201); assert.deepEqual(await response.json(), { requiresEmailVerification: true });
    assert.equal(messages.length, 1); assert.match(messages[0].text, /\/verify-email#token=/);
    assert.deepEqual(f.sqlite.prepare('SELECT role FROM platform_user_roles').all().map(r => r.role), ['PLAYER']);
    const token = messages[0].text.match(/#token=([A-Za-z0-9_-]+)/)[1];
    assert.equal(f.sqlite.prepare('SELECT token_hash FROM platform_auth_tokens').get().token_hash, await tokenHash(token));
    const verified = await call(f.env, '/auth/verification/confirm', { token }); assert.equal(verified.status, 200);
    await assert.rejects(call(f.env, '/auth/verification/confirm', { token }), expectError(400, 'INVALID_TOKEN'));
    assert.equal(f.sqlite.prepare('SELECT email_verified FROM platform_users').get().email_verified, 1);
  } finally { globalThis.fetch = original; f.sqlite.close(); }
});

test('mail delivery failure is explicit and leaves no usable reset/verification token', async () => {
  const f = fixture(); enableRegistration(f); const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: 'not configured' }, { status: 403 });
  try {
    await assert.rejects(call(f.env, '/auth/register', { email: 'new@example.test', username: 'newplayer', password }), expectError(503, 'EMAIL_DELIVERY_FAILED'));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM platform_auth_tokens').get().n, 0);
    assert.equal(f.sqlite.prepare('SELECT email_verified FROM platform_users').get().email_verified, 0);
  } finally { globalThis.fetch = original; f.sqlite.close(); }
});

test('password reset tokens expire, are single-use and revoke every session', async () => {
  const f = fixture(); enableRegistration(f); const user = await seed(f); const signed = await signIn(f, user);
  const original = globalThis.fetch; const messages = [];
  globalThis.fetch = async (_url, options) => { messages.push(JSON.parse(options.body)); return Response.json({ id: 'mail-receipt' }); };
  try {
    await call(f.env, '/auth/reset/request', { email: user.email });
    const token = messages.at(-1).text.match(/#token=([A-Za-z0-9_-]+)/)[1];
    f.sqlite.prepare('UPDATE platform_auth_tokens SET expires_at=?').run(stamp() - 1);
    await assert.rejects(call(f.env, '/auth/reset/confirm', { token, password: 'a new long password' }), expectError(400, 'INVALID_TOKEN'));
    await call(f.env, '/auth/reset/request', { email: user.email });
    const fresh = messages.at(-1).text.match(/#token=([A-Za-z0-9_-]+)/)[1];
    await call(f.env, '/auth/reset/confirm', { token: fresh, password: 'a new long password' });
    await assert.rejects(requireUser(req(f.env, '/auth/session', null, signed.cookie, 'GET'), f.env), expectError(401));
    await assert.rejects(call(f.env, '/auth/reset/confirm', { token: fresh, password }), expectError(400, 'INVALID_TOKEN'));
    const account = f.sqlite.prepare('SELECT password_hash FROM platform_users').get();
    assert.equal(await verifyPassword('a new long password', account.password_hash, f.env), true);
    const unknown = await call(f.env, '/auth/reset/request', { email: 'unknown@example.test' });
    assert.equal(unknown.status, 200); assert.equal(messages.length, 2);
  } finally { globalThis.fetch = original; f.sqlite.close(); }
});

test('TOTP matches RFC 6238 published SHA1 vectors', async () => {
  const key = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  for (const [time, expected] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
    [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]) {
    assert.equal(await totpCode(key, Math.floor(time / 30), 8), expected);
  }
});

test('owner requires MFA; enrollment encrypts secret, revokes sessions, then challenges and rejects replay', async () => {
  const f = fixture(); const user = await seed(f, ['OWNER']); const signed = await signIn(f, user);
  const originalNow = Date.now; let clock = originalNow(); Date.now = () => clock;
  try {
    await assert.rejects(requireRole(req(f.env, '/owner', {}, signed.cookie), f.env, ['OWNER']), expectError(403, 'MFA_REQUIRED'));
    const setup = await (await call(f.env, '/auth/mfa/enroll', {}, signed.cookie)).json();
    const stored = f.sqlite.prepare('SELECT secret_ciphertext FROM platform_mfa').get().secret_ciphertext;
    assert.notEqual(stored, setup.secret); assert.ok(!stored.includes(setup.secret));
    const code = await totpCode(setup.secret, Math.floor(stamp() / 30));
    await call(f.env, '/auth/mfa/confirm', { code }, signed.cookie);
    await assert.rejects(requireUser(req(f.env, '/auth/session', null, signed.cookie, 'GET'), f.env), expectError(401));
    const login = await call(f.env, '/auth/login', { email: user.email, password });
    assert.equal(login.status, 202); assert.equal(login.headers.get('set-cookie'), null);
    const { challengeId } = await login.json();
    await assert.rejects(call(f.env, '/auth/mfa/verify', { challengeId, code }), expectError(401, 'INVALID_MFA'));
    clock += 31000;
    const nextCode = await totpCode(setup.secret, Math.floor(stamp() / 30));
    const verified = await call(f.env, '/auth/mfa/verify', { challengeId, code: nextCode });
    const cookie = verified.headers.get('set-cookie').split(';')[0];
    const owner = await requireRole(req(f.env, '/owner', {}, cookie), f.env, ['OWNER'], { mfa: true, recent: true });
    assert.equal(owner.id, user.id); assert.ok(owner.mfaTime);
    await assert.rejects(call(f.env, '/auth/mfa/verify', { challengeId, code: nextCode }), expectError(401));
    const auditJson = JSON.stringify(f.sqlite.prepare('SELECT * FROM platform_audit').all());
    assert.ok(!auditJson.includes(setup.secret));
  } finally { Date.now = originalNow; f.sqlite.close(); }
});

test('reauth rotates session; account deletion anonymizes identity and blocks sign-in', async () => {
  const f = fixture(); const user = await seed(f); const signed = await signIn(f, user);
  f.sqlite.prepare('UPDATE platform_sessions SET auth_time=?').run(stamp() - 600);
  await assert.rejects(call(f.env, '/auth/account', { confirmation: 'DELETE' }, signed.cookie, 'DELETE'), expectError(403, 'REAUTH_REQUIRED'));
  const reauth = await call(f.env, '/auth/reauth', { password }, signed.cookie);
  const newCookie = reauth.headers.get('set-cookie').split(';')[0]; assert.notEqual(newCookie, signed.cookie);
  await assert.rejects(requireUser(req(f.env, '/auth/session', null, signed.cookie, 'GET'), f.env), expectError(401));
  await call(f.env, '/auth/account', { confirmation: 'DELETE' }, newCookie, 'DELETE');
  const row = f.sqlite.prepare('SELECT * FROM platform_users WHERE id=?').get(user.id);
  assert.equal(row.status, 'deleted'); assert.equal(row.password_hash, null); assert.notEqual(row.email, user.email);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM platform_user_roles WHERE user_id=?').get(user.id).n, 0);
  await assert.rejects(requireUser(req(f.env, '/auth/session', null, newCookie, 'GET'), f.env), expectError(401));
  await assert.rejects(call(f.env, '/auth/login', { email: user.email, password }), expectError(401));
  f.sqlite.close();
});

test('owner idle and absolute session expiry are enforced even before generic expiry', async () => {
  const f = fixture(); const user = await seed(f, ['OWNER']); const signed = await signIn(f, user);
  f.sqlite.prepare('UPDATE platform_sessions SET last_seen_at=?').run(stamp() - 1801);
  await assert.rejects(requireUser(req(f.env, '/auth/session', null, signed.cookie, 'GET'), f.env), expectError(401));
  f.sqlite.close();
});

test('trusted account erasure callback rolls back private deletion and identity mutation together on failure', async () => {
  const f = fixture(); const user = await seed(f); const signed = await signIn(f, user);
  f.sqlite.exec('CREATE TABLE private_fixture(user_id TEXT PRIMARY KEY, content TEXT NOT NULL)');
  f.sqlite.prepare('INSERT INTO private_fixture VALUES(?,?)').run(user.id, 'private project');
  const options = { accountErasureStatements: (userId, db) => [
    db.prepare('DELETE FROM private_fixture WHERE user_id=?').bind(userId),
    db.prepare('INSERT INTO nonexistent_erasure_table VALUES(?)').bind(userId),
  ] };
  await assert.rejects(handleAuth(req(f.env, '/auth/account', { confirmation: 'DELETE' }, signed.cookie, 'DELETE'), f.env, '/auth/account', options), /no such table/);
  assert.equal(f.sqlite.prepare('SELECT content FROM private_fixture').get().content, 'private project');
  assert.equal(f.sqlite.prepare('SELECT status FROM platform_users WHERE id=?').get(user.id).status, 'active');
  await requireUser(req(f.env, '/auth/session', null, signed.cookie, 'GET'), f.env);
  const deleted = await handleAuth(req(f.env, '/auth/account', { confirmation: 'DELETE' }, signed.cookie, 'DELETE'), f.env, '/auth/account', {
    accountErasureStatements: (userId, db) => [db.prepare('DELETE FROM private_fixture WHERE user_id=?').bind(userId)],
  });
  const result = await deleted.json(); assert.equal(result.privateDataErased, true); assert.match(result.retention, /pseudonymous/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM private_fixture').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT status FROM platform_users WHERE id=?').get(user.id).status, 'deleted');
  f.sqlite.close();
});

test('audit redacts secret-shaped fields before storage', async () => {
  const f = fixture();
  await audit(f.env, { actor: 'test', action: 'test', target: 'test', password: 'never-log-this', nested: { apiToken: 'secret-value' } });
  const detail = f.sqlite.prepare('SELECT detail_json FROM platform_audit').get().detail_json;
  assert.ok(!detail.includes('never-log-this')); assert.ok(!detail.includes('secret-value')); assert.match(detail, /redacted/);
  f.sqlite.close();
});

test('Google is unavailable without configuration and OAuth start uses cookie state plus S256 PKCE', async () => {
  const f = fixture();
  await assert.rejects(call(f.env, '/auth/google/start', null, null, 'GET'), expectError(503, 'GOOGLE_UNAVAILABLE'));
  Object.assign(f.env, { GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-client-secret-not-real' });
  const response = await call(f.env, '/auth/google/start', null, null, 'GET');
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://accounts.google.com'); assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(location.searchParams.get('scope'), 'openid email profile');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://example.test/api/platform/auth/google/callback');
  const state = location.searchParams.get('state'); assert.match(response.headers.get('set-cookie'), new RegExp(state));
  const row = f.sqlite.prepare('SELECT * FROM platform_oauth_states').get(); assert.equal(row.state_hash, await tokenHash(state));
  assert.ok(!row.payload_ciphertext.includes(location.searchParams.get('nonce')));
  const bad = new Request(`${f.env.APP_ORIGIN}/api/platform/auth/google/callback?state=${state}&code=bad`, { headers: { 'cf-connecting-ip': '192.0.2.10' } });
  await assert.rejects(handleAuth(bad, f.env, '/auth/google/callback'), expectError(400, 'INVALID_OAUTH_STATE'));
  f.sqlite.close();
});

test('Google ID tokens require authentic RS256 signature, audience, issuer, nonce and verified email', async () => {
  const f = fixture({ GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com' });
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey); Object.assign(jwk, { kid: 'test-key', alg: 'RS256', use: 'sig' });
  const original = globalThis.fetch;
  globalThis.fetch = async url => { assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs'); return Response.json({ keys: [jwk] }); };
  const nonce = secret();
  async function jwt(overrides = {}, algorithm = 'RS256') {
    const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: algorithm, kid: jwk.kid })));
    const claims = base64url(new TextEncoder().encode(JSON.stringify({ iss: 'https://accounts.google.com', aud: f.env.GOOGLE_CLIENT_ID,
      sub: 'google-user-123', email: 'google@example.test', email_verified: true, nonce, iat: stamp(), exp: stamp() + 3600, ...overrides })));
    const signed = `${header}.${claims}`;
    return `${signed}.${base64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(signed)))}`;
  }
  try {
    assert.equal((await verifyGoogleIdToken(await jwt(), f.env, nonce)).sub, 'google-user-123');
    for (const overrides of [{ aud: 'attacker-client' }, { iss: 'https://evil.test' }, { nonce: 'wrong' }, { email_verified: false }, { exp: stamp() - 1 }]) {
      await assert.rejects(verifyGoogleIdToken(await jwt(overrides), f.env, nonce), expectError(401, 'INVALID_GOOGLE_IDENTITY'));
    }
    await assert.rejects(verifyGoogleIdToken(await jwt({}, 'none'), f.env, nonce), expectError(401));
    const valid = await jwt(); const pieces = valid.split('.'); pieces[2] = base64url(new Uint8Array(256));
    await assert.rejects(verifyGoogleIdToken(pieces.join('.'), f.env, nonce), expectError(401));
  } finally { globalThis.fetch = original; f.sqlite.close(); }
});
