# CrateShipGames backend and security audit

Date: 2026-09-27. Repository inspected: `outputs/crate-engine`, HEAD `e84d441`. Root web source is canonical; nested `crate-engine/web` is a duplicate legacy tree. This was source inspection only: no source edits, tests, destructive probes, account access, or remote mutations. No applicable AGENTS.md was found in the repository or checked ancestors. This report is for the 164-section platform brief, including its instruction to defer Stripe and Google advertising connections.

## Existing implementation

- Cloudflare Pages project `crateship-games`; root `wrangler.toml` binds KV `CRATE_GAMES`, D1 `CRATE_AUDIT`, and R2 `CRATE_USER_ASSETS`. `_routes.json` sends `/api/*` into Functions.
- Root `functions/api` contains only games and assets APIs. There is no root authentication, session, rewards, wallet, entitlement, billing, developer agreement, platform configuration, or player account server implementation.
- `auth.mjs:2,56-78,105-131` calls a separate `https://api.crateshipgames.com` service for register/login/me, marketplace purchase/upload, library/download, and subscribe. That service's implementation is absent from this checkout. Its deployment, password security, authorization, billing state, and data cannot be established from this repository.
- `auth.mjs:38-47` renders login and plan state from sessionStorage; that UI state is not a trustworthy entitlement or authorization source.
- Games use JSON records under KV `game:<slug>`, with listing metadata, SHA-256 owner-token hash, creator fields, project/scene data, arbitrary cloud asset references, moderation status, visibility, feature flags, and embedded audit events (`functions/api/games/[[path]].js:605-637`). Slug allocation and updates are KV read-then-write, not transactions.
- Assets use R2 `user-assets/<ownerHash>/index.json` plus per-file objects. Published copies are `published-assets/<publicId>/asset.json` plus file objects (`functions/api/assets/[[path]].js:114-127,213-233,536-560`). Asset index has 500 rows, each upload 25 MiB, nominal owner quota 500 MiB.
- D1 has only `moderation_audit` and `cleanup_audit` tables, with timestamp/slug/reason indexes (`migrations/0001_moderation_audit.sql`, `0002_cleanup_audit.sql`). No user/role/project/reward/commerce schema exists here.
- `worker/index.js` is an AI proxy using server `OPENROUTER_API_KEY` or a user-provided key; it is not the separate account API. `worker/wrangler.toml` calls it `crate-engine-ai`.
- `worker/public-asset-cleanup` is a daily scheduled cleanup service sharing the Pages KV, D1, and R2. Its checked-in configuration is dry-run (`CRATE_PUBLIC_ASSET_CLEANUP_DELETE=false`). This is configuration evidence, not verification of live settings.
- `multiplayer-server/server.mjs` is a small Colyseus presence/pose relay without account authentication, pose validation, or application rate limits.

## Existing route map

| Route | Method | Existing gate / behavior |
|---|---|---|
| `/api/games/publish` | POST | New games unrestricted; existing record checked only when it has ownerHash |
| `/api/games` | GET | Public catalog; public + active records only |
| `/api/games/:slug` | GET | Public/unlisted readable; hidden moderation status requires owner or any admin token |
| `/api/games/:slug` | PATCH | Owner token or any configured admin token; limited role checks for three moderation fields only |
| `/api/games/:slug` | DELETE | Owner token or any configured admin token, no role-specific deletion permission |
| `/api/games/admin/list` | GET | Any configured admin token |
| `/api/games/admin/audit/:slug` | GET | Any configured admin token |
| `/api/games/admin/audit/verify` | POST | Admin role; temporary D1 write/read/delete probe |
| `/api/games/admin/audit/backfill` | POST | Admin role; KV audit to D1 |
| `/api/assets/health` | GET | Public binding/limit status |
| `/api/assets`, `/api/assets/usage` | GET | Any nonempty owner token selects a storage namespace |
| `/api/assets` | POST | Any nonempty owner token; multipart GLB/GLTF upload |
| `/api/assets/:id`, `/api/assets/:id/download` | GET | Any nonempty owner token; lookup only in its namespace |
| `/api/assets/:id` | DELETE | Same owner namespace lookup |
| `/api/assets/:id/publish` | POST | Source asset owner token; arbitrary publicId/gameSlug accepted |
| `/api/assets/public/:publicId`, `/download` | GET | Public, no account or moderation check |
| `/api/assets/admin/public-cleanup` | POST | Any configured admin token; dry-run or actual deletion |
| AI worker, any path | POST | No account authentication or rate-limit gate |
| Cleanup worker `/`, `/health` | GET | Public health and recent-run summary |
| Cleanup worker `/history`, `/history.csv`, `/audit`, `/audit.csv` | GET | Admin role |
| Cleanup worker `/cleanup` | POST | Admin role; dry-run/delete |

