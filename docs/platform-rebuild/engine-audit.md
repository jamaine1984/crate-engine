# Frontend and game engine audit

Date: 2026-09-27. Repository inspected: `outputs/crate-engine`. Read-only source inspection; no source changes, heavy tests, build, live write, billing action, or browser behavior verification performed by this subtask. No applicable AGENTS.md found in the repository or ancestor directories. Existing missing `models` Mac-path stub and external production asset host are known; this report does not treat missing local asset files as proof that production assets are absent.

## Architecture and preservation map

- Plain HTML and native ES modules, imperative DOM UI and Three.js; no React/Vue app. Vite 7 multi-page build with root as source and `dist` as output. See `package.json:1`, `vite.config.mjs:48`, `vite.config.mjs:82`. Three and Three addons remain external imports, resolved by per-page import maps, e.g. `play.html:131`. Packages do not imply an offline runtime.
- Existing engine is substantial: engine.mjs ~1.03 MB source / 22,000+ lines; character.mjs ~275 kB; game-builder-ui.mjs ~227 kB. Preserve engine and character logic through adapters. Features include edit/explore/play modes, GLB/GLTF loading, renderer quality controls, Rapier physics, collision world, NPC and vehicle control, procedural terrain/buildings/weather/audio, gameplay components, code editor, project serialization, import/export, and cloud publication.
- Valuable boundaries already exist: lazy module imports (`engine.mjs:274`, `engine.mjs:331` onward), an engine bridge (`engine.mjs:15066`), `asset-url.mjs` host configuration, imported-asset validation and cloud storage (`engine.mjs:18795` onward), frame scheduling/profiling (`engine.mjs:14455` onward), rendering budgets, pooled effects (`engine.mjs:21145` onward), game builder component inspector and validation/undo (`game-builder-ui.mjs:1631`, `:1654`, `:2341`). Preserve these.
- Canonical project format is `crate-engine-project`, version 3 (`engine.mjs:15976`), with migration and validation (`:15986`, `:16057`). Contains command history, transformed object snapshots and stable IDs, asset and cloud asset references, gameplay components, scripts, validation history, weather. Main serialization `:16590`, import `:19636`, `.crate` export `:19664`. Limits: 8 MiB file import, 600 commands, 6,000 objects, 80 scripts. Preserve import compatibility and user data.
- Cloud integration is split: account auth/marketplace client uses `https://api.crateshipgames.com` (`auth.mjs:2`), while current published-game and asset engine features use same-origin Pages APIs (`engine.mjs:16851`, `:16908`, `:19071`, `:19142`). Platform unification must explicitly bridge identities and resource ownership.

## Prioritized findings

### P0: Published/imported scripts execute in the authenticated platform origin

Evidence chain: public game load `engine.mjs:17064-17073` fetches game project data and calls deserialize; `:16513-16514` accepts project scripts; `:16558` restores them; `:16478-16483` invokes `_installUserScriptPreset`; `user-scripts.mjs:333-345` immediately runs enabled scripts; `:137-142` executes `new Function` in the page. The named sandbox only supplies parameters and still permits global `window`, `document`, storage, and network access. The code editor has another execution path at `code-editor.mjs:3298-3300`.

Impact: opening a community game/project can execute its code beside account/session tokens, owner/admin capability tokens, imported assets, and BYO AI keys. Trusting a project schema is insufficient. Recommendation: introduce a separate player origin with restrictive iframe sandbox/CSP and narrow validated postMessage SDK. Until that boundary exists, prevent automatic execution of scripts from untrusted imports/public games and make trusted editing execution explicit. Preserve script data and local editor features.

### P1: Creator upload/payout UI claims functionality the implementation does not provide

`creators.html:377-399` reads GLB as base64 and writes only browser localStorage (`crate_creator_models`, `engine_marketplace_models`); `:403` announces that it is listed. No upload API is called by this submission path. UI promises 70% revenue and Stripe payouts on the first of each month (`:104`, `:132`, `:140`). Featured models are hardcoded samples (`:449` onward). `project-tools.mjs:184-212` contains another local-only upload/listing path.

Recommendation: keep browser-local import labeled as local; replace public publication UI with real authenticated upload/quarantine/review workflow. Until enabled, show creator program Coming Soon, remove fixed payout/earnings promises, and report true disabled states. These are source-confirmed conflicts with the new brief.

### P1: Existing payment CTAs bypass the requested disabled-payment phase

