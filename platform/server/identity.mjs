/**
 * Isolated Workers/D1 identity foundation. Configuration is server-only:
 * PLATFORM_DB: separate D1 binding with platform/migrations/0001_identity.sql.
 * APP_ORIGIN: exact HTTPS origin. AUTH_LOCAL_DEV=true only for explicit localhost.
 * AUTH_SECRET: at least 32 random bytes encoded as base64url; password pepper/IP HMAC.
 * ENCRYPTION_KEY: exactly 32 random bytes encoded as base64url; AES-256-GCM MFA/OAuth.
 * MAIL_PROVIDER=resend, MAIL_API_KEY, MAIL_FROM: verified sender. No pretend email mode.
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: owner-configured Web application client;
 * callback APP_ORIGIN + /api/platform/auth/google/callback. No grants are activated here.
 * AUTH_PASSWORD_POLICY_APPROVED=true: explicit operator review before public password
 * signup on production. PBKDF2 SHA-256 100,000 is compatible with older workerd limits
 * but below OWASP's 600,000 recommendation. This is NOT an independently audited IdP.
 * Registration also requires real mail configuration and DB PUBLIC_REGISTRATION_ENABLED.
 * Keep registration disabled until mail/domain, credential storage, MFA and runtime checks pass.
 * Sources: developers.cloudflare.com/workers/runtime-apis/web-crypto/
 * cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 * developers.google.com/identity/openid-connect/openid-connect
 * RFC 6238 (TOTP), RFC 7636 (PKCE). No existing users are automatically migrated.
 */
import { HttpError, json, readJson, id, now, database, audit, appOrigin,
  requireMutationOrigin } from './common.mjs';

export const ROLES = Object.freeze(['PLAYER', 'DEVELOPER', 'PARTNER_DEVELOPER',
  'MODERATOR', 'CONTENT_MANAGER', 'FINANCE_ADMIN', 'PLATFORM_ADMIN', 'OWNER']);
export const PASSWORD_ITERATIONS = 100_000;
const encoder = new TextEncoder();
const SESSION_SECONDS = 30 * 86400;
const OWNER_SESSION_SECONDS = 12 * 3600;
const RECENT_SECONDS = 300;
const GENERIC_MAIL = 'If this account is eligible, a message will be sent.';

