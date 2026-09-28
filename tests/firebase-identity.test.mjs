import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { handleAuth, verifyFirebaseIdToken, base64url, requireUser } from '../platform/server/identity.mjs';
import { HttpError } from '../platform/server/common.mjs';

const migrations = await Promise.all(['0001_identity.sql', '0006_firebase_identity.sql']
  .map(name => readFile(new URL(`../platform/migrations/${name}`, import.meta.url), 'utf8')));
const PROJECT = 'crate-test-project';
const now = () => Math.floor(Date.now() / 1000);
const secret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const text = value => base64url(new TextEncoder().encode(JSON.stringify(value)));

// A real RSA key signs test tokens, so every assertion goes through actual RS256 verification.
const signer = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const stranger = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicJwk = { ...(await crypto.subtle.exportKey('jwk', signer.publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' };

async function token(overrides = {}, { key = signer.privateKey, kid = 'test-kid' } = {}) {
  const stamp = now(); const uid = overrides.sub ?? 'firebase-uid-1';
  const claims = { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: stamp, user_id: uid, sub: uid,
    iat: stamp, exp: stamp + 3600, email: 'player@example.test', email_verified: true,
    firebase: { sign_in_provider: 'password', identities: {} }, ...overrides };
  const head = text({ alg: 'RS256', kid, typ: 'JWT' }); const body = text(claims);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${base64url(new Uint8Array(signature))}`;
}

const calls = [];
let deleteOk = true;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).startsWith('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')) {
    return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { 'content-type': 'application/json' } });
  }
  if (String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:delete')) {
    return new Response(deleteOk ? '{}' : '{"error":{"message":"CREDENTIAL_TOO_OLD_LOGIN_AGAIN"}}', { status: deleteOk ? 200 : 400 });
  }
  throw new Error(`Unexpected network call: ${url}`);
};

function fixture({ registration = true } = {}) {
  const sql = new DatabaseSync(':memory:'); for (const migration of migrations) sql.exec(migration);
  if (registration) sql.prepare("UPDATE platform_feature_flags SET enabled=1 WHERE key='PUBLIC_REGISTRATION_ENABLED'").run();
  const env = { PLATFORM_DB: sqliteD1(sql), APP_ORIGIN: 'https://example.test', AUTH_SECRET: secret(), ENCRYPTION_KEY: secret(),
    FIREBASE_PROJECT_ID: PROJECT, FIREBASE_API_KEY: 'AIzaTestPublicWebApiKey000000000000', FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com` };
  return { sql, env };
}
function call(f, path, body, cookie, method = 'POST') {
  const headers = { origin: f.env.APP_ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.40', 'user-agent': 'Firebase test' };
  if (cookie) headers.cookie = cookie;
  const request = new Request(`${f.env.APP_ORIGIN}/api/platform${path}`, { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }) });
  return handleAuth(request, f.env, path);
}
const reject = (status, code) => error => error instanceof HttpError && error.status === status && (!code || error.code === code);
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];