`project-tools.mjs:1-3` contains live-looking `buy.stripe.com` URLs; `:898-902` opens them from Subscribe buttons. `auth.mjs:117-131` exposes purchase/subscribe client methods. Pricing buttons instead navigate home (`pricing.html:69`, `:79`), so commerce behavior is inconsistent. Do not follow these links during testing. Route all payment actions through a disabled provider/feature flag and remove active checkout navigation for the initial phase.

### P1: Saves are browser-local and duplicated across incompatible schemas

Main named saves use `crate-saves` (`engine.mjs:19684`, `:19730-19738`); a second main-engine path uses `crate_saves` (`:19957-19965`). `savesystem.mjs:6-8` has `crate_engine_saves` and `crate_engine_autosave`; main engine also has `crate_autosave` (`engine.mjs:6291-6317`). Savesystem v1 serialization (`savesystem.mjs:14-42`) omits gameplay components and scripts. Its load (`:49-83`) replays model names and can rebuild a biome before placing saved objects. Its autosave starts on import (`:230-231`), and the engine imports it at `engine.mjs:329`.

Recommendation: retain legacy data, add import adapters for each storage key/schema, and unify new saves behind the v3 project serializer with backend authenticated user/project/revision ownership. Use local storage only as unsynced recovery cache. Rename/duplicate/delete, thumbnails and conflict/version handling should be project-service operations. Logout must not delete cloud projects.

### P1: Export exists, but web ZIP independence/fidelity is incomplete

- `.crate` project backup is implemented at `engine.mjs:19664-19674`.
- GLB export at `project-tools.mjs:233-323` clones scene objects/terrain with GLTFExporter and downloads GLB + a guide; it does not create Unity or Unreal projects. Keep labels limited to supported scene/assets export.
- Legacy `exportAsHTML` obtains current JSON serialization but splits it by `|` (`project-tools.mjs:325-333`) and interprets substrings as basic random primitive commands (`:365-375`), so saved v3 scenes do not reproduce accurately.
- New playable package builds embedded HTML, project JSON, and README in memory (`:752-798`) but downloads only the HTML (`:800-807`), despite declaring three files. No ZIP creation or copied dependent assets.
- Its runtime uses CDN Three.js and external asset host (`:425`, `:456-462`, `:492-494`, `:541-546`). It reconstructs a subset of gameplay systems with a capsule player/placeholders and silently substitutes missing models (`:530-537`, `:556-605`). Imported/cloud asset IDs are not resolved in that exporter; it primarily uses assetPath/assetFile. Scripts are counted/preserved as data but the generated runtime does not run project scripts.

Recommendation: consolidate under one export service. Build a real ZIP with manifest, project backup, runtime, local asset dependency tree and licenses where redistribution is allowed. Report unsupported component/asset conditions explicitly. Add round-trip and offline export verification before promising complete fidelity or independence.

### P1: Account client lacks required persistence and account-security flows

`auth.mjs:40-41` restores sessionStorage only; UI explicitly says session login (`:148`). Client has email/password register/login/me and client-only logout (`:56-89`). No Google auth, verification, reset, account deletion, MFA, refresh/revocation, or device management methods. Error handler blindly `res.json()` without status-aware error normalization (`:49-53`); UI submit has no robust network rejection handling (`:165-177`). Backend architecture/security audit should establish migration strategy; do not layer new owner roles on the current plan strings (`:45-47`).

### P1: Secret storage policy is inconsistent

Main AI/Meshy config migrates secrets into sessionStorage (`engine.mjs:1287`, `:1448-1457`, `:22086-22089`). A separate AI-agent route still stores OpenRouter keys in localStorage (`ai-agent.mjs:1010-1029`) and llm-interpreter sends the stored key to its worker (`llm-interpreter.mjs:23-27`). Publisher owner token and admin token are localStorage capabilities (`engine.mjs:16686-16691`, `:16730-16738`), as is asset owner token (`:19032-19037`). Redact/migrate these consistently, and use backend authorization tied to account identity. Do not print token values in reports.

### P2: Routes/homepage do not match the requested platform

Current homepage is engine-first marketing, with Build 3D games by typing and launch-engine CTA (`index.html:100-119`). No player hero/game sections/search/sidebar/account/favorites/library architecture. Current game detail (`game.html:89-90`, `:123-125`) sends Play to the editor (`/play?published=`) and exposes internal object/component/asset-host metadata (`:128-146`) as primary game content. Marketplace combines a published-game API feed and static asset products (`marketplace.html:380`, `:664`, `:731`), rather than a complete game catalog.