Games dispatcher: `functions/api/games/[[path]].js:1204-1241`. Assets dispatcher: `functions/api/assets/[[path]].js:696-717`. Cleanup dispatcher: `worker/public-asset-cleanup/index.js:765-905`.

## Trust model

The engine generates separate random browser-local owner tokens for publishing and assets (`engine.mjs:16674-16695,19028-19047`). They are bearer capabilities, not authenticated platform users. Losing browser storage loses ownership recovery. Asset API accepts any nonempty token and hashes it; there is no server-issued session or account lookup (`assets:278-282`). Admin identities/roles come from environment token lists, with the same token acting as an enduring secret (`games:320-360`). Admin tokens persist in localStorage (`admin.html:388-395`, `engine.mjs:16730-16738`). All API CORS policies permit `*`.

## Findings, prioritized

### Critical: published scripts execute with the website's privileges

`engine.mjs:17064-17073` fetches published projectData and deserializes it. `engine.mjs:16558,16478-16483` restores embedded scripts. `user-scripts.mjs:334-344` immediately runs enabled scripts, and `137-142` uses `new Function` in the main page realm. The object called a sandbox at `79-112` does not isolate globals such as window, document, storage, or fetch. A malicious published project can execute on the same origin as accounts/editor/admin, read browser tokens, persist code as saved scripts (`170-184`), and issue authenticated requests. This is a direct source path, not a live exploit test.

Repair: preserve the engine, but put untrusted published gameplay on a dedicated origin with no platform credentials, restrictive CSP, sandboxed embedding, and a narrow validated message bridge. Immediately block automatic untrusted script execution until that boundary exists. Owner/admin UI must never execute submitted code.

### Critical: arbitrary HTML can be served under an asset download URL on the platform origin

`assets:418-421` checks only filename extension. `450` stores user-provided multipart MIME; `458-459` writes that MIME. Public download at `589-603` sends the stored MIME with `Content-Disposition: inline` and no nosniff. An uploader can label HTML as a `.glb` file and `text/html`, publish it, and create a same-origin active document under `/api/assets/public/.../download`.

Repair: validate magic bytes/GLTF structure, force an extension-derived MIME, add `X-Content-Type-Options: nosniff`, and serve user content from a dedicated untrusted asset origin. Reject HTML/SVG/script content as models. Use attachment disposition where inline display is unnecessary.

### Critical: public assets can be overwritten by another owner

`assets:510-524` accepts caller-selected publicId/gameSlug and reads existing metadata. `527` compares ownerHash solely for quota accounting; no rejection occurs for a different owner. `549-563` overwrites metadata/object and may delete the original object's key.

Repair: reject publicId collisions belonging to another owner and require server-verified game ownership. Allocate immutable server IDs, namespace by account/game/version, and record asset relations in transactional storage.

### Critical: game publication can cause deletion of another game's assets

`games:620` stores caller-provided cloudAssets without ownership validation. `cleanupPublishedAssets` at `217-249` resolves these public IDs and deletes their metadata/files without checking owner or other game references. It runs on republish (`644`) and delete (`1200`). A caller can reference an existing public asset in its own game and then remove that reference, causing that asset to be deleted.

Repair: validate all asset attachments against authenticated ownership or explicit license, model references in D1, and only delete an asset after server-side ownership and zero-reference checks. Prefer a delayed, audited tombstone lifecycle instead of immediate deletion during game save.

### High: role enforcement is incomplete and defaults fail open

`games:482-484` treats every matching admin token as full management authorization. `1189-1200` permits any such role to delete games. Republish at `591-594` accepts the same authorization and permits full project replacement. PATCH role checks at `1142-1153` cover only visibility, moderationStatus, and featured; viewer tokens can change title/description/tags/creator at `1111-1119`. `cleanAdminRole` at `99-101` converts unknown roles to admin. The Pages asset cleanup route at `650-678` checks token validity but never role, unlike the scheduled Worker (`251-267`).

Repair: shared deny-by-default action permissions with explicit owner/admin/moderator/curator/viewer capabilities; validate every mutation before changing data; reject unknown roles; write immutable audit events for content changes, deletes, ownership changes, and policy changes.

### High: unauthenticated storage creation and server-funded AI lack abuse controls

`games:571-597` allows anonymous new publication and permits overwrite of legacy records lacking ownerHash. `assets:278-282,406-410` accepts unlimited newly invented owner tokens; per-token quotas therefore do not limit an attacker. AI Worker `47-64` uses the server key for anonymous requests, with no request size, identity, rate, or spending gate. No account/IP quotas appear in these handlers.

Repair: authenticated verified account IDs, server-issued permissions, per-account/IP throttles, body limits before full buffering, storage and AI budget controls, and explicit feature gates. Claim legacy content through an audited migration; never treat absent ownership as open write permission.

### High: storage quota/accounting and writes can lose data or leave orphaned objects