test('a verified Firebase user gets one PLAYER account and a platform session cookie', async () => {
  const f = fixture();
  const response = await call(f, '/auth/firebase', { idToken: await token(), username: 'Mira_Builder', displayName: 'Mira' });
  assert.equal(response.status, 200);
  const { user } = await response.json();
  assert.deepEqual(user.roles, ['PLAYER']); assert.equal(user.emailVerified, true);
  assert.equal(user.username, 'mira_builder'); assert.equal(user.displayName, 'Mira');
  assert.match(response.headers.get('set-cookie'), /^__Host-crateship_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_firebase_accounts WHERE uid=?').get('firebase-uid-1').n, 1);
  assert.equal(f.sql.prepare('SELECT password_hash FROM platform_users').get().password_hash, null);
  // Signing in again reuses the same account.
  const again = await call(f, '/auth/firebase', { idToken: await token() });
  assert.equal((await again.json()).user.id, user.id);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_users').get().n, 1);
  const session = await call(f, '/auth/session', undefined, cookieOf(again), 'GET');
  assert.equal((await session.json()).user.signInProvider, 'password');
});

test('unverified email, closed registration and privilege fields never create an account', async () => {
  const f = fixture();
  await assert.rejects(call(f, '/auth/firebase', { idToken: await token({ email_verified: false }) }), reject(403, 'EMAIL_VERIFICATION_REQUIRED'));
  await assert.rejects(call(f, '/auth/firebase', { idToken: await token(), roles: ['OWNER'] }), reject(400, 'INVALID_REGISTRATION'));
  const closed = fixture({ registration: false });
  await assert.rejects(call(closed, '/auth/firebase', { idToken: await token() }), reject(503, 'REGISTRATION_DISABLED'));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_users').get().n, 0);
  assert.equal(closed.sql.prepare('SELECT COUNT(*) n FROM platform_users').get().n, 0);
});

test('forged, foreign, expired and malformed tokens are rejected', async () => {
  const f = fixture();
  const cases = [
    await token({}, { key: stranger.privateKey }),
    await token({}, { kid: 'unknown-kid' }),
    await token({ aud: 'another-project' }),
    await token({ iss: 'https://securetoken.google.com/another-project' }),
    await token({ exp: now() - 10 }),
    await token({ iat: now() + 3600 }),
    await token({ sub: '' }),
    await token({ user_id: 'someone-else' }),
    'not.a.jwt', 'x'.repeat(20000),
  ];
  for (const idToken of cases) await assert.rejects(verifyFirebaseIdToken(idToken, f.env), reject(401, 'INVALID_FIREBASE_IDENTITY'));
  await assert.rejects(verifyFirebaseIdToken(await token(), { ...f.env, FIREBASE_PROJECT_ID: undefined }), reject(503, 'FIREBASE_UNAVAILABLE'));
});

test('a taken username falls back to a generated one and an existing email is never auto-linked', async () => {
  const f = fixture();
  await call(f, '/auth/firebase', { idToken: await token(), username: 'builder' });
  const second = await (await call(f, '/auth/firebase', { idToken: await token({ sub: 'uid-2', user_id: 'uid-2', email: 'two@example.test' }), username: 'builder' })).json();
  assert.match(second.user.username, /^player_[a-f0-9]{16}$/);
  await assert.rejects(call(f, '/auth/firebase', { idToken: await token({ sub: 'uid-3', user_id: 'uid-3', email: 'player@example.test' }) }), reject(409, 'ACCOUNT_LINK_REQUIRED'));
});

test('accounts with platform MFA must complete the authenticator challenge', async () => {
  const f = fixture();
  const { user } = await (await call(f, '/auth/firebase', { idToken: await token() })).json();
  f.sql.prepare('INSERT INTO platform_mfa (user_id, secret_ciphertext, enabled, created_at, updated_at) VALUES (?,?,1,?,?)').run(user.id, 'x.y', now(), now());
  const response = await call(f, '/auth/firebase', { idToken: await token() });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.mfaRequired, true); assert.match(body.challengeId, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('reauthentication needs a fresh sign-in of the same Firebase user', async () => {
  const f = fixture();
  const first = await call(f, '/auth/firebase', { idToken: await token() });
  const cookie = cookieOf(first);
  await assert.rejects(call(f, '/auth/reauth', { idToken: await token({ auth_time: now() - 900 }) }, cookie), reject(403, 'REAUTH_REQUIRED'));
  await call(f, '/auth/firebase', { idToken: await token({ sub: 'uid-9', user_id: 'uid-9', email: 'nine@example.test' }) });
  await assert.rejects(call(f, '/auth/reauth', { idToken: await token({ sub: 'uid-9', user_id: 'uid-9', email: 'nine@example.test' }) }, cookie), reject(401, 'INVALID_FIREBASE_IDENTITY'));
  const fresh = await call(f, '/auth/reauth', { idToken: await token() }, cookie);
  assert.equal(fresh.status, 200);
  assert.notEqual(cookieOf(fresh), cookie);
  await assert.rejects(call(f, '/auth/session', undefined, cookie, 'GET').then(r => r.json()).then(b => { if (!b.user) throw new HttpError(401, 'old', 'AUTH_REQUIRED'); }), reject(401));
});

test('account deletion removes the Firebase sign-in first and aborts if that fails', async () => {
  const f = fixture();
  const first = await call(f, '/auth/firebase', { idToken: await token() });
  const userId = (await first.json()).user.id;
  const cookie = cookieOf(await call(f, '/auth/reauth', { idToken: await token() }, cookieOf(first)));
  deleteOk = false; calls.length = 0;
  await assert.rejects(call(f, '/auth/account', { confirmation: 'DELETE', idToken: await token() }, cookie, 'DELETE'), reject(503, 'FIREBASE_DELETE_FAILED'));
  assert.equal(f.sql.prepare('SELECT status FROM platform_users WHERE id=?').get(userId).status, 'active');
  deleteOk = true; calls.length = 0;
  const idToken = await token();
  const deleted = await call(f, '/auth/account', { confirmation: 'DELETE', idToken }, cookie, 'DELETE');
  assert.equal(deleted.status, 200);
  const remote = calls.find(c => c.url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:delete'));
  assert.ok(remote); assert.deepEqual(JSON.parse(remote.init.body), { idToken });
  assert.equal(f.sql.prepare('SELECT status FROM platform_users WHERE id=?').get(userId).status, 'deleted');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_firebase_accounts').get().n, 0);
});

test('config exposes only the public Firebase web settings', async () => {
  const f = fixture();
  const { capabilities } = await (await call(f, '/auth/session', undefined, undefined, 'GET')).json();
  assert.deepEqual(capabilities.firebase, { apiKey: f.env.FIREBASE_API_KEY, authDomain: f.env.FIREBASE_AUTH_DOMAIN, projectId: PROJECT });
  assert.equal(capabilities.registration, true);
  assert.equal(JSON.stringify(capabilities).includes(f.env.AUTH_SECRET), false);
});

// Cloudflare Workers throws on redirect:'error', which broke every live sign-in; key fetches must use 'manual' and still refuse redirects.
test('Firebase key download works under Workers fetch rules and refuses redirects', async () => {
  const original = globalThis.fetch; let redirecting = false;
  globalThis.fetch = async (url, init = {}) => {
    if (init.redirect === 'error') throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    if (redirecting) return new Response(null, { status: 302, headers: { location: 'https://attacker.example/keys' } });
    return original(url, init);
  };
  try {
    const f = fixture();
    const claims = await verifyFirebaseIdToken(await token(), f.env);
    assert.equal(claims.sub, 'firebase-uid-1');
    redirecting = true;
    await assert.rejects(verifyFirebaseIdToken(await token(), f.env), reject(503, 'FIREBASE_UNAVAILABLE'));
  } finally { globalThis.fetch = original; }
});