Build entry points (`vite.config.mjs:82-97`) include root, admin, play, compare, creators, demo, features, game, marketplace, pricing, generated tools and docs. No dedicated `/owners-portal`, developer dashboard, user account/library/favorites routes, browser-game player, premium download workflow, waitlist, moderation/report form, or requested developer documentation hierarchy. Existing docs focus on engine commands.

Recommendation: implement the platform shell and service-backed catalog as a parallel boundary while keeping the real editor launch intact. Add explicit route and loading/error/empty-state contracts, and separate the player from the editor.

### P2: Browser HTML sinks and success checks need hardening

- Creator listing name is injected into innerHTML (`creators.html:403`, `:430` onward); main save slot name into innerHTML (`engine.mjs:19702`). Current data often originates locally, but these paths must be safe before accepting server/shared data.
- AI provider connection test accepts any response under 500 as Connection OK, including 401/403 (`ai-settings-ui.mjs:151-153`). Validate authorization using provider-specific safe probes and surface real errors.
- Main share compression uses global string substitution plus `btoa` (`engine.mjs:16611-16637`); it is not a robust JSON/unicode codec and can corrupt token-like user strings. Replace with a versioned UTF-8-safe encoding while preserving legacy decode.
- `play.html:124` synthesizes a 1,247+ random scene count. Remove fabricated usage indicators.

### P2: Duplication/deployment drift and runtime dependency reproducibility

40 mirror files have matching root paths: 34 identical, 6 differ (`_headers`, `demo.html`, `engine.mjs`, `gen_npcs.mjs`, `marketplace.html`, `play.html`). Newer root files are absent from mirror. `scripts/sync-legacy-web.mjs:10-30` fixed include list omits game/admin/404 and `_routes.json`, and copies all root mjs only without `--from-dist`. With `--from-dist`, hashed assets are not included. Treat root as canonical and verify actual Cloudflare deployment path before retiring legacy content.

Vite static copier copies docs and fixed JSON/header/SW assets (`vite.config.mjs:7-25`), and Three is external (`:27-29`, `:66-68`). Rapier/Transformers/Recast/Colyseus/HeadTTS are dynamically CDN loaded (respectively `physics.mjs:21`, `local-ai-tools.mjs:7`, `navmesh.mjs:10`, `multiplayer-colyseus.mjs:5`, `speech-tts.mjs:53`). Local npm pins do not control those remote runtime bytes. Spector uses unversioned external bundle (`debug-tools.mjs:27`) while `spectorjs` is installed. glTF Transform dependencies are used by the optimization script, not dead runtime packages. Do not delete packages merely because browser imports use URLs; consolidate dependency sourcing first.

`_headers:7-8` applies year-long immutable caching to unversioned mjs if raw source is deployed, causing stale code between releases. No main-app CSP appears in `_headers`. `service-worker.js:1-6` is network-first with cache fallback but never writes cache; no registration found in current root app sources. Do not describe it as working offline support.

## Audit/testing caution

`scripts/check-syntax.mjs` checks ES/worker files but not inline HTML scripts. It intentionally ignores the legacy mirror. README's no-regression-suite claim is stale: `scripts/smoke-production.mjs` is 5,000+ lines and performs real publish/import/delete/admin/storage probes (e.g. `:1925`, `:1936`, `:2057`). It is unsuitable as a read-only smoke check. Coordinate isolated local/staging bindings and tests before running it. Current console errors, build warnings, live auth, export round trips and signed-in production behavior remain unverified by this subtask.

## Suggested incremental sequence

1. Establish root deployment/build baseline and isolate new platform work. Preserve original engine/character and current project data; inventory live games/assets before migration.
2. Disable active checkout/revenue claims, stop fake local-public upload success, introduce explicit disabled commerce/ads/creator-program flags.
3. Establish account identity, backend roles, ownership and project service. Migrate all legacy save paths non-destructively.
4. Establish isolated game runtime and SDK before untrusted publishing or owner portal use on a shared origin.
5. Add service-backed player shell/catalog and true game player; then developer upload/quarantine/review/version flows.
6. Consolidate exports with explicit compatibility reporting and downloadable ZIP; validate project round trips and export independence.
7. Remove duplication only after behavior and deployment equivalence are demonstrated. Retain frame/asset budgets and lazy loading.