export function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decode64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const tokenHash = async value => base64url(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
function equal(a, b) {
  if (a.length !== b.length) return false;
  let result = 0; for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}
function secretBytes(env, name, exact = false) {
  try {
    const value = decode64(env[name]);
    if ((exact && value.length !== 32) || (!exact && (value.length < 32 || value.length > 128))) throw new Error();
    return value;
  } catch { throw new HttpError(503, `${name} is not configured securely.`, 'AUTH_UNAVAILABLE'); }
}
function configured(env) { appOrigin(env); database(env); secretBytes(env, 'AUTH_SECRET'); }
async function hmac(env, context, value) {
  const key = await crypto.subtle.importKey('raw', secretBytes(env, 'AUTH_SECRET'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(`${context}\0${value}`));
}
function passwordInput(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new HttpError(400, 'Use a password containing 12 to 128 characters.', 'INVALID_PASSWORD');
  }
  return value;
}
async function derivePassword(password, salt, env) {
  const peppered = await hmac(env, 'password-v1', password);
  const key = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256',
    salt, iterations: PASSWORD_ITERATIONS }, key, 256));
}
export async function hashPassword(password, env) {
  passwordInput(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256-pepper-v1$${PASSWORD_ITERATIONS}$${base64url(salt)}$${base64url(await derivePassword(password, salt, env))}`;
}
export async function verifyPassword(password, encoded, env) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const pieces = typeof encoded === 'string' ? encoded.split('$') : [];
  let salt, expected;
  try {
    if (pieces.length !== 4 || pieces[0] !== 'pbkdf2-sha256-pepper-v1' || Number(pieces[1]) !== PASSWORD_ITERATIONS) throw new Error();
    salt = decode64(pieces[2]); expected = decode64(pieces[3]);
    if (salt.length !== 16 || expected.length !== 32) throw new Error();
  } catch {
    // Match the expensive branch for unknown accounts and malformed stored credentials.
    await derivePassword(password, new Uint8Array(16), env); return false;
  }
  return equal(await derivePassword(password, salt, env), expected);
}

async function encrypt(env, value, context) {
  const key = await crypto.subtle.importKey('raw', secretBytes(env, 'ENCRYPTION_KEY', true), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, key, encoder.encode(value));
  return `${base64url(iv)}.${base64url(ciphertext)}`;
}
async function decrypt(env, value, context) {
  const key = await crypto.subtle.importKey('raw', secretBytes(env, 'ENCRYPTION_KEY', true), 'AES-GCM', false, ['decrypt']);
  try {
    const [iv, ciphertext, extra] = value.split('.');
    if (extra || !iv || !ciphertext) throw new Error();
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(iv),
      additionalData: encoder.encode(context) }, key, decode64(ciphertext)));
  } catch { throw new HttpError(503, 'Stored authentication material could not be read.', 'AUTH_UNAVAILABLE'); }
}
function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.', 'INVALID_EMAIL');
  }
  return email;
}
function normalizeUsername(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_]{2,31}$/.test(username)) {
    throw new HttpError(400, 'Use 3 to 32 letters, numbers or underscores for the username.', 'INVALID_USERNAME');
  }
  return username;
}
function displayName(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new HttpError(400, 'Enter a display name of up to 80 characters.', 'INVALID_DISPLAY_NAME');
  }
  return value.trim();
}
function cookieName(env, kind = 'session') {
  const { local } = appOrigin(env);
  return local ? `crateship_${kind}_local` : `__Host-crateship_${kind}`;
}
function cookie(env, value, seconds = SESSION_SECONDS, kind = 'session') {
  const { local } = appOrigin(env);
  return `${cookieName(env, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${local ? '' : '; Secure'}`;
}
function readCookie(request, env, kind = 'session') {
  const name = cookieName(env, kind);
  const matches = (request.headers.get('cookie') || '').split(';').map(v => v.trim())
    .filter(v => v.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
function responseWithCookie(env, data, token, seconds, status = 200) {
  const response = json(data, status); response.headers.append('set-cookie', cookie(env, token, seconds)); return response;
}

export async function rateLimit(request, env, scope, subject = '', limit = 10, period = 900) {
  const stamp = now(); const window = Math.floor(stamp / period) * period;
  // CF-Connecting-IP is set by Cloudflare in deployed Workers. Local bypass is explicit.
  const ip = request.headers.get('cf-connecting-ip') || (appOrigin(env).local ? 'local' : 'unknown');
  const key = base64url(await hmac(env, 'rate-limit', `${scope}|${subject || ip}`));
  const row = await database(env).prepare(`INSERT INTO platform_rate_limits (key, window_start, attempts, expires_at)
    VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET
    attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END,
    window_start = excluded.window_start, expires_at = excluded.expires_at RETURNING attempts`)
    .bind(key, window, window + period * 2).first();
  if (!row || row.attempts > limit) throw new HttpError(429, 'Too many attempts. Try again later.', 'RATE_LIMITED');
}
async function ipHash(request, env) {
  return base64url(await hmac(env, 'session-ip', request.headers.get('cf-connecting-ip') || 'unknown'));
}
async function rolesFor(db, userId) {
  const result = await db.prepare('SELECT role FROM platform_user_roles WHERE user_id = ?').bind(userId).all();
  const roles = result.results.map(row => row.role);
  if (!roles.length || roles.some(role => !ROLES.includes(role))) {
    throw new HttpError(403, 'This account has no permitted platform role.', 'ROLE_DENIED');
  }
  return roles;
}
function normalized(row, roles) {
  return { id: row.user_id || row.id, email: row.email, username: row.username,
    displayName: row.display_name, roles, emailVerified: row.email_verified === 1,
    createdAt: row.account_created_at ?? row.created_at,
    sessionId: row.session_id || row.id, authTime: row.auth_time, mfaTime: row.mfa_time ?? null };
}
export async function requireUser(request, env) {
  configured(env);
  if (new URL(request.url).origin !== appOrigin(env).origin) throw new HttpError(403, 'Unexpected request origin.', 'ORIGIN_DENIED');
  const token = readCookie(request, env);
  if (!token) throw new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED');
  const db = database(env);
  const row = await db.prepare(`SELECT s.id AS session_id, s.user_id, s.auth_time, s.mfa_time,
    s.created_at AS session_created_at, s.last_seen_at, u.email, u.username, u.display_name, u.email_verified,
    u.created_at AS account_created_at
    FROM platform_sessions s JOIN platform_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`)
    .bind(await tokenHash(token), now()).first();
  if (!row) throw new HttpError(401, 'Your session has expired. Sign in again.', 'AUTH_REQUIRED');
  const roles = await rolesFor(db, row.user_id);
  if (roles.includes('OWNER') && (now() - row.session_created_at > OWNER_SESSION_SECONDS || now() - row.last_seen_at > 1800)) {
    await db.prepare('UPDATE platform_sessions SET revoked_at = ? WHERE id = ?').bind(now(), row.session_id).run();
    throw new HttpError(401, 'Your owner session has expired. Sign in again.', 'AUTH_REQUIRED');
  }
  if (now() - row.last_seen_at >= 60) {
    await db.prepare('UPDATE platform_sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL').bind(now(), row.session_id).run();
  }
  return normalized(row, roles);
}
export async function requireRole(request, env, permitted, { mfa = false, recent = false } = {}) {
  if (!Array.isArray(permitted) || !permitted.length || permitted.some(role => !ROLES.includes(role))) {
    throw new HttpError(403, 'This operation has no permitted role.', 'ROLE_DENIED');
  }
  const user = await requireUser(request, env);
  if (!user.emailVerified) throw new HttpError(403, 'Verify your email before continuing.', 'EMAIL_VERIFICATION_REQUIRED');
  if (!user.roles.some(role => permitted.includes(role))) throw new HttpError(403, 'You do not have permission.', 'ROLE_DENIED');
  if ((mfa || user.roles.includes('OWNER')) && !user.mfaTime) {
    throw new HttpError(403, 'Multi-factor authentication is required.', 'MFA_REQUIRED');
  }
  if (recent && (now() - user.authTime > RECENT_SECONDS ||
      ((mfa || user.roles.includes('OWNER')) && now() - user.mfaTime > RECENT_SECONDS))) {
    throw new HttpError(403, 'Please authenticate again before this change.', 'REAUTH_REQUIRED');
  }
  return user;
}

function mailConfigured(env) {
  return env.MAIL_PROVIDER === 'resend' && typeof env.MAIL_API_KEY === 'string' && env.MAIL_API_KEY.length >= 16 &&
    typeof env.MAIL_FROM === 'string' && env.MAIL_FROM.length <= 200 && /^[^\r\n]+@[^\r\n]+$/.test(env.MAIL_FROM);
}
function requireMail(env) {
  if (!mailConfigured(env)) throw new HttpError(503, 'Email delivery has not been configured.', 'EMAIL_UNAVAILABLE');
}
function googleConfigured(env) {
  try { secretBytes(env, 'ENCRYPTION_KEY', true); } catch { return false; }
  return typeof env.GOOGLE_CLIENT_ID === 'string' && env.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com') &&
    typeof env.GOOGLE_CLIENT_SECRET === 'string' && env.GOOGLE_CLIENT_SECRET.length >= 16;
}
async function canRegister(env) {
  if (!mailConfigured(env)) return false;
  if (!appOrigin(env).local && String(env.AUTH_PASSWORD_POLICY_APPROVED) !== 'true') return false;
  const flag = await database(env).prepare('SELECT enabled FROM platform_feature_flags WHERE key = ?')
    .bind('PUBLIC_REGISTRATION_ENABLED').first();
  return flag?.enabled === 1;
}
async function capabilities(env) {
  const firebase = firebaseClientConfig(env);
  return { registration: await canRegister(env) || await canRegisterFirebase(env), password: true,
    email: mailConfigured(env) || Boolean(firebase), google: googleConfigured(env) || Boolean(firebase), firebase };
}
async function sendMail(env, user, purpose, token) {
  requireMail(env);
  const verifying = purpose === 'verify_email';
  const link = `${appOrigin(env).origin}/${verifying ? 'verify-email' : 'reset-password'}#token=${token}`;
  const subject = verifying ? 'Verify your Crate Ship Games email' : 'Reset your Crate Ship Games password';
  const response = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { authorization: `Bearer ${env.MAIL_API_KEY}`, 'content-type': 'application/json',
      'idempotency-key': `auth/${await tokenHash(token)}` },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [user.email], subject,
      text: `${subject}\n\n${link}\n\nThis link expires in ${verifying ? '24 hours' : '30 minutes'}. If you did not request this, ignore this message.` }),
    signal: AbortSignal.timeout(10000), redirect: 'manual' });
  if (!response.ok) throw new HttpError(503, 'Email could not be delivered. Try again later.', 'EMAIL_DELIVERY_FAILED');
  const receipt = await response.json().catch(() => null);
  if (!receipt?.id) throw new HttpError(503, 'Email delivery was not confirmed.', 'EMAIL_DELIVERY_FAILED');
}
async function createToken(env, userId, purpose, seconds, verifiedPasswordHash = null) {
  const raw = randomToken(); const stamp = now();
  const result = await database(env).prepare(`INSERT INTO platform_auth_tokens
    (id, token_hash, user_id, purpose, expires_at, created_at, auth_version)
    SELECT ?, ?, id, ?, ?, ?, auth_version FROM platform_users WHERE id = ? AND status = 'active'
    AND (? IS NULL OR password_hash = ?) RETURNING id`)
    .bind(id(), await tokenHash(raw), purpose, stamp + seconds, stamp, userId, verifiedPasswordHash, verifiedPasswordHash).first();
  if (!result) throw new HttpError(401, 'Authentication changed. Start again.', 'AUTH_REQUIRED');
  return raw;
}
async function deliverToken(env, user, purpose) {
  const token = await createToken(env, user.id, purpose, purpose === 'verify_email' ? 86400 : 1800);
  try { await sendMail(env, user, purpose, token); }
  catch (error) {
    await database(env).prepare('DELETE FROM platform_auth_tokens WHERE token_hash = ?').bind(await tokenHash(token)).run();
    await audit(env, { actor: user.id, action: 'auth.email.delivery_failed', target: user.id, result: 'failed', purpose });
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'Email could not be delivered. Try again later.', 'EMAIL_DELIVERY_FAILED');
  }
}
function suppliedToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new HttpError(400, 'This link is invalid or expired.', 'INVALID_TOKEN');
  }
  return value;
}

