# Platform identity setup and verification

This identity subsystem is a new, isolated Workers/D1 implementation. It does not migrate users or validate sessions from the legacy authentication service. It has local automated coverage; it has not been independently security audited or verified with the owner's live mail, Google, domain, MFA devices or production Cloudflare account.

## Required server configuration

| Binding/variable | Required value and handling |
| --- | --- |
| `PLATFORM_DB` | New D1 database; apply all `platform/migrations/*.sql` in filename order. Never point at the legacy production database. Staging and production use separate databases. |
| `APP_ORIGIN` | Exact application origin, such as the approved HTTPS staging domain. No path, credentials, query or fragment. Configure the actual deployed origin; do not trust forwarded host headers. |
| `AUTH_SECRET` | At least 32 cryptographically random bytes, base64url encoded, held in a Workers secret. Used for password pepper and hashed rate-limit/IP identifiers. Never expose in public environment variables. |
| `ENCRYPTION_KEY` | Exactly 32 cryptographically random bytes, base64url encoded, held in a separate Workers secret. Used for AES-256-GCM encryption of TOTP secrets and short-lived OAuth state payloads, with record-specific authenticated context. |
| `MAIL_PROVIDER` | `resend`; this is the currently implemented mail adapter. |
| `MAIL_API_KEY` | Actual Resend secret API key. A real accepted provider response is required; there is no fake-email production mode. |
| `MAIL_FROM` | Sender email or sender display name/email accepted by the configured provider. Verify the sending domain and configure SPF/DKIM/DMARC through the owner's approved mail account. |
| `GOOGLE_CLIENT_ID` | Owner-configured Google Web application client ID ending in `.apps.googleusercontent.com`. |
| `GOOGLE_CLIENT_SECRET` | Corresponding secret stored only in the Worker. |
| `AUTH_LOCAL_DEV` | Set to literal `true` only for an explicit localhost/127.0.0.1/IPv6 loopback origin. A remote origin never receives insecure development cookies. |
| `AUTH_PASSWORD_POLICY_APPROVED` | Literal `true` only after the operator reviews the work-factor limitation below. This is an additional deployment gate, not evidence of an external security audit. |

Generate the two secrets independently using a cryptographic generator; do not use example words or reuse legacy tokens. A local generation command is `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Install the resulting values using the deployment's actual secret tooling. Do not commit them, include them in screenshots/logs, or put them in frontend Vite variables.

Public registration requires all three: configured real mail delivery, `PUBLIC_REGISTRATION_ENABLED=1` in `platform_feature_flags`, and production password-policy approval. Its database default is disabled. Google account creation obeys the same registration gate. Existing configured accounts can sign in while new registration is closed. Owner provisioning must be a separate reviewed operator action after identity ownership is verified; the signup API always assigns `PLAYER` and rejects supplied privilege fields.

## Password work factor limitation

Passwords use WebCrypto PBKDF2-HMAC-SHA-256 with a unique 16-byte random salt, 100,000 iterations and a 32-byte result. A separate server secret HMAC peppers the input. Passwords accept 12–128 characters and are never silently truncated or normalized. Encoded hashes preserve their algorithm/version and parameters.

The 100,000 work factor accommodates the older Cloudflare workerd PBKDF2 ceiling used by the project's runtime tooling. It is below OWASP's recommended 600,000 PBKDF2-HMAC-SHA-256 work factor. A pepper does not turn a lower work factor into an equivalent one. Before production registration, review the target runtime's supported limits and cost budget, or adopt an appropriately reviewed identity/password hashing provider. Keep registration disabled until that decision and runtime validation are complete. The application must not claim this implementation is independently audited or OWASP work-factor compliant.

Sources: [Cloudflare WebCrypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) and [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Changing `AUTH_SECRET` makes existing password hashes unverifiable; plan rotation/versioning and a verified reset process. Changing `ENCRYPTION_KEY` without reencrypting records makes stored TOTP material unreadable. Never replace either key casually during redeployment.

## Sessions and authorization

- Production cookie: `__Host-crateship_session`, `Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain. Explicit local development uses `crateship_session_local`.
- Cookie contains a random 256-bit opaque value; only its SHA-256 hash is stored in `platform_sessions`. Sessions persist for 30 days with server-side expiry/revocation. Owner sessions expire after 12 hours or 30 minutes without activity.
- Every protected request resolves the current active user and database roles. Email verification is required by role guards. Owner role operations always require MFA; sensitive mutations require primary and MFA authentication within five minutes.
- Roles are exactly `PLAYER`, `DEVELOPER`, `PARTNER_DEVELOPER`, `MODERATOR`, `CONTENT_MANAGER`, `FINANCE_ADMIN`, `PLATFORM_ADMIN`, `OWNER`. Client roles, hidden URLs and legacy admin tokens are not identity proof.
- Auth mutations require the configured same origin in both URL and `Origin`, plus JSON bodies with enforced byte limits. Cookies are never exposed to uploaded games. API callers outside the browser do not bypass this check.
- Rate counters update atomically in D1. Cloudflare supplies `CF-Connecting-IP`; do not expose a proxy that trusts arbitrary client IP headers. Schedule retention cleanup for expired session/token/OAuth/rate rows after defining operational and privacy retention.
- Session/device listing, individual revocation, logout and logout-all are implemented. Password reset revokes all sessions and outstanding auth challenges. Reauthentication rotates the session token.