Asset upload uses a read-modify-write JSON index (`431-471`) without concurrency control, so simultaneous writes can lose entries or exceed quota. Upload counts only private assets, while publish counts private plus published (`525-529`); uploads after publishing can exceed the combined quota. Index writes silently truncate to 500 rows (`224-231`) while accepting more uploads. Replacement with the same ID but a new filename leaves the old private object behind. KV slug checks also lack transactional uniqueness.

Repair: D1 asset rows and quota reservations with transactional account totals, conditional versioned updates, reject overflow, delete obsolete objects through queued reconciliation, and durable operation IDs for retries.

### High: accounts, durable roles, rewards, commerce, and owner portal do not yet exist in this source

No verified first-party session/auth handler, server roles, reward ledger, entitlement ledger, platform owner account bootstrap, MFA flow, developer onboarding/agreement ledger, or account persistence exists here. External API consumers do not prove those systems exist or are safe. This blocks calling the 164-section rebuild production-ready.

Repair: first identify/recover the existing `api.crateshipgames.com` deployment and data, then choose a deliberate account migration. Add server-verified identity, secure session lifecycle, backend-enforced roles, immutable ledgers, and an owner portal with sensitive-action reauthentication. Defer Stripe/Google connections as requested.

### Medium: account UI renders unescaped profile data

`auth.mjs:194,209-212` puts user.name/user.email into innerHTML. If the external auth service permits markup in those fields, it enables script injection in account UI. Backend sanitization is unverified.

Repair: render text with textContent/DOM nodes, validate data shapes, and avoid interpolating profile data into HTML.

### Medium: hidden game responses declare shared caching

`games:655-659` correctly checks authorization for hidden moderation status, then returns the response with `Cache-Control: public, max-age=30` and no authorization-dependent cache policy. Shared caches can retain a privileged response; actual Cloudflare caching is unverified.

Repair: hidden/privileged responses must be `private, no-store`. Public game delivery should cache only immutable approved versions.

### Medium: moderation audit persistence can silently fail

`games:1177-1184` commits the KV update and swallows D1 audit-write failure. Only the three moderation fields generate audit entries; full republishes, deletes, metadata edits, and ownership changes lack equivalent durable audit records.

Repair: transactionally store mutation/audit/outbox in D1, retry outbox writes with visible failure monitoring, and never silently report a fully audited action when durable auditing failed.

### Medium: multiplayer relay trusts arbitrary client messages

`multiplayer-server/server.mjs:8-10` stores and broadcasts arbitrary pose data. Spread order `{ id: client.sessionId, ...data }` lets data override id. There is no onAuth gate, pose schema, range/rate check, or per-room capacity policy in this source.

Repair: validate signed game sessions, force server-owned identity after payload fields, validate finite position values, limit message size/frequency and room capacity, and introduce authoritative rules where scores/rewards depend on gameplay.

## Existing useful protections to retain

- Owner tokens are hashed before storage; game ownerHash is omitted from public game summaries.
- Private asset lookup is scoped to a hash-derived owner namespace.
- JSON game payload limits, asset size/extension limits, text-length bounds, creator URL protocol checks, parameterized D1 queries, moderation field checks, and escaped admin table content already exist.
- Cleanup worker defaults to dry-run and enforces admin role; keep this default until ownership/reference repair and audit verification.
- D1 audit migrations and service health endpoints provide an incremental base.

## Secrets review

A targeted source and handoff regex scan found no high-confidence private-key/standard-provider-token patterns. This is not a complete secret audit and does not inspect git history or live environment bindings. Wrangler references server secrets by name; account IDs, namespace IDs, database IDs, URLs, and bucket names are configuration identifiers, not credentials. No secret values were written into this report. Browser-persisted admin/auth/owner and user-supplied AI keys remain exposed to any same-origin script under the current execution model.

## Incremental repair order

1. Fix trust boundaries and proven cross-owner write/delete paths before adding catalog/player traffic. Restrict script execution, force safe model content, enforce asset ownership, deny role bypasses, lock legacy unauthenticated replacement, and keep cleanup deletion off.
2. Recover the separate account API deployment/configuration and map existing users/data before changing identity. Build shared session/authorization validation and authenticated account IDs behind current engine interfaces.
3. Add D1 platform schema for users/roles, projects/game versions, assets/references, developer profiles/agreements, public catalog moderation, audit/outbox, account quotas, and idempotent reward/entitlement ledgers. Keep financial providers disconnected.
4. Migrate KV records and browser owner capabilities through a documented verified-claim process, preserving existing games and public URLs. Move published versions and user content onto the isolated delivery boundary.
5. Build player/developer/owner interfaces against the server contracts; ensure frontend conveniences never establish account state, balances, access rights, approvals, or ownership.
6. Verify role-denial cases, cross-owner access, concurrent quota reservations, published script isolation, upload validation, restart persistence, idempotency, provider disconnection, and a staged deployment before describing the platform as production-ready.