async function createSession(request, env, userId, mfaTime = null, verifiedPasswordHash = null, expectedAuthVersion = null) {
  const db = database(env); const roles = await rolesFor(db, userId);
  const raw = randomToken(); const sessionId = id(); const stamp = now();
  const duration = roles.includes('OWNER') ? OWNER_SESSION_SECONDS : SESSION_SECONDS;
  // The INSERT checks active status in the same statement to prevent deleted/suspended-account races.
  const result = await db.prepare(`INSERT INTO platform_sessions
    (id, token_hash, user_id, created_at, expires_at, last_seen_at, auth_time, mfa_time, user_agent, ip_hash)
    SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, ? FROM platform_users WHERE id = ? AND status = 'active'
    AND (? IS NULL OR password_hash = ?)
    AND (? IS NULL OR auth_version = ?)
    AND (? IS NOT NULL OR NOT EXISTS (SELECT 1 FROM platform_mfa WHERE user_id = platform_users.id AND enabled = 1))
    RETURNING id`)
    .bind(sessionId, await tokenHash(raw), stamp, stamp + duration, stamp, stamp, mfaTime,
      (request.headers.get('user-agent') || 'Unknown browser').slice(0, 256), await ipHash(request, env), userId,
      verifiedPasswordHash, verifiedPasswordHash, expectedAuthVersion, expectedAuthVersion, mfaTime).first();
  if (!result) throw new HttpError(401, 'This account cannot sign in.', 'AUTH_REQUIRED');
  await db.prepare('UPDATE platform_users SET last_login_at = ? WHERE id = ?').bind(stamp, userId).run();
  const user = await db.prepare('SELECT * FROM platform_users WHERE id = ?').bind(userId).first();
  await audit(env, { actor: userId, action: 'auth.login', target: sessionId, mfa: Boolean(mfaTime) });
  return responseWithCookie(env, { user: normalized({ ...user, user_id: userId, session_id: sessionId,
    auth_time: stamp, mfa_time: mfaTime }, roles) }, raw, duration);
}