## Mail, reset and verification

Email links place their opaque token in the URL fragment, which the frontend submits through same-origin JSON. Verification tokens expire after 24 hours; password reset tokens after 30 minutes. Only token hashes are stored. Consumption and account updates are transactional; replay is denied. Tokens are not returned by registration/reset-request APIs and are never logged. Provider delivery errors return an explicit unavailable/error response rather than claiming an email was sent.

Verify real provider acceptance and delivery to controlled accounts in staging. Test expired and replayed links, rate limits, account deletion and session revocation. Mocked local provider tests do not establish live email deliverability.

## Google sign-in

Configure the exact redirect URI `${APP_ORIGIN}/api/platform/auth/google/callback` in the owner's Google Web application client. The code uses authorization-code flow, a browser-bound random state cookie, a single-use expiring database state, S256 PKCE and a nonce. Provider tokens stay server-side. ID tokens require Google's trusted JWKS RSA signature plus matching issuer, audience, nonce, subject, time and verified email claims. A Google account is never automatically linked to an existing password account merely because the email matches.

No Google account, consent screen, grant or client is activated by this code. Verify domain/consent configuration and real code exchange before advertising Google login as operational. For Google-only accounts, the dedicated sensitive-operation reauthentication flow is currently unavailable and fails closed; a normal sign-in is not presented as that completed flow. Configure and verify provider reauthentication before enabling sensitive changes for those accounts.

Source: [Google OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

## TOTP and owner setup

The authenticator implements RFC 6238 HMAC-SHA1 TOTP with 30-second intervals, six digits and a one-step clock window. The SHA1 MAC is the interoperable TOTP algorithm; passwords use SHA-256 PBKDF2. TOTP secrets use AES-256-GCM at rest, enrollment is bound to a recently authenticated verified account/session, and confirming enrollment revokes previous sessions. Login then requires a password/Google challenge followed by TOTP. Used counters cannot be replayed, including across login challenges.

Setup requires a real authenticator controlled by the verified owner. Establish an operator-reviewed recovery procedure before production; recovery codes, authenticator replacement and automated MFA recovery are not yet implemented. Do not grant owner rights to the partner as a workaround. Unenrolled owners cannot access the owner portal. Source: [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).

## Account deletion and retained records

Deletion requires recent authentication, and recent MFA when enabled. Owner/finance/platform administrator accounts must transfer privileged responsibilities before self-deletion. The trusted application router supplies `accountErasureStatements(userId, db)` to `handleAuth` so deletion of projects, progress, preferences and other private user records runs in the same D1 transaction as identity anonymization, role/key/token deletion and session revocation. Callback/SQL failures roll back the operation.

The response explicitly states that required financial, ownership and audit records retain a pseudonymous account reference. Define actual retention periods, object-storage erasure, lawful retention and future data export before claiming complete data erasure. The identity module alone does not silently purge financial history or uploaded game ownership.

## Local verification

Run `node --test tests/identity.test.mjs tests/platform-data.test.mjs tests/commerce.test.mjs` on the project's Node 24 runtime. The tests use real in-memory SQLite with platform migrations, actual WebCrypto and RFC TOTP vectors. Mail and Google provider boundaries are mocked only inside tests; no production email, provider grant, financial event, secret mutation or remote database write is performed.

Local passing tests do not replace Workers runtime, real browser cookie, live mail/OAuth, owner-device MFA, staging isolation, security review or production deployment verification.
