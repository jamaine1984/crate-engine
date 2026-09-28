# Crate Ship Games — release handoff

Updated September 27, 2026. **The application snapshot is deployed to production at [crateshipgames.com](https://crateshipgames.com/).** The primary agent confirmed public HTTP checks and API routing below; live production browser QA is still underway. Registration, paid AI, ads, payments and other commercial integrations remain disabled. Deployment does not establish full feature readiness. Source, local tests, browser checks and production operation are separate evidence.

## Product decisions to preserve

- The editor is **free, with advertising considered after editor readiness**. The earlier $1.99 subscription direction is superseded. Core save/import/export must preserve user work when ads are unavailable, declined, blocked, or offline.
- A real Three.js/Rapier editor replaces the earlier agent-heavy engine. No bundled AI/OpenClaw agent is required. AI is optional and uses the user's own connected provider account and billing; Crate Ship supplies no paid generation credits or platform-key fallback.
- Existing model assets are optional. Preserve originals; no bulk replacement, removal, conversion, or newly purchased/generated inventory was authorized in this pass.
- Keep truthful empty marketplace states. Reference-image game titles, prices, ratings, and player counts are not real inventory.

## Implemented capabilities and limits

| Area | Current source/local capability | Remaining boundary |
| --- | --- | --- |
| Website | Forest green/orange player-first hub, account/library/developer/owner routes and responsive layouts | Real inventory and configured production accounts are still required |
| Editor | Live 3D viewport; hierarchy, transforms, parenting, subtree duplicate, Undo/Redo, material/light settings, authored camera; edit/play restoration | No full terrain sculpting, animation graph, mesh-accurate collision, multiplayer authoring, or complete native-engine feature parity |
| Physics/input | Rapier bodies, gravity, player movement/jump, collectibles; keyboard and touch D-pad/Jump; interrupted input clears | Physical iOS/Android testing, simultaneous touches, large-scene memory and performance remain unverified |
| Import/save/export | Self-contained GLB import with original bytes, local projects, account project/revision storage, portable `.crate` backup, selected original GLB download, standalone browser-game ZIP | Cloud requires backend bindings. No Unity, Unreal, or Godot native project exporter; no complete authored-scene GLB exporter. Serve game ZIP over HTTP, not `file://` |
| Procedural worlds | Shared strict seeded `add`/`grid`/`scatter` recipes, village/forest blockouts, existing imported model references, preview then one-step Undo-able apply | Arranges existing objects; does not generate new mesh/texture/rig/audio/gameplay code. Limits: 64 operations, 500 new/5,000 total entities, 32 lights |
| Optional BYOK | OpenAI, Anthropic, OpenRouter connections; encrypted account-bound credentials, masked list, explicit test, explicit billed single-request consent, request-ID replay protection; legacy operations or world recipe proposals | `ENGINE_AI_ENABLED` starts off. No real paid provider call verified; exact model access and customer billing need owner-controlled acceptance. No automatic agents or arbitrary code execution |
| Editor MCP | Optional localhost helper, two separate per-start pairing/native tokens, explicit write permission; `get_scene`, `preview_world`, `apply_world`, `undo`; project/revision-bound preview. Live local browser/bridge/MCP transport preview/apply/undo checked | Pinned stdio MCP **2025-06-18**, not current-version blanket compliance. External AI-client setup and production HTTPS/local-network permissions still need acceptance. Browser UI uses port 9879 |
| Blender | Optional desktop addon/bridge and GLB file-import alternative | Actual Blender execution was blocked by Windows; mock/subprocess checks do not prove a live Blender workflow |
| Accounts/security | D1-backed password/session, verification/reset, configured Google OAuth, TOTP/re-auth, strict server roles, account erasure, origin/rate checks | No automatic legacy account migration. Registration waits for real mail config. Owner provisioning waits for a verified account plus MFA; no production owner grant established here |
| Private models | Ownership-bound GLB API, structural inspection/hash, quota/reservation, configured private R2, deletion queue | Live authorized storage workflow and maintenance scheduler remain unverified; structural validation is not malware scanning |
| Marketplace/finance | Ownership/revision boundaries, quarantine/release review code, atomic release guard, immutable verified-provider ledger allocation | Scanner/publisher/content isolation are not operational merely from a Pages deploy; payments, payouts and ads remain disabled |

Procedural changes reject stale previews and require model preflight before committing. A reported BYOK fingerprint race was fixed with a synchronous authored-scene comparison after hashing. These repairs have focused regression evidence, not a claim that all browser/device races are impossible.

## Existing asset inventory and tags

The remote and local selected catalogs each contain **4,077 distinct normalized GLB paths** from 4,122 source rows; 45 `.glb.tmp` rows are excluded by the loader. Existing names, category/tag metadata and binaries are preserved. Catalog search/category filtering, total/matching counts and Show more avoid presenting the first 80 cards as the entire library.

This is **not 4,077 verified working imports**, unique character identities, or newly curated tags. There are 1,037 category disagreements between catalogs, many broad/unclassified labels, and sampled files with external resources or JSON glTF stored under a `.glb` suffix that the safe importer rejects. Full binary/texture/license/rig/performance verification remains undone. See [asset inventory](asset-inventory.md); machine-readable CSV/JSON evidence is in the sibling `outputs/verification/` folder.

## Cloudflare setup and remaining prerequisites

The primary agent provisioned the isolated `PLATFORM_DB` (`crateship-platform-v1`), applied migrations 0001–0005 remotely, configured `ENGINE_ASSETS` and `PLATFORM_UPLOADS` to the existing private `crateship-games-user-assets` R2 bucket, and updated Wrangler configuration. The two storage APIs use separate namespaces; the bucket itself is shared. Server secrets were created after confirming no existing secrets. Pages publication and basic public API checks passed; complete signed-in workflows remain unverified.

1. **Completed deployment:** Pages site with API routing. `_routes.json` includes `/api/*` and Vite copies it to `dist`; `functions/api/platform/[[path]].js` dispatches the new API. Live `/api/platform/health` and `/api/platform/config` returned 200 JSON. Corrected `_redirects` uses SPA target `/`, avoiding the `/index.html` normalization loop, and removes the `/play` self-rewrite.
2. **Completed setup:** isolated `PLATFORM_DB`, migrations `platform/migrations/0001_identity.sql` through `0005_engine_assets.sql` applied remotely. Do not repurpose the legacy audit/user database or apply local fixture data to production.
3. **Completed setup:** `APP_ORIGIN=https://crateshipgames.com`, server-only `AUTH_SECRET` and `ENCRYPTION_KEY`. Preserve these secrets across deploys; careless rotation can invalidate passwords or make TOTP/BYOK ciphertext unreadable. Never publish local `.platform-local` secrets, customer keys, or owner email configuration. `AUTH_PASSWORD_POLICY_APPROVED=false`; registration is intentionally not ready.
4. **R2 binding completed:** private `ENGINE_ASSETS`. Still configure/verify the trusted `worker/engine-maintenance/index.mjs` schedule with the same private D1/R2 bindings for deferred purge and abandoned-upload reconciliation. Its source does not install a schedule automatically.
5. For registration: `MAIL_PROVIDER=resend`, verified `MAIL_FROM`, and secret `MAIL_API_KEY`. For optional Google sign-in: client ID/secret and exact redirect `${APP_ORIGIN}/api/platform/auth/google/callback`. Keep unavailable integrations unavailable; do not send pretend verification emails.
6. Keep paid/provider flags off. Marketplace publication additionally needs quarantine `PLATFORM_UPLOADS`, the actual trusted `GAME_SCANNER`, publisher/released content storage and a separate safe `GAME_CONTENT_ORIGIN`; follow the isolation/scanner documents before enabling release.
7. **Completed separately:** primary agent deployed the retired legacy AI Worker returning 410 at `https://crate-engine-ai.koikes2021.workers.dev`, version `c46cd527-7a16-467f-b5bb-f109fd955219`. This disables that endpoint's provider calls; it does not itself revoke external provider credentials.

`/api/platform/health` only reports selected binding presence; it does not prove migrations, auth, mail, R2 writes, owner MFA, or production isolation work. Test each configured workflow with a disposable authorized account before declaring it operational.

## Ads and paid-service policy

Ads, rewards, payments, premium sales and creator payouts are deliberately disabled. Backend gates reject enablement of the listed monetization providers; there is no live ad inventory, Stripe checkout, payout execution or fake reward grant. BYOK is a separate optional feature flag and still requires real authenticated user credentials and explicit usage consent.

Do not gate ordinary project preservation behind a rewarded ad. Google requires an affirmative rewarded-ad choice and says declining must not interfere with normal use. Editor eligibility and rewards tied to downloadable/exportable work need actual Google policy/eligibility review. Prefer optional eligible benefits and interstitials at natural breaks after durable save; never random editing interruptions. No-fill, script failure or offline state must retain work and allow baseline actions. See [monetization readiness](editor-monetization-readiness.md), [Google rewarded policy](https://support.google.com/adsense/answer/9121589?hl=en-8), and [Ad Placement callbacks](https://developers.google.com/ad-placement/apis/adbreak).

## Verification record and known gaps

- Local built browser QA exercised desktop and 390px layouts, editing/Undo, GLB rendering, local/account project reopen, backup import, optional catalog import, physics/Stop and touch overlay; a generated game ZIP was extracted and served separately. Evidence: [design QA](design-qa.md).
- Browser download APIs timed out in the in-app browser. An explicit download link is present; actual file persistence from that browser flow remains unverified. QA files generated with the real exporter do not prove browser download persistence.
- Primary agent reports the full release suite: **507 tests, 506 passed, 0 failed, 1 skipped**. Latest build passed with `play-DLfBggVg.js`. A prior syntax pass checked 147 files; the final syntax recheck after the last small UI change has not yet been reported.
- Focused BYOK suite: **47/47**, real SQLite plus controlled provider fetch fixtures; no paid calls. Editor MCP agent reports **25/25**, real Node subprocess/loopback and root browser-client module with core preview/apply/undo. Engine agent reports **44 focused tests** after model preflight repair. Focused counts overlap the release suite and must not be summed as additional coverage.
- Live local MCP check used the browser, real loopback bridge and MCP call transport: **43 initial entities → preview leaves 43 → apply adds two for 45 → Undo restores 43**. Evidence: sibling `outputs/verification/editor-mcp-live-qa.json`. No external AI client/provider or paid generation was involved.
- Production HTTP checks confirmed `/`, `/play`, `/games`, `/api/platform/health`, and `/api/platform/config` return 200; the served editor references the expected build bundle. Production browser QA is underway, so complete live signed-in/edit/import/export behavior is not claimed yet.
- Physical phones, live BYOK billing/model access, actual desktop AI client setup, actual Blender, deployed Google OAuth/mail, production role grants, scheduler cleanup, scanner/publisher, and full asset compatibility require further checks. Browser local storage can be evicted; backups remain important. Periodic crash-recovery autosave is not established.

## Useful commands and documentation

Run from this repository with its supported Node runtime (local verification used Node 24.5.0):

```powershell
npm run build
npm run check
npm run test:platform
node --test tests/model-connections.test.mjs
node --test integrations/editor/editor-bridge.test.mjs
npm run dev:platform
npm run preview:platform
npm run bridge:editor -- --origin http://127.0.0.1:4173
```

`dev:platform` uses ignored local SQLite/private asset fixtures; `preview:platform` serves the built result. Neither establishes Cloudflare production readiness. For deployed MCP pairing use the exact deployed origin and port **9879**; a phone's localhost is the phone, not the desktop. Build/check commands do not deploy. Deployment, D1 migration, and separate Worker commands must target the verified account/project and bindings.

Read next: [editor capabilities](editor-capabilities.md), [new engine](new-engine.md), [procedural authoring](procedural-authoring.md), [editor MCP setup](../../integrations/editor/README.md), [BYOK](model-connections.md), [identity](identity.md), [private models](engine-assets.md), [touch controls](touch-controls.md), [game isolation](game-isolation.md), [scanner](upload-scanner.md), [release matrix](release-status.md). The earlier requirement matrix is a planning snapshot; later decisions in this handoff supersede preserve-only engine and subscription assumptions.

## Deployment record — confirmed snapshot, features remain gated

- Latest Pages deployment: [9ca0274f.crateship-games.pages.dev](https://9ca0274f.crateship-games.pages.dev). Earlier `6d1e3c24` is superseded after fixing the redirect loop; use the latest deployment.
- Custom domain HTTPS: [home](https://crateshipgames.com/), [editor](https://crateshipgames.com/play), and [games](https://crateshipgames.com/games) all returned HTTP 200 (primary-agent checks).
- Published source commit: `19b186ec56ad6f441ce89dfd1c21310cfa18c0c3`. Served `assets/play-DLfBggVg.js` matches the latest build. A subsequent documentation-only commit may contain this final handoff.
- GitHub backup: push to `origin/codex/platform-rebuild` succeeded under the user's explicit backup authorization; this does not imply a merge to another branch.
- API health: HTTP 200, `databaseConfigured:true`, `uploadsConfigured:true`. API config: HTTP 200; commercial, registration and paid-AI flags false, mail and Google availability false.
- D1: `crateship-platform-v1`, ID `be31584e-bd51-46b6-b935-a794097d2e12`; migrations 0001–0005 applied remotely (primary-agent confirmation).
- Private R2 bindings: `ENGINE_ASSETS` and `PLATFORM_UPLOADS` -> `crateship-games-user-assets`; live authorized upload/read/purge still unverified.
- Mail/registration/owner: mail not configured, password policy not approved, owner bootstrap not performed; paid flags off.
- Legacy AI Worker: [retired endpoint](https://crate-engine-ai.koikes2021.workers.dev) verified HTTP 410, version `c46cd527-7a16-467f-b5bb-f109fd955219`.
- Desktop source backup: `C:\Users\koike\OneDrive\Desktop\CrateShip Games Arcade`, excluding private data, `.git` and `node_modules`; created before Pages publication.
- Live production browser QA is underway. The primary agent will commit/push this documentation update and refresh the desktop copy. These pending steps and unenabled integrations must remain distinct from the successfully deployed application snapshot.

## Final production browser evidence

Verified on https://crateshipgames.com/play: village review proposed 164 objects without mutation; Apply changed 3 to 167; Undo restored 3; Redo restored 167. Play/Stop worked. Games navigation prompted, Save & continue reached /games, and reopening the saved production browser project restored 167 objects. No console errors observed during this check. Public /api/platform/catalog returned 200 with zero published games. Evidence is outputs/verification/production-release.md, production-checks.json and production-editor.png in the workspace/desktop backup.

Current local user-edited scene is separately backed up as Current-Editor-Project.crate (9 objects, 5 embedded GLB models) and Current-Editor-Game.zip. Import the .crate in the live editor to move it there; a site deployment does not copy localhost IndexedDB to the production origin. The localhost scene remains available. Full handoff/source also resides in the Desktop folder CrateShip Games Arcade. Registration and paid features remain disabled as listed above.