async function register(request, env, body) {
  if (!await canRegister(env)) throw new HttpError(503, 'Registration is not yet enabled.', 'REGISTRATION_DISABLED');
  if ('role' in body || 'roles' in body || 'emailVerified' in body || 'status' in body) {
    throw new HttpError(400, 'Account privileges cannot be supplied during registration.', 'INVALID_REGISTRATION');
  }
  const email = normalizeEmail(body.email); const username = normalizeUsername(body.username);
  const name = displayName(body.displayName, username); passwordInput(body.password);
  await rateLimit(request, env, 'register-ip', '', 5, 3600);
  await rateLimit(request, env, 'register-email', email, 3, 3600);
  const password = await hashPassword(body.password, env); const userId = id(); const stamp = now();
  try {
    await database(env).batch([
      database(env).prepare(`INSERT INTO platform_users (id, email, username, display_name, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(userId, email, username, name, password, stamp, stamp),
      database(env).prepare('INSERT INTO platform_user_roles (user_id, role, created_at) VALUES (?, ?, ?)').bind(userId, 'PLAYER', stamp),
    ]);
  } catch (error) {
    if (/unique constraint|constraint failed/i.test(String(error.message))) {
      throw new HttpError(409, 'This email or username is unavailable. Sign in or reset your password if you already have an account.', 'ACCOUNT_UNAVAILABLE');
    }
    throw error;
  }
  await audit(env, { actor: userId, action: 'auth.register', target: userId });
  await deliverToken(env, { id: userId, email }, 'verify_email');
  return json({ requiresEmailVerification: true }, 201);
}
async function login(request, env, body) {
  const email = normalizeEmail(body.email);
  if (typeof body.password !== 'string' || body.password.length > 128) throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  await rateLimit(request, env, 'login-ip', '', 30);
  await rateLimit(request, env, 'login-account', email, 10);
  const user = await database(env).prepare('SELECT * FROM platform_users WHERE email = ?').bind(email).first();
  const valid = await verifyPassword(body.password, user?.password_hash, env);
  if (!valid || user?.status !== 'active') {
    await audit(env, { actor: user?.id, action: 'auth.login', target: user?.id, result: 'denied' });
    throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }
  const mfa = await database(env).prepare('SELECT enabled FROM platform_mfa WHERE user_id = ?').bind(user.id).first();
  if (mfa?.enabled === 1) {
    const challengeId = await createToken(env, user.id, 'mfa_login', 300, user.password_hash);
    return json({ mfaRequired: true, challengeId }, 202);
  }
  return createSession(request, env, user.id, null, user.password_hash);
}

async function requestEmail(request, env, body, purpose) {
  requireMail(env); const email = normalizeEmail(body.email);
  await rateLimit(request, env, `mail-${purpose}-ip`, '', 10, 3600);
  await rateLimit(request, env, `mail-${purpose}-account`, email, 3, 3600);
  const user = await database(env).prepare('SELECT id, email, email_verified, password_hash FROM platform_users WHERE email = ? AND status = ?')
    .bind(email, 'active').first();
  if (user && (purpose !== 'verify_email' || user.email_verified === 0) && (purpose !== 'reset_password' || user.password_hash)) {
    await deliverToken(env, user, purpose);
  }
  return json({ message: GENERIC_MAIL });
}
async function confirmEmail(request, env, body) {
  await rateLimit(request, env, 'verify-link', '', 20);
  const hash = await tokenHash(suppliedToken(body.token)); const stamp = now(); const db = database(env);
  // UPDATE+token consumption execute in one D1 transaction; timestamp is unique to this token's consumption.
  const result = await db.batch([
    db.prepare(`UPDATE platform_users SET email_verified = 1, updated_at = ? WHERE status = 'active' AND id IN
      (SELECT user_id FROM platform_auth_tokens WHERE token_hash = ? AND purpose = 'verify_email'
      AND consumed_at IS NULL AND expires_at > ?) RETURNING id`).bind(stamp, hash, stamp),
    db.prepare(`UPDATE platform_auth_tokens SET consumed_at = ? WHERE token_hash = ? AND purpose = 'verify_email'
      AND consumed_at IS NULL AND expires_at > ?`).bind(stamp, hash, stamp),
  ]);
  if (!result[0].results?.[0]) throw new HttpError(400, 'This link is invalid or expired.', 'INVALID_TOKEN');
  await audit(env, { actor: result[0].results[0].id, action: 'auth.email.verified', target: result[0].results[0].id });
  return json({ verified: true });
}
async function resetPassword(request, env, body) {
  await rateLimit(request, env, 'reset-confirm', '', 10);
  const hash = await tokenHash(suppliedToken(body.token)); passwordInput(body.password);
  const password = await hashPassword(body.password, env); const stamp = now(); const db = database(env);
  const subquery = `(SELECT user_id FROM platform_auth_tokens WHERE token_hash = ? AND purpose = 'reset_password' AND consumed_at IS NULL AND expires_at > ?)`;
  const result = await db.batch([
    db.prepare(`UPDATE platform_users SET password_hash = ?, auth_version = auth_version + 1, updated_at = ? WHERE status = 'active' AND id IN ${subquery} RETURNING id`).bind(password, stamp, hash, stamp),
    db.prepare(`UPDATE platform_sessions SET revoked_at = ? WHERE user_id IN ${subquery}`).bind(stamp, hash, stamp),
    db.prepare(`UPDATE platform_auth_tokens SET consumed_at = ? WHERE user_id IN ${subquery} AND consumed_at IS NULL`).bind(stamp, hash, stamp),
  ]);
  if (!result[0].results?.[0]) throw new HttpError(400, 'This link is invalid or expired.', 'INVALID_TOKEN');
  await audit(env, { actor: result[0].results[0].id, action: 'auth.password.reset', target: result[0].results[0].id });
  return responseWithCookie(env, { reset: true }, '', 0);
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function toBase32(bytes) {
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}
function fromBase32(text) {
  if (!/^[A-Z2-7]{16,64}$/.test(text)) throw new Error('Invalid TOTP secret');
  const output = []; let bits = 0, value = 0;
  for (const char of text) {
    value = (value << 5) | BASE32.indexOf(char); bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(output);
}
/** RFC 6238 HMAC-SHA1, 30-second steps. SHA1 here is the standard TOTP MAC, not password hashing. */
export async function totpCode(secret, counter, digits = 6) {
  const key = await crypto.subtle.importKey('raw', fromBase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const input = new Uint8Array(8); new DataView(input.buffer).setBigUint64(0, BigInt(counter));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
  const offset = mac[mac.length - 1] & 15;
  const number = (((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) | mac[offset + 3]) >>> 0;
  return String(number % (10 ** digits)).padStart(digits, '0');
}
async function matchingCounter(env, row, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const secret = await decrypt(env, row.secret_ciphertext, `mfa:${row.user_id}`);
  const current = Math.floor(now() / 30);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter > row.last_counter && equal(encoder.encode(await totpCode(secret, counter)), encoder.encode(code))) return counter;
  }
  return null;
}
async function requireRecent(user, env, withMfa = true) {
  if (now() - user.authTime > RECENT_SECONDS) throw new HttpError(403, 'Authenticate again before continuing.', 'REAUTH_REQUIRED');
  const mfa = await database(env).prepare('SELECT enabled FROM platform_mfa WHERE user_id = ?').bind(user.id).first();
  if (withMfa && (mfa?.enabled === 1 || user.roles.includes('OWNER')) &&
      (!user.mfaTime || now() - user.mfaTime > RECENT_SECONDS)) {
    throw new HttpError(403, 'Recent multi-factor authentication is required.', 'MFA_REQUIRED');
  }
}
async function enrollMfa(request, env) {
  const user = await requireUser(request, env);
  if (!user.emailVerified) throw new HttpError(403, 'Verify your email first.', 'EMAIL_VERIFICATION_REQUIRED');
  await requireRecent(user, env, false);
  await rateLimit(request, env, 'mfa-enroll-user', user.id, 3, 3600);
  const secret = toBase32(crypto.getRandomValues(new Uint8Array(20)));
  const ciphertext = await encrypt(env, secret, `mfa:${user.id}`); const stamp = now();
  const result = await database(env).prepare(`INSERT INTO platform_mfa
    (user_id, secret_ciphertext, enabled, pending_session_id, pending_expires_at, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
    secret_ciphertext = excluded.secret_ciphertext, pending_session_id = excluded.pending_session_id,
    pending_expires_at = excluded.pending_expires_at, updated_at = excluded.updated_at
    WHERE platform_mfa.enabled = 0 RETURNING user_id`)
    .bind(user.id, ciphertext, user.sessionId, stamp + 600, stamp, stamp).first();
  if (!result) throw new HttpError(409, 'Multi-factor authentication is already enabled.', 'MFA_ALREADY_ENABLED');
  await audit(env, { actor: user.id, action: 'auth.mfa.enrollment_started', target: user.id });
  return json({ secret, otpauthUri: `otpauth://totp/${encodeURIComponent(`Crate Ship Games:${user.email}`)}?secret=${secret}&issuer=Crate%20Ship%20Games&algorithm=SHA1&digits=6&period=30` });
}
async function confirmMfa(request, env, body) {
  const user = await requireUser(request, env); await requireRecent(user, env, false);
  await rateLimit(request, env, 'mfa-confirm-user', user.id, 5, 300);
  const db = database(env); const stamp = now();
  const row = await db.prepare(`SELECT * FROM platform_mfa WHERE user_id = ? AND enabled = 0
    AND pending_session_id = ? AND pending_expires_at > ?`).bind(user.id, user.sessionId, stamp).first();
  const counter = row ? await matchingCounter(env, row, body.code) : null;
  if (counter === null) throw new HttpError(400, 'The authenticator code is invalid or expired.', 'INVALID_MFA');
  const result = await db.batch([
    db.prepare(`UPDATE platform_mfa SET enabled = 1, last_counter = ?, pending_session_id = NULL,
      pending_expires_at = NULL, updated_at = ? WHERE user_id = ? AND enabled = 0
      AND pending_session_id = ? AND pending_expires_at > ? RETURNING user_id`)
      .bind(counter, stamp, user.id, user.sessionId, stamp),
    // Enrollment invalidates every previous session. Fresh login must prove password + TOTP.
    db.prepare('UPDATE platform_sessions SET revoked_at = ? WHERE user_id = ?').bind(stamp, user.id),
  ]);
  if (!result[0].results?.[0]) throw new HttpError(409, 'Enrollment has already been used or expired.', 'INVALID_MFA');
  await audit(env, { actor: user.id, action: 'auth.mfa.enabled', target: user.id });
  return responseWithCookie(env, { enabled: true, signInRequired: true }, '', 0);
}
async function verifyMfaLogin(request, env, body) {
  const hash = await tokenHash(suppliedToken(body.challengeId)); const stamp = now(); const db = database(env);
  await rateLimit(request, env, 'mfa-login-ip', '', 20, 300);
  await rateLimit(request, env, 'mfa-login-challenge', hash, 5, 300);
  const challenge = await db.prepare(`SELECT * FROM platform_auth_tokens WHERE token_hash = ?
    AND purpose = 'mfa_login' AND consumed_at IS NULL AND expires_at > ?`).bind(hash, stamp).first();
  const row = challenge ? await db.prepare('SELECT * FROM platform_mfa WHERE user_id = ? AND enabled = 1')
    .bind(challenge.user_id).first() : null;
  const counter = row ? await matchingCounter(env, row, body.code) : null;
  if (counter === null) throw new HttpError(401, 'The authenticator code or sign-in challenge is invalid.', 'INVALID_MFA');
  const result = await db.batch([
    db.prepare(`UPDATE platform_mfa SET last_counter = ?, updated_at = ? WHERE user_id = ? AND enabled = 1 AND last_counter < ?
      AND EXISTS (SELECT 1 FROM platform_auth_tokens WHERE token_hash = ? AND purpose = 'mfa_login'
      AND consumed_at IS NULL AND expires_at > ?) RETURNING user_id`)
      .bind(counter, stamp, challenge.user_id, counter, hash, stamp),
    db.prepare(`UPDATE platform_auth_tokens SET consumed_at = ? WHERE token_hash = ? AND purpose = 'mfa_login'
      AND consumed_at IS NULL AND expires_at > ?`).bind(stamp, hash, stamp),
  ]);
  if (!result[0].results?.[0]) throw new HttpError(401, 'This authenticator code has already been used.', 'INVALID_MFA');
  return createSession(request, env, challenge.user_id, stamp, null, challenge.auth_version);
}
async function consumeMfaCode(request, env, user, code) {
  await rateLimit(request, env, 'mfa-step-up', user.id, 5, 300);
  const db = database(env);
  const row = await db.prepare('SELECT * FROM platform_mfa WHERE user_id = ? AND enabled = 1').bind(user.id).first();
  const counter = row ? await matchingCounter(env, row, code) : null;
  if (counter === null) throw new HttpError(403, 'A fresh authenticator code is required.', 'INVALID_MFA');
  const result = await db.prepare(`UPDATE platform_mfa SET last_counter = ?, updated_at = ? WHERE user_id = ?
    AND enabled = 1 AND last_counter < ? RETURNING user_id`).bind(counter, now(), user.id, counter).first();
  if (!result) throw new HttpError(403, 'This authenticator code has already been used.', 'INVALID_MFA');
}
async function challengeMfa(request, env, body) {
  const user = await requireUser(request, env);
  await consumeMfaCode(request, env, user, body.code);
  await database(env).prepare('UPDATE platform_sessions SET mfa_time = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(now(), user.sessionId).run();
  await audit(env, { actor: user.id, action: 'auth.mfa.step_up', target: user.sessionId });
  return json({ verified: true });
}
async function reauthenticate(request, env, body) {
  const user = await requireUser(request, env);
  await rateLimit(request, env, 'reauth-user', user.id, 5, 900);
  const db = database(env);
  const account = await db.prepare('SELECT password_hash FROM platform_users WHERE id = ?').bind(user.id).first();
  if (body.idToken !== undefined) {
    await firebaseReauthenticate(request, env, user, body);
    const mfa = await db.prepare('SELECT enabled FROM platform_mfa WHERE user_id = ?').bind(user.id).first();
    if (user.roles.includes('OWNER') && mfa?.enabled !== 1) throw new HttpError(403, 'Set up multi-factor authentication first.', 'MFA_REQUIRED');
    let mfaTime = null;
    if (mfa?.enabled === 1) { await consumeMfaCode(request, env, user, body.code); mfaTime = now(); }
    await db.prepare('UPDATE platform_sessions SET revoked_at = ? WHERE id = ?').bind(now(), user.sessionId).run();
    await audit(env, { actor: user.id, action: 'auth.reauthenticate', target: user.sessionId, method: 'firebase' });
    return createSession(request, env, user.id, mfaTime);
  }
  if (!account?.password_hash) {
    throw new HttpError(503, 'Sensitive changes for Google-only accounts require a configured provider reauthentication flow.', 'REAUTH_UNAVAILABLE');
  }
  if (!await verifyPassword(body.password, account.password_hash, env)) throw new HttpError(401, 'Password is incorrect.', 'INVALID_CREDENTIALS');
  const mfa = await db.prepare('SELECT enabled FROM platform_mfa WHERE user_id = ?').bind(user.id).first();
  if (user.roles.includes('OWNER') && mfa?.enabled !== 1) throw new HttpError(403, 'Set up multi-factor authentication first.', 'MFA_REQUIRED');
  let mfaTime = null;
  if (mfa?.enabled === 1) { await consumeMfaCode(request, env, user, body.code); mfaTime = now(); }
  await db.prepare('UPDATE platform_sessions SET revoked_at = ? WHERE id = ?').bind(now(), user.sessionId).run();
  await audit(env, { actor: user.id, action: 'auth.reauthenticate', target: user.sessionId });
  return createSession(request, env, user.id, mfaTime, account.password_hash);
}
async function logout(request, env, all = false) {
  const user = await requireUser(request, env); const stamp = now();
  await database(env).prepare(all ? 'UPDATE platform_sessions SET revoked_at = ? WHERE user_id = ?' :
    'UPDATE platform_sessions SET revoked_at = ? WHERE id = ?').bind(stamp, all ? user.id : user.sessionId).run();
  await audit(env, { actor: user.id, action: all ? 'auth.logout_all' : 'auth.logout', target: user.sessionId });
  return responseWithCookie(env, { signedOut: true }, '', 0);
}
async function sessions(request, env) {
  const user = await requireUser(request, env);
  const result = await database(env).prepare(`SELECT id, created_at, expires_at, last_seen_at, user_agent
    FROM platform_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
    ORDER BY last_seen_at DESC LIMIT 100`).bind(user.id, now()).all();
  const mfa = await database(env).prepare('SELECT enabled FROM platform_mfa WHERE user_id = ?').bind(user.id).first();
  return json({ mfaEnabled: mfa?.enabled === 1, sessions: result.results.map(row => ({
    id: row.id, createdAt: row.created_at, expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at, userAgent: row.user_agent, current: row.id === user.sessionId,
  })) });
}
async function revokeSession(request, env, sessionId) {
  const user = await requireUser(request, env);
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) throw new HttpError(400, 'Invalid session.', 'INVALID_SESSION');
  await database(env).prepare('UPDATE platform_sessions SET revoked_at = ? WHERE id = ? AND user_id = ?')
    .bind(now(), sessionId, user.id).run();
  await audit(env, { actor: user.id, action: 'auth.session.revoked', target: sessionId });
  if (sessionId === user.sessionId) return responseWithCookie(env, { revoked: true }, '', 0);
  return json({ revoked: true });
}
async function deleteAccount(request, env, body, accountErasureStatements) {
  const user = await requireUser(request, env); await requireRecent(user, env);
  if (body.confirmation !== 'DELETE') throw new HttpError(400, 'Confirm account deletion with DELETE.', 'CONFIRMATION_REQUIRED');
  if (user.roles.some(role => ['OWNER', 'FINANCE_ADMIN', 'PLATFORM_ADMIN'].includes(role))) {
    throw new HttpError(409, 'Transfer privileged responsibilities before deleting this account.', 'PRIVILEGED_ACCOUNT');
  }
  const db = database(env); const stamp = now();
  const firebase = await db.prepare('SELECT uid FROM platform_firebase_accounts WHERE user_id = ?').bind(user.id).first();
  if (firebase) {
    // Remove the Firebase sign-in first so a deleted account cannot sign back in to an empty shell.
    const claims = await firebaseReauthenticate(request, env, user, body);
    if (claims.sub !== firebase.uid) throw invalidFirebase();
    await deleteFirebaseUser(env, body.idToken);
  }
  // Only the trusted application router supplies this function. Nothing from request/config JSON is executed.
  const privateDataErasure = typeof accountErasureStatements === 'function' ? await accountErasureStatements(user.id, db) : [];
  if (!Array.isArray(privateDataErasure)) throw new HttpError(503, 'Account erasure is not configured correctly.', 'ERASURE_UNAVAILABLE');
  await db.batch([
    ...privateDataErasure,
    db.prepare(`UPDATE platform_users SET status = 'deleted', email = ?, username = ?, display_name = 'Deleted account',
      password_hash = NULL, email_verified = 0, updated_at = ?, deleted_at = ? WHERE id = ? AND status = 'active'`)
      .bind(`deleted-${user.id}@deleted.invalid`, `deleted_${user.id}`, stamp, stamp, user.id),
    db.prepare('UPDATE platform_sessions SET revoked_at = ? WHERE user_id = ?').bind(stamp, user.id),
    db.prepare('DELETE FROM platform_user_roles WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM platform_auth_tokens WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM platform_mfa WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM platform_oauth_accounts WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM platform_firebase_accounts WHERE user_id = ?').bind(user.id),
  ]);
  await audit(env, { actor: user.id, action: 'auth.account.deleted', target: user.id });
  // Downstream business records retain a pseudonymous immutable ID for ownership/accounting.
  // Product-wide private-file retention/export/deletion policy is a separate readiness gate.
  return responseWithCookie(env, { deleted: true,
    retention: 'Your sign-in identity is anonymized and access revoked. Private model access is removed immediately and physical file deletion is queued. Required financial, ownership and audit records retain a pseudonymous account reference.',
    privateFileDeletionQueued:typeof accountErasureStatements==='function',
    privateDataErased: typeof accountErasureStatements === 'function' }, '', 0);
}

async function googleStart(request, env) {
  if (!googleConfigured(env)) throw new HttpError(503, 'Google sign-in is not configured.', 'GOOGLE_UNAVAILABLE');
  await rateLimit(request, env, 'oauth-start', '', 20, 900);
  const state = randomToken(); const verifier = randomToken(); const nonce = randomToken(); const stamp = now();
  await database(env).prepare(`INSERT INTO platform_oauth_states (state_hash, payload_ciphertext, expires_at, created_at)
    VALUES (?, ?, ?, ?)`).bind(await tokenHash(state), await encrypt(env, JSON.stringify({ verifier, nonce }),
    `oauth:${await tokenHash(state)}`), stamp + 300, stamp).run();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, response_type: 'code',
    redirect_uri: `${appOrigin(env).origin}/api/platform/auth/google/callback`, scope: 'openid email profile',
    state, nonce, code_challenge: await tokenHash(verifier), code_challenge_method: 'S256',
    access_type: 'online', prompt: 'select_account' }).toString();
  return new Response(null, { status: 302, headers: { location: url.toString(),
    'set-cookie': cookie(env, state, 300, 'oauth'), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
export async function verifyGoogleIdToken(jwt, env, nonce) {
  if (typeof jwt !== 'string' || jwt.length > 16384) throw new HttpError(401, 'Google identity could not be verified.', 'INVALID_GOOGLE_IDENTITY');
  const pieces = jwt.split('.'); let header, claims;
  try {
    if (pieces.length !== 3) throw new Error();
    header = JSON.parse(new TextDecoder().decode(decode64(pieces[0])));
    claims = JSON.parse(new TextDecoder().decode(decode64(pieces[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200 || header.crit) throw new Error();
  } catch { throw new HttpError(401, 'Google identity could not be verified.', 'INVALID_GOOGLE_IDENTITY'); }
  let keys;
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
      signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (!response.ok) throw new Error();
    keys = (await response.json()).keys;
  } catch { throw new HttpError(503, 'Google identity verification is temporarily unavailable.', 'GOOGLE_UNAVAILABLE'); }
  const jwk = Array.isArray(keys) ? keys.slice(0, 20).find(key => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256') : null;
  let signatureValid = false;
  if (jwk) {
    try {
      const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      signatureValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64(pieces[2]), encoder.encode(`${pieces[0]}.${pieces[1]}`));
    } catch { signatureValid = false; }
  }
  const stamp = now();
  if (!signatureValid || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
      claims.aud !== env.GOOGLE_CLIENT_ID || (claims.azp && claims.azp !== env.GOOGLE_CLIENT_ID) ||
      !Number.isInteger(claims.exp) || claims.exp <= stamp || !Number.isInteger(claims.iat) ||
      claims.iat > stamp + 60 || claims.iat < stamp - 600 || claims.exp <= claims.iat ||
      typeof claims.nonce !== 'string' || !equal(encoder.encode(claims.nonce), encoder.encode(nonce)) ||
      typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 255 ||
      claims.email_verified !== true) {
    throw new HttpError(401, 'Google identity could not be verified.', 'INVALID_GOOGLE_IDENTITY');
  }
  claims.email = normalizeEmail(claims.email); return claims;
}
// Firebase Authentication: the browser signs in with Firebase, then exchanges a fresh ID token for a platform session.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
const FIREBASE_KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
function firebaseConfigured(env) {
  return typeof env.FIREBASE_PROJECT_ID === 'string' && /^[a-z0-9-]{4,40}$/.test(env.FIREBASE_PROJECT_ID) &&
    typeof env.FIREBASE_API_KEY === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(env.FIREBASE_API_KEY) &&
    typeof env.FIREBASE_AUTH_DOMAIN === 'string' && /^[a-z0-9.-]{4,253}$/.test(env.FIREBASE_AUTH_DOMAIN);
}
export function firebaseClientConfig(env) {
  if (!firebaseConfigured(env)) return null;
  return { apiKey: env.FIREBASE_API_KEY, authDomain: env.FIREBASE_AUTH_DOMAIN, projectId: env.FIREBASE_PROJECT_ID,
    ...(typeof env.FIREBASE_APP_ID === 'string' && env.FIREBASE_APP_ID ? { appId: env.FIREBASE_APP_ID } : {}) };
}
function requireFirebase(env) {
  if (!firebaseConfigured(env)) throw new HttpError(503, 'Firebase sign-in is not configured.', 'FIREBASE_UNAVAILABLE');
}
const invalidFirebase = () => new HttpError(401, 'Your sign-in could not be verified. Sign in again.', 'INVALID_FIREBASE_IDENTITY');
export async function verifyFirebaseIdToken(jwt, env, { maxAuthAge = null } = {}) {
  requireFirebase(env);
  if (typeof jwt !== 'string' || jwt.length > 16384) throw invalidFirebase();
  const pieces = jwt.split('.'); let header, claims;
  try {
    if (pieces.length !== 3) throw new Error();
    header = JSON.parse(new TextDecoder().decode(decode64(pieces[0])));
    claims = JSON.parse(new TextDecoder().decode(decode64(pieces[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200 || header.crit) throw new Error();
  } catch { throw invalidFirebase(); }
  let keys;
  try {
    const response = await fetch(FIREBASE_KEYS_URL, { signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (!response.ok) throw new Error();
    keys = (await response.json()).keys;
  } catch { throw new HttpError(503, 'Sign-in verification is temporarily unavailable.', 'FIREBASE_UNAVAILABLE'); }
  const jwk = Array.isArray(keys) ? keys.slice(0, 20).find(key => key.kid === header.kid && key.kty === 'RSA') : null;
  let signatureValid = false;
  if (jwk) {
    try {
      const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      signatureValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64(pieces[2]), encoder.encode(`${pieces[0]}.${pieces[1]}`));
    } catch { signatureValid = false; }
  }
  const stamp = now(); const project = env.FIREBASE_PROJECT_ID;
  if (!signatureValid || claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}` ||
      !Number.isInteger(claims.exp) || claims.exp <= stamp || !Number.isInteger(claims.iat) || claims.iat > stamp + 60 ||
      !Number.isInteger(claims.auth_time) || claims.auth_time > stamp + 60 ||
      typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 128 || claims.sub !== claims.user_id) {
    throw invalidFirebase();
  }
  if (maxAuthAge !== null && stamp - claims.auth_time > maxAuthAge) {
    throw new HttpError(403, 'Sign in again to confirm it is you.', 'REAUTH_REQUIRED');
  }
  if (claims.email_verified !== true) {
    throw new HttpError(403, 'Verify your email address, then sign in again.', 'EMAIL_VERIFICATION_REQUIRED');
  }
  claims.email = normalizeEmail(claims.email);
  claims.provider = typeof claims.firebase?.sign_in_provider === 'string' ? claims.firebase.sign_in_provider.slice(0, 40) : 'unknown';
  return claims;
}
async function firebaseAccount(db, uid) {
  return db.prepare(`SELECT u.* FROM platform_firebase_accounts f JOIN platform_users u ON u.id = f.user_id
    WHERE f.uid = ?`).bind(uid).first();
}
async function canRegisterFirebase(env) {
  if (!firebaseConfigured(env)) return false;
  const flag = await database(env).prepare('SELECT enabled FROM platform_feature_flags WHERE key = ?')
    .bind('PUBLIC_REGISTRATION_ENABLED').first();
  return flag?.enabled === 1;
}
async function firebaseSignIn(request, env, body) {
  requireFirebase(env);
  await rateLimit(request, env, 'firebase-ip', '', 30);
  const claims = await verifyFirebaseIdToken(body.idToken, env);
  await rateLimit(request, env, 'firebase-account', claims.sub, 10);
  const db = database(env);
  let account = await firebaseAccount(db, claims.sub);
  if (!account) {
    if (!await canRegisterFirebase(env)) throw new HttpError(503, 'New account registration is not yet enabled.', 'REGISTRATION_DISABLED');
    if ('role' in body || 'roles' in body || 'status' in body) {
      throw new HttpError(400, 'Account privileges cannot be supplied during registration.', 'INVALID_REGISTRATION');
    }
    const existing = await db.prepare('SELECT id FROM platform_users WHERE email = ?').bind(claims.email).first();
    if (existing) throw new HttpError(409, 'An account already uses this email. Sign in with its existing method; accounts are not linked automatically.', 'ACCOUNT_LINK_REQUIRED');
    const userId = id(); const stamp = now(); const fallback = `player_${userId.replaceAll('-', '').slice(0, 16)}`;
    let username = fallback;
    if (body.username !== undefined) {
      username = normalizeUsername(body.username);
      if (await db.prepare('SELECT 1 FROM platform_users WHERE username = ?').bind(username).first()) username = fallback;
    }
    const tokenName = typeof claims.name === 'string' ? claims.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80).trim() : '';
    const name = body.displayName !== undefined ? displayName(body.displayName, username) : tokenName || username;
    try {
      await db.batch([
        db.prepare(`INSERT INTO platform_users (id, email, username, display_name, email_verified, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)`).bind(userId, claims.email, username, name, stamp, stamp),
        db.prepare('INSERT INTO platform_user_roles (user_id, role, created_at) VALUES (?, ?, ?)').bind(userId, 'PLAYER', stamp),
        db.prepare('INSERT INTO platform_firebase_accounts (uid, user_id, sign_in_provider, created_at) VALUES (?, ?, ?, ?)')
          .bind(claims.sub, userId, claims.provider, stamp),
      ]);
    } catch (error) {
      if (/constraint/i.test(String(error.message))) throw new HttpError(409, 'This email or username is unavailable. Try signing in again.', 'ACCOUNT_UNAVAILABLE');
      throw error;
    }
    account = await db.prepare('SELECT * FROM platform_users WHERE id = ?').bind(userId).first();
    await audit(env, { actor: userId, action: 'auth.firebase.register', target: userId, provider: claims.provider });
  }
  if (account.status !== 'active') throw new HttpError(403, 'This account is unavailable.', 'ACCOUNT_UNAVAILABLE');
  await db.prepare('UPDATE platform_firebase_accounts SET sign_in_provider = ? WHERE uid = ?').bind(claims.provider, claims.sub).run();
  if (account.email !== claims.email) {
    // The email changed in Firebase and Firebase has verified the new address.
    await db.prepare('UPDATE platform_users SET email = ?, updated_at = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM platform_users WHERE email = ?)')
      .bind(claims.email, now(), account.id, claims.email).run();
  }
  const mfa = await db.prepare('SELECT enabled FROM platform_mfa WHERE user_id = ?').bind(account.id).first();
  if (mfa?.enabled === 1) {
    const challengeId = await createToken(env, account.id, 'mfa_login', 300);
    return json({ mfaRequired: true, challengeId }, 202);
  }
  return createSession(request, env, account.id);
}
async function firebaseReauthenticate(request, env, user, body) {
  const claims = await verifyFirebaseIdToken(body.idToken, env, { maxAuthAge: RECENT_SECONDS });
  const linked = await database(env).prepare('SELECT user_id FROM platform_firebase_accounts WHERE uid = ?').bind(claims.sub).first();
  if (linked?.user_id !== user.id) throw invalidFirebase();
  return claims;
}
async function deleteFirebaseUser(env, idToken) {
  let response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(10000), redirect: 'manual' });
  } catch { response = null; }
  if (!response?.ok) throw new HttpError(503, 'Your sign-in account could not be removed. Try again.', 'FIREBASE_DELETE_FAILED');
}

async function googleCallback(request, env) {
  if (!googleConfigured(env)) throw new HttpError(503, 'Google sign-in is not configured.', 'GOOGLE_UNAVAILABLE');
  await rateLimit(request, env, 'oauth-callback', '', 20, 900);
  const params = new URL(request.url).searchParams;
  const state = params.get('state'); const browserState = readCookie(request, env, 'oauth');
  if (!state || !browserState || state !== browserState || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new HttpError(400, 'Google sign-in state is invalid. Start again.', 'INVALID_OAUTH_STATE');
  }
  const hash = await tokenHash(state); const db = database(env);
  const stored = await db.prepare('DELETE FROM platform_oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING payload_ciphertext')
    .bind(hash, now()).first();
  if (!stored) throw new HttpError(400, 'Google sign-in expired or has already been used.', 'INVALID_OAUTH_STATE');
  if (params.has('error')) throw new HttpError(400, 'Google sign-in was not completed.', 'GOOGLE_CANCELLED');
  const code = params.get('code');
  if (!code || code.length > 4096) throw new HttpError(400, 'Google did not provide a valid authorization code.', 'INVALID_GOOGLE_CODE');
  const { verifier, nonce } = JSON.parse(await decrypt(env, stored.payload_ciphertext, `oauth:${hash}`));
  let tokens;
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        code, code_verifier: verifier, grant_type: 'authorization_code',
        redirect_uri: `${appOrigin(env).origin}/api/platform/auth/google/callback` }),
      signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (!response.ok) throw new Error();
    tokens = await response.json();
  } catch { throw new HttpError(401, 'Google authorization could not be completed. Start again.', 'GOOGLE_EXCHANGE_FAILED'); }
  const claims = await verifyGoogleIdToken(tokens.id_token, env, nonce);
  let account = await db.prepare(`SELECT u.* FROM platform_oauth_accounts a JOIN platform_users u ON u.id = a.user_id
    WHERE a.provider = 'google' AND a.subject = ?`).bind(claims.sub).first();
  if (!account) {
    if (!await canRegister(env)) throw new HttpError(503, 'New account registration is not yet enabled.', 'REGISTRATION_DISABLED');
    const existing = await db.prepare('SELECT id FROM platform_users WHERE email = ?').bind(claims.email).first();
    if (existing) throw new HttpError(409, 'An account already uses this email. Sign in with its existing method; accounts are not linked automatically.', 'ACCOUNT_LINK_REQUIRED');
    const userId = id(); const username = `player_${userId.replaceAll('-', '').slice(0, 16)}`; const stamp = now();
    const name = typeof claims.name === 'string' ? claims.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80).trim() || username : username;
    try {
      await db.batch([
        db.prepare(`INSERT INTO platform_users (id, email, username, display_name, email_verified, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)`).bind(userId, claims.email, username, name, stamp, stamp),
        db.prepare('INSERT INTO platform_user_roles (user_id, role, created_at) VALUES (?, ?, ?)').bind(userId, 'PLAYER', stamp),
        db.prepare('INSERT INTO platform_oauth_accounts (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').bind('google', claims.sub, userId, stamp),
      ]);
    } catch (error) {
      if (/constraint/i.test(String(error.message))) throw new HttpError(409, 'An account already exists. Restart sign-in.', 'ACCOUNT_UNAVAILABLE');
      throw error;
    }
    account = { id: userId, status: 'active' };
    await audit(env, { actor: userId, action: 'auth.google.register', target: userId });
  }
  if (account.status !== 'active') throw new HttpError(403, 'This account is unavailable.', 'ACCOUNT_UNAVAILABLE');
  const mfa = await db.prepare('SELECT enabled FROM platform_mfa WHERE user_id = ?').bind(account.id).first();
  if (mfa?.enabled === 1) {
    const challenge = await createToken(env, account.id, 'mfa_login', 300);
    return new Response(null, { status: 303, headers: { location: `${appOrigin(env).origin}/login#mfaChallenge=${challenge}`,
      'set-cookie': cookie(env, '', 0, 'oauth'), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  }
  const session = await createSession(request, env, account.id);
  session.headers.append('set-cookie', cookie(env, '', 0, 'oauth'));
  session.headers.set('location', `${appOrigin(env).origin}/profile`);
  return new Response(null, { status: 303, headers: session.headers });
}

/** The outer platform router catches HttpError and renders sanitized JSON failures. */
export async function handleAuth(request, env, path, { accountErasureStatements } = {}) {
  if (!path.startsWith('/auth/')) return null;
  configured(env);
  if (new URL(request.url).origin !== appOrigin(env).origin) throw new HttpError(403, 'Unexpected request origin.', 'ORIGIN_DENIED');
  const method = request.method.toUpperCase();
  if (method === 'GET' && path === '/auth/session') {
    let user = null;
    try { user = await requireUser(request, env); }
    catch (error) { if (!(error instanceof HttpError) || error.status !== 401) throw error; }
    if (user) {
      const link = await database(env).prepare('SELECT sign_in_provider FROM platform_firebase_accounts WHERE user_id = ?').bind(user.id).first();
      user.signInProvider = link ? link.sign_in_provider : 'local';
    }
    return json({ user, capabilities: await capabilities(env) });
  }
  if (method === 'GET' && path === '/auth/sessions') return sessions(request, env);
  if (method === 'GET' && path === '/auth/google/start') return googleStart(request, env);
  if (method === 'GET' && path === '/auth/google/callback') return googleCallback(request, env);
  if (method !== 'POST' && method !== 'DELETE') throw new HttpError(405, 'This method is not supported.', 'METHOD_NOT_ALLOWED');
  requireMutationOrigin(request, env);
  const body = await readJson(request);
  if (method === 'DELETE' && path.startsWith('/auth/sessions/')) return revokeSession(request, env, path.slice('/auth/sessions/'.length));
  if (method === 'DELETE' && path === '/auth/account') return deleteAccount(request, env, body, accountErasureStatements);
  if (method !== 'POST') throw new HttpError(405, 'This method is not supported.', 'METHOD_NOT_ALLOWED');
  switch (path) {
    case '/auth/register': return register(request, env, body);
    case '/auth/login': return login(request, env, body);
    case '/auth/firebase': return firebaseSignIn(request, env, body);
    case '/auth/logout': return logout(request, env);
    case '/auth/logout-all': return logout(request, env, true);
    case '/auth/verification/request': return requestEmail(request, env, body, 'verify_email');
    case '/auth/verification/confirm': return confirmEmail(request, env, body);
    case '/auth/reset/request': return requestEmail(request, env, body, 'reset_password');
    case '/auth/reset/confirm': return resetPassword(request, env, body);
    case '/auth/reauth': return reauthenticate(request, env, body);
    case '/auth/mfa/enroll': return enrollMfa(request, env);
    case '/auth/mfa/confirm': return confirmMfa(request, env, body);
    case '/auth/mfa/verify': return verifyMfaLogin(request, env, body);
    case '/auth/mfa/challenge': return challengeMfa(request, env, body);
    default: throw new HttpError(404, 'Authentication route was not found.', 'NOT_FOUND');
  }
}
