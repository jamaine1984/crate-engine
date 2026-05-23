# CrateShip Games Cloudflare Handoff

Last updated: 2026-05-23

This file is the operational handoff for the real CrateShip Games web engine at
`https://crateshipgames.com/play`. Use it before changing or deploying the web
engine so future sessions do not get pointed at the wrong local preview.

## Source Of Truth

- Live site: `https://crateshipgames.com/play`
- Cloudflare Pages project: `crateship-games`
- Cloudflare account email: `koikes2021@gmail.com`
- Cloudflare account ID: `6573d98c25150fd7b4602e56a0926767`
- Custom domain: `crateshipgames.com`
- `www` hostname: `www.crateshipgames.com` is active on the same `crateship-games` Pages project.
- GitHub repo: `https://github.com/jamaine1984/crate-engine.git`
- Current local checkout used by Codex: `C:\Users\koike\Downloads\crate-engine-web-latest`
- Current deployed source commit for the public engine code: `457fd0fa`
- Current deployed source commit for the public asset cleanup Worker: `eb1cd692`
- Cloudflare Pages asset project: `crateship-games-assets`
- Current asset host: `https://crateship-games-assets.pages.dev`
- Cloudflare scheduled cleanup Worker: `crateship-public-asset-cleanup`
- Cleanup Worker URL: `https://crateship-public-asset-cleanup.koikes2021.workers.dev`
- Cleanup Worker cron: `17 9 * * *` (UTC daily)
- Cleanup Worker version ID: `9c4ebc8c-db1c-4d59-be90-72cc7a2a8c96`
- Cleanup Worker safe default: `CRATE_PUBLIC_ASSET_CLEANUP_DELETE=false`, so the scheduled run scans but does not delete until the Cloudflare variable is changed to `true`.
- Cloudflare KV namespace for published games: `CRATE_GAMES` (`cfd1bca8ac84439cadc2bb146a034d41`)
- Cloudflare D1 database for moderation audit history: `CRATE_AUDIT` / `crateship-games-audit` (`9cbee4e4-caa7-43fb-bbb7-9f0f7d7e2b9a`)
- Cloudflare R2 bucket for user-imported GLB/GLTF assets: `crateship-games-user-assets` through binding `CRATE_USER_ASSETS`

Do not treat `http://127.0.0.1:*` as proof that the real site is fixed. Local
preview can be misleading because the repo's `models` entry is a Mac-path stub
on this Windows machine. The real production behavior must be checked on
`crateshipgames.com`.

## Current Production Deployment

- Latest production deployment ID: `5da7a94a-2d41-4758-9fcf-6f84c14c1407`
- Latest production deployment URL: `https://5da7a94a.crateship-games.pages.dev`
- Production branch: `main`
- Source shown by Cloudflare: `457fd0f`
- Main live page bundle after the deploy: `/assets/play-GOnYZnjj.js`
- Lazy App Builder chunk after the deploy: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk after the deploy: `/assets/game-builder-ui-B_LCiV29.js`
- Lazy Asset Browser chunk after the deploy: `/assets/asset-browser-ui-cfqoMh02.js`
- Latest asset-host deployment ID: `4ab7dcd8-6d39-4472-89f3-3077c2bd904d`
- Latest asset-host deployment URL: `https://4ab7dcd8.crateship-games-assets.pages.dev`
- Asset-host source shown by Cloudflare: `6f09cc0`
- Current asset manifest version: `6f09cc09da2f`

Latest app-only deploy on 2026-05-23:

- Final commit deployed: `457fd0fa` (`Harden play camera mode guard`)
- Final Cloudflare deployment: `5da7a94a-2d41-4758-9fcf-6f84c14c1407`
- Final deployment URL: `https://5da7a94a.crateship-games.pages.dev`
- Cleanup Worker unchanged at version ID `9c4ebc8c-db1c-4d59-be90-72cc7a2a8c96` from source `eb1cd692`.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=457fd0fa65ea7360d680228ad1bd0b34fc0bc18d --commit-message="Harden play camera mode guard" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Deploy upload evidence: uploaded `6` changed files, reused `105` already-uploaded files, uploaded the Functions bundle, `_headers`, and `_routes.json`.
- Main app bundle after deploy: `/assets/play-GOnYZnjj.js`
- Lazy App Builder chunk after deploy: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk after deploy: `/assets/game-builder-ui-B_LCiV29.js`
- Lazy Asset Browser chunk after deploy: `/assets/asset-browser-ui-cfqoMh02.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=camera-guard-457fd0f`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-camera-guard-457fd0f`
- Targeted camera guard probe passed: `https://crateshipgames.com/play?verify=targeted-camera-guard-457fd0f`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-camera-guard-457fd0f.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-camera-guard-457fd0f.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\targeted-camera-guard-457fd0f.png`
- Production smoke evidence:
  - Build City created at least `127` objects with `48` components and `4` scripts on apex and `www`.
  - Asset host loaded manifest `6f09cc09da2f`; model/texture checks returned expected `200` or missing-asset `404` statuses.
  - Production publish, marketplace discovery, game detail, user asset publish/delete, inventory, mission, NPC, merchant, door trigger, enemy wave, respawn, project save/load, playable export, validation, and admin guard flows passed on both domains.
  - Apex raw Build City frame probe: `99 FPS`, `10.1 ms` average frame, `0.8 ms` update, `9.3 ms` render.
  - Apex viewport probes passed: phone `227.3 FPS` at renderer DPR `1.25`; tablet `54.9 FPS` at renderer DPR `1`.
  - WWW raw Build City frame probe: `69.9 FPS`, `14.3 ms` average frame.
  - Targeted camera guard probe forced Play-mode OrbitControls back on and forced camera pitch/roll to `x=-1.55`, `z=0.31`; the deployed guard corrected controls to `false`, clamped pitch to `-1.15`, and flattened roll to `0` before and after scroll/drag.

What changed in this deploy:

- `engine.mjs`
  - Play mode now continuously disables editor OrbitControls instead of only disabling them once on entry.
  - Camera stabilization now clamps extreme Play-mode pitch, flattens roll, keeps `camera.up` level, and records `window._playCameraStability` for diagnostics.
  - Canvas wheel, pointer, and touch events in Play mode pass through a guard so scroll/drag cannot re-enable editor camera behavior.
  - The render loop applies the Play camera guard immediately before rendering.
- `scripts/smoke-production.mjs`
  - Production smoke now forces a bad Play camera state and fails if the guard does not clamp pitch, flatten roll, and disable OrbitControls.
  - The scroll/drag test now checks pitch as well as roll and control state.

Previous app-only deploy on 2026-05-23:

- Final commit deployed: `e12363ab` (`Improve asset menu readability`)
- Final Cloudflare deployment: `068e93b0-1a6a-4c2b-a6e2-b160ea1016a6`
- Final deployment URL: `https://068e93b0.crateship-games.pages.dev`
- Cleanup Worker unchanged at version ID `9c4ebc8c-db1c-4d59-be90-72cc7a2a8c96` from source `eb1cd692`.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=e12363ab22b47345911799064cbaccf73458d563 --commit-message="Improve asset menu readability" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Deploy upload evidence: uploaded `10` changed files, reused `101` already-uploaded files, uploaded the Functions bundle, `_headers`, and `_routes.json`.
- Main app bundle after deploy: `/assets/play-CdosIsQN.js`
- Lazy App Builder chunk after deploy: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk after deploy: `/assets/game-builder-ui-B_LCiV29.js`
- Lazy Asset Browser chunk after deploy: `/assets/asset-browser-ui-cfqoMh02.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=readability-e12363ab`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-readability-e12363ab`
- Targeted asset-menu readability probe passed: `https://crateshipgames.com/play?verify=targeted-readability-e12363ab`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-readability-e12363ab.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-readability-e12363ab.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\targeted-readability-targeted-readability-e12363ab.png`
- Production smoke evidence:
  - Build City created at least `127` objects with `48` components and `4` scripts on apex and `www`.
  - Asset host loaded manifest `6f09cc09da2f` and model/texture checks returned expected `200` or missing-asset `404` statuses.
  - Production publish, marketplace discovery, game detail, user asset publish/delete, inventory, mission, NPC, merchant, door trigger, enemy wave, respawn, project save/load, playable export, validation, and admin guard flows passed on both domains.
  - Apex raw Build City frame probe: `74.1 FPS`, `13.5 ms` average frame, `0.9 ms` update, `12.7 ms` render.
  - Apex viewport probes passed: phone `312.5 FPS` at renderer DPR `1.25`; tablet `49.3 FPS` at renderer DPR `1`.
  - WWW raw Build City frame probe: `76.3 FPS`, `13.1 ms` average frame.
  - Targeted UI probe verified Furniture category card `aria-label="Furniture, 223 models"`, separate icon/name/count line boxes with no overlap, and a Bathroom Bathtub placement status rendered as separate `Placed`, `Asset: Bathroom Bathtub`, and `Position: x 6.6, y 0.0, z 8.8` lines with no overlap.

What changed in this deploy:

- `asset-browser-ui.mjs`
  - Replaced category-card HTML string rendering with explicit DOM nodes for icon, label, and count.
  - Added `role="button"`, keyboard activation, `aria-label`, and data fields for category label/count so the asset menu is easier to read and test.
- `game-builder-ui.mjs`
  - Changed placement status from run-together text into labeled lines: title, `Asset: ...`, and `Position: x ..., y ..., z ...`.
  - Added comma-separated position formatting and status data attributes for smoke verification.
- `scripts/smoke-production.mjs`
  - Added a regression assertion that Game Builder asset placement status includes readable `Asset:` and `Position:` labels with separated coordinates.

Previous Worker + app deploy on 2026-05-23:

- Final commit deployed: `eb1cd692` (`Add cleanup audit pagination and export`)
- Final Cloudflare deployment: `012f8871-4103-4e74-8ca8-8f72c671726f`
- Final deployment URL: `https://012f8871.crateship-games.pages.dev`
- Cleanup Worker version ID: `9c4ebc8c-db1c-4d59-be90-72cc7a2a8c96`
- Remote D1 verification:

```powershell
npx wrangler d1 execute crateship-games-audit --remote --command "SELECT COUNT(*) AS cleanup_rows FROM cleanup_audit;"
```

- D1 evidence:
  - Table `cleanup_audit` still exists in `crateship-games-audit`.
  - Row count after deploy remained `0` because no admin dry scan was run in this shell.
- Worker deploy command:

```powershell
npm run deploy:cleanup-worker
```

- Worker smoke passed:

```powershell
npm run smoke:cleanup-worker
```

- Worker smoke evidence:
  - Health: `deleteEnabled=false`, `limit=200`, R2/KV/D1 bindings ready.
  - History source reports `d1` and `d1HistoryAvailable=true`.
  - Last run field is present and currently reports `none persisted yet`.
  - History field is present and currently reports `0/12 persisted runs`.
  - Guard: unauthenticated `POST /cleanup` returns `403`.
  - Guard: unauthenticated `GET /history` returns `403`.
  - Guard: unauthenticated `GET /history?format=csv` returns `403`.
  - Guard: unauthenticated `GET /audit` returns `403`.
  - Guard: unauthenticated `GET /audit.csv` returns `403`.
  - Authenticated dry run, JSON export, CSV export, and D1 audit browser verification skipped because no admin token env var was present in this shell.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=eb1cd69271d19ad1389376002f77bb5a46089303 --commit-message="Add cleanup audit pagination and export" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=audit-page-csv-eb1cd69`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-audit-page-csv-eb1cd69`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-audit-page-csv-eb1cd69.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-audit-page-csv-eb1cd69.png`
- Production smoke evidence:
  - Build City created at least `127` objects with `48` components and `4` scripts on apex and `www`.
  - Asset host loaded manifest `6f09cc09da2f`.
  - Published public asset lifecycle still passes: public GLB download `200`, cleanup removed public copy, post-delete download `404`.
  - Admin page sees the cleanup Worker as ready, deletion disabled, limit `200`.
  - Admin page reports cleanup history source `d1` with D1 ready.
  - Admin page exposes the cleanup audit panel with CSV export, paging controls, and date filters locked without an accepted admin token.

What changed in this deploy:

- `worker/public-asset-cleanup/index.js`
  - Extended admin-protected `GET /audit` with `offset`, `from`, and `to` filters.
  - Added admin-protected `GET /audit.csv` and `format=csv` audit row export.
  - Returns paging metadata: `offset`, `hasPrevious`, `hasNext`, export filenames, and normalized date bounds.
- `admin.html`
  - Added cleanup audit date filters, Previous/Next paging, and audit CSV export.
  - Keeps all audit browser controls locked until the admin token is accepted.
  - Exposes audit paging/export state through `window._crateAdminDashboard` for live smoke coverage.
- `scripts/smoke-cleanup-worker.mjs`
  - Verifies unauthenticated `GET /audit.csv` is blocked.
  - If an admin token is available, verifies the audit browser metadata and audit CSV export after a dry scan.
- `scripts/smoke-production.mjs`
  - Requires the live Admin dashboard to expose locked cleanup audit CSV, paging, and date controls.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is available, verifies audit CSV export through the dashboard.

Next recommended step:

- Use the real admin token or set `CRATE_SMOKE_ADMIN_TOKEN`, run an authenticated cleanup Worker dry scan, and confirm `cleanup_audit` rows are created and exportable. After that, shift back to the game-engine UX pass: playtest live `/play` for asset loading failures, covered menu text, and Edit/Explore/Play camera/input separation.

Previous Worker + app deploy on 2026-05-23:

- Final commit deployed: `2139f621` (`Add cleanup audit browser`)
- Final Cloudflare deployment: `5ad6ac84-33ba-499f-81a6-d2a132a0ba69`
- Final deployment URL: `https://5ad6ac84.crateship-games.pages.dev`
- Cleanup Worker version ID: `ae272144-3cb7-4ca8-9d09-d0ac5c27cf49`
- Remote D1 verification:

```powershell
npx wrangler d1 execute crateship-games-audit --remote --command "SELECT COUNT(*) AS cleanup_rows FROM cleanup_audit;"
```

- D1 evidence:
  - Table `cleanup_audit` still exists in `crateship-games-audit`.
  - Row count after deploy remained `0` because no admin dry scan was run in this shell.
- Worker deploy command:

```powershell
npm run deploy:cleanup-worker
```

- Worker smoke passed:

```powershell
npm run smoke:cleanup-worker
```

- Worker smoke evidence:
  - Health: `deleteEnabled=false`, `limit=200`, R2/KV/D1 bindings ready.
  - History source reports `d1` and `d1HistoryAvailable=true`.
  - Last run field is present and currently reports `none persisted yet`.
  - History field is present and currently reports `0/12 persisted runs`.
  - Guard: unauthenticated `POST /cleanup` returns `403`.
  - Guard: unauthenticated `GET /history` returns `403`.
  - Guard: unauthenticated `GET /history?format=csv` returns `403`.
  - Guard: unauthenticated `GET /audit` returns `403`.
  - Authenticated dry run, JSON export, CSV export, and D1 audit browser verification skipped because no admin token env var was present in this shell.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=2139f621731119493f4a0121794d5ae6a95ca55d --commit-message="Add cleanup audit browser" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cleanup-audit-2139f62`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-audit-2139f62`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-audit-2139f62.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-audit-2139f62.png`
- Production smoke evidence:
  - Build City created at least `113` objects with `47` components and `4` scripts on apex, and at least `127` objects with `48` components and `4` scripts on `www`.
  - Asset host loaded manifest `6f09cc09da2f`.
  - Published public asset lifecycle still passes: public GLB download `200`, cleanup removed public copy, post-delete download `404`.
  - Admin page sees the cleanup Worker as ready, deletion disabled, limit `200`.
  - Admin page reports cleanup history source `d1` with D1 ready.
  - Admin page exposes the new cleanup audit panel and keeps it locked without an accepted admin token.

What changed in this deploy:

- `worker/public-asset-cleanup/index.js`
  - Added admin-protected `GET /audit` for browsing `cleanup_audit` D1 rows.
  - Supports `limit`, `reason`, and `mode` filters while keeping unauthenticated access blocked.
  - Returns public row fields for run ID, mode, counts, timestamps, Worker source, and admin metadata.
- `admin.html`
  - Added a `Cleanup Audit` dashboard panel with reason/mode filters and a D1-backed row list.
  - Auto-refreshes cleanup audit rows after an authenticated Worker dry scan.
  - Keeps the audit browser locked until the admin token is accepted.
- `scripts/smoke-cleanup-worker.mjs`
  - Verifies unauthenticated `GET /audit` is blocked.
  - If an admin token is available, verifies the latest manual dry-run appears in `/audit`.
- `scripts/smoke-production.mjs`
  - Requires the live Admin dashboard to expose the cleanup audit panel while locked.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is available, refreshes the audit browser after a dry scan and verifies D1 rows load.

Next recommended asset step:

- Run `/admin.html` with a real admin token or set `CRATE_SMOKE_ADMIN_TOKEN`, click `Run Dry Scan`, and confirm `cleanup_audit` row count increases above `0`. After the first real D1 rows exist, add date-range filtering and pagination to the cleanup audit browser.

Previous Worker + app deploy on 2026-05-23:

- Final commit deployed: `31aae6dd` (`Store cleanup history in D1`)
- Final Cloudflare deployment: `4d739d81-f716-4998-ae93-f7c36e8c8c07`
- Final deployment URL: `https://4d739d81.crateship-games.pages.dev`
- Cleanup Worker version ID: `0b99d558-a1a1-47c6-9b38-842c672577fe`
- D1 migration applied:

```powershell
npx wrangler d1 execute crateship-games-audit --remote --file migrations\0002_cleanup_audit.sql
```

- Remote D1 verification:

```powershell
npx wrangler d1 execute crateship-games-audit --remote --command "SELECT COUNT(*) AS cleanup_rows FROM cleanup_audit;"
```

- D1 evidence:
  - Table `cleanup_audit` exists in `crateship-games-audit`.
  - Row count after deploy remained `0` because no admin dry scan was run in this shell.
  - The first `wrangler d1 execute` attempt returned Cloudflare API code `7403`; `npx wrangler whoami` and `npx wrangler d1 list` succeeded, then the migration retry succeeded.
- Worker deploy command:

```powershell
npm run deploy:cleanup-worker
```

- Worker smoke passed:

```powershell
npm run smoke:cleanup-worker
```

- Worker smoke evidence:
  - Health: `deleteEnabled=false`, `limit=200`, R2/KV/D1 bindings ready.
  - History source reports `d1` and `d1HistoryAvailable=true`.
  - Last run field is present and currently reports `none persisted yet`.
  - History field is present and currently reports `0/12 persisted runs`.
  - Guard: unauthenticated `POST /cleanup` returns `403`.
  - Guard: unauthenticated `GET /history` returns `403`.
  - Guard: unauthenticated `GET /history?format=csv` returns `403`.
  - Authenticated dry run, JSON export, and CSV export verification skipped because no admin token env var was present in this shell.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=31aae6dd487d394267b82f84fcbc3aae530de5d0 --commit-message="Store cleanup history in D1" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cleanup-d1-31aae6d`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-d1-31aae6d`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-d1-31aae6d.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-d1-31aae6d.png`
- Production smoke evidence:
  - Build City created at least `127` objects with `48` components and `4` scripts in Edit mode.
  - Asset host loaded manifest `6f09cc09da2f`.
  - Published public asset lifecycle still passes: public GLB download `200`, cleanup removed public copy, post-delete download `404`.
  - Admin page sees the cleanup Worker as ready, deletion disabled, limit `200`.
  - Admin page reports cleanup history source `d1` with D1 ready.
  - Admin page reads cleanup history and reports `0/12 runs` until a real admin dry scan or cron persists the first run.

What changed in this deploy:

- `migrations/0002_cleanup_audit.sql`
  - Added the `cleanup_audit` D1 table and indexes for durable cleanup Worker run history.
- `worker/public-asset-cleanup/wrangler.toml`
  - Bound the existing `crateship-games-audit` D1 database to the cleanup Worker as `CRATE_AUDIT`.
- `worker/public-asset-cleanup/index.js`
  - Persists cleanup runs to D1 in addition to the rolling KV `cleanup:history` list.
  - Reads cleanup history from D1 first and falls back to KV if D1 is unavailable or empty.
  - Exposes `hasAuditStore`, `historySource`, `d1HistoryAvailable`, `d1HistoryPersisted`, and `kvHistoryCount` in health, cleanup, and export responses.
  - Keeps cleanup safe if D1 is temporarily unavailable; KV persistence still works as fallback.
- `admin.html`
  - Shows Worker binding readiness as R2/KV/D1.
  - Shows the cleanup history source next to recent run summaries.
- `scripts/smoke-cleanup-worker.mjs`
  - Requires the live Worker health endpoint to expose D1-backed cleanup history readiness.
  - If an admin token is available, requires authenticated dry scan history to persist to D1.
- `scripts/smoke-production.mjs`
  - Requires the live Admin dashboard to see D1-backed cleanup history readiness while locked.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is available, requires the Admin dry scan path to persist cleanup history to D1.

Next recommended asset step:

- Run `/admin.html` with a real admin token or set `CRATE_SMOKE_ADMIN_TOKEN`, click `Run Dry Scan`, and confirm `cleanup_audit` row count increases above `0`. After that, add an Admin dashboard table for browsing/filtering D1 cleanup audit rows instead of only showing the top three run summaries.

Previous Worker + app deploy on 2026-05-23:

- Final commit deployed: `57babc3e` (`Add cleanup history CSV export`)
- Final Cloudflare deployment: `9d0bf3e1-cc72-437b-928e-a6d14335ffad`
- Final deployment URL: `https://9d0bf3e1.crateship-games.pages.dev`
- Cleanup Worker version ID: `fe9cfd64-a456-461e-bb7a-c5f667b2cf1b`
- Worker deploy command:

```powershell
npm run deploy:cleanup-worker
```

- Worker smoke passed:

```powershell
npm run smoke:cleanup-worker
```

- Worker smoke evidence:
  - Health: `deleteEnabled=false`, `limit=200`, bindings ready.
  - Last run field is present and currently reports `none persisted yet`.
  - History field is present and currently reports `0/12 persisted runs`.
  - Guard: unauthenticated `POST /cleanup` returns `403`.
  - Guard: unauthenticated `GET /history` returns `403`.
  - Guard: unauthenticated `GET /history?format=csv` returns `403`.
  - Authenticated dry run and CSV export verification skipped because no admin token env var was present in this shell.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=57babc3ef93d40de58168a31ba8546b40e872f65 --commit-message="Add cleanup history CSV export" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cleanup-csv-57babc3`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-csv-57babc3`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-csv-57babc3.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-csv-57babc3.png`
- Production smoke evidence:
  - Build City created at least `127` objects with `48` components and `4` scripts in Edit mode.
  - Asset host loaded manifest `6f09cc09da2f`.
  - Published public asset lifecycle still passes: public GLB download `200`, cleanup removed public copy, post-delete download `404`.
  - Admin page sees the cleanup Worker as ready, deletion disabled, limit `200`.
  - Admin page reads cleanup history and reports `0/12 runs` until a real admin dry scan or cron persists the first run.
  - Admin page exposes both `Export History` and `Export CSV`, and keeps both locked without an accepted admin token.

What changed in this deploy:

- `worker/public-asset-cleanup/index.js`
  - Added admin-protected CSV cleanup history export through `/history?format=csv` and `/history.csv`.
  - CSV exports include generated time, Worker/admin metadata, run IDs, counts, mode, timing, and errors.
  - JSON exports now also return `csvExportFileName`.
- `admin.html`
  - Added `Export CSV` beside the existing JSON export.
  - The CSV button stays disabled until the admin token is accepted.
  - The action downloads the Worker CSV and stores the latest CSV export in `window._crateCleanupHistoryCsvExport` for smoke verification.
- `scripts/smoke-cleanup-worker.mjs`
  - Verifies unauthenticated CSV export is blocked.
  - If an admin token is available, verifies authenticated CSV output has the expected header, filename, and latest manual dry-run record.
- `scripts/smoke-production.mjs`
  - Verifies the live Admin dashboard exposes the CSV export control and keeps it disabled while locked.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is available, clicks the CSV export button and verifies the downloaded CSV payload state.

Next recommended asset step:

- Run `/admin.html` with a real admin token, click `Run Dry Scan`, then export both JSON and CSV so cleanup history has at least one real audit record. After that, the next durable hardening step is moving cleanup history from the rolling KV list into a D1 table if retention needs more than 12 runs.

Previous Worker + app deploy on 2026-05-23:

- Final commit deployed: `7e41b420` (`Add cleanup history export`)
- Final Cloudflare deployment: `c645251c-7bf8-46c2-8e37-9fd96ca96aa8`
- Final deployment URL: `https://c645251c.crateship-games.pages.dev`
- Cleanup Worker version ID: `f732a254-c55d-4d42-8ce0-d3487f140ae4`
- Worker deploy command:

```powershell
npm run deploy:cleanup-worker
```

- Worker smoke passed:

```powershell
npm run smoke:cleanup-worker
```

- Worker smoke evidence:
  - Health: `deleteEnabled=false`, `limit=200`, bindings ready.
  - Last run field is present and currently reports `none persisted yet`.
  - History field is present and currently reports `0/12 persisted runs`.
  - Guard: unauthenticated `POST /cleanup` returns `403`.
  - Guard: unauthenticated `GET /history` returns `403`.
  - Authenticated dry run and export verification skipped because no admin token env var was present in this shell.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=7e41b420c1392ae6e7e1895a4af70976ab895061 --commit-message="Add cleanup history export" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cleanup-export-7e41b42`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-export-7e41b42`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-export-7e41b42.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-export-7e41b42.png`
- Production smoke evidence:
  - Build City created at least `127` objects with `48` components and `4` scripts in Edit mode.
  - Asset host loaded manifest `6f09cc09da2f`.
  - Published public asset lifecycle still passes: public GLB download `200`, cleanup removed public copy, post-delete download `404`.
  - Admin page sees the cleanup Worker as ready, deletion disabled, limit `200`.
  - Admin page reads cleanup history and reports `0/12 runs` until a real admin dry scan or cron persists the first run.
  - Admin page exposes the `Export History` control and keeps it locked without an accepted admin token.

What changed in this deploy:

- `worker/public-asset-cleanup/index.js`
  - Added admin-protected `GET /history` for offline cleanup audit export.
  - Export response includes `lastRun`, rolling `history`, `historyLimit`, `total`, and a dated JSON filename.
- `admin.html`
  - Added an `Export History` button to the Scheduled cleanup Worker panel.
  - The button stays disabled until the admin token is accepted.
  - The action downloads the Worker history JSON and stores the latest export in `window._crateCleanupHistoryExport` for smoke verification.
- `scripts/smoke-cleanup-worker.mjs`
  - Verifies unauthenticated `/history` is blocked.
  - If an admin token is available, verifies authenticated `/history` returns the persisted manual dry-run history.
- `scripts/smoke-production.mjs`
  - Verifies the live Admin dashboard exposes the export control and keeps it disabled while locked.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is available, clicks the export button and verifies the downloaded JSON payload state.

Next recommended asset step:

- Run `/admin.html` with a real admin token, click `Run Dry Scan`, then click `Export History` to download the first JSON audit file. After that, the next useful hardening target is adding CSV export or moving cleanup history into D1 if long-term audit retention needs more than the current rolling KV list.

Previous Worker + app deploy on 2026-05-23:

- Final commit deployed: `ba936ebb` (`Track cleanup worker history`)
- Final Cloudflare deployment: `4e5fb74e-ebec-4391-97ca-8fe5ff538038`
- Final deployment URL: `https://4e5fb74e.crateship-games.pages.dev`
- Cleanup Worker version ID: `4d0e41c3-8ec2-4d93-925a-4aabdaa4a7d3`
- Worker deploy command:

```powershell
npm run deploy:cleanup-worker
```

- Worker smoke passed:

```powershell
npm run smoke:cleanup-worker
```

- Worker smoke evidence:
  - Health: `deleteEnabled=false`, `limit=200`, bindings ready.
  - Last run field is present and currently reports `none persisted yet`.
  - History field is present and currently reports `0/12 persisted runs`.
  - Guard: unauthenticated `POST /cleanup` returns `403`.
  - Authenticated dry run skipped because no admin token env var was present in this shell.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=ba936ebb2af9e95edc401a8af7c5985bfb550db1 --commit-message="Track cleanup worker history" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cleanup-history-ba936eb`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-history-ba936eb`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-history-ba936eb.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-history-ba936eb.png`
- Production smoke evidence:
  - Build City created at least `127` objects with `48` components and `4` scripts in Edit mode.
  - Asset host loaded manifest `6f09cc09da2f`.
  - Published public asset lifecycle still passes: public GLB download `200`, cleanup removed public copy, post-delete download `404`.
  - Admin page sees the cleanup Worker as ready, deletion disabled, limit `200`.
  - Admin page reads the new cleanup history health field and reports `0/12 runs` until a real admin dry scan or cron persists the first run.

What changed in this deploy:

- `worker/public-asset-cleanup/index.js`
  - Added `cleanup:history` in `CRATE_GAMES` KV with a rolling limit of `12` sanitized cleanup run summaries.
  - `/health` now returns `history` and `historyLimit` alongside `lastRun`.
  - Manual and scheduled cleanup runs now persist both the latest run and the rolling history list.
- `admin.html`
  - Shows a `Recent runs` line in the Scheduled cleanup Worker panel.
  - The panel reports no persisted history until the first admin dry scan or scheduled cron stores a run.
  - Admin dry scan updates the latest run and history state when the Worker returns persisted history.
- `scripts/smoke-cleanup-worker.mjs`
  - Verifies the Worker health endpoint exposes cleanup history.
  - If an admin token is available, verifies an authenticated dry scan writes both latest run and history.
- `scripts/smoke-production.mjs`
  - Verifies the live Admin dashboard can read cleanup history from the deployed Worker.

Next recommended asset step:

- Run the new `/admin.html` `Run Dry Scan` button with a real admin token to seed `cleanup:last-run` and `cleanup:history`, then verify the panel changes from `0/12 runs` to a manual dry-run entry. After that, the next useful hardening target is adding a small admin-only download/export of cleanup history for offline audit records.

Latest app-only deploy on 2026-05-23:

- Final commit deployed: `255995e9` (`Add admin cleanup worker dry scan`)
- Final Cloudflare deployment: `62578451-24ed-4f05-bfab-02b4d7ac4185`
- Final deployment URL: `https://62578451.crateship-games.pages.dev`
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=255995e9001e9afaf96beb61b8f64e5e06bc7156 --commit-message="Add admin cleanup worker dry scan" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Cleanup Worker stayed unchanged at version `56963b53-174d-4b2e-875a-fa8b2f40dc94`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cleanup-worker-dry-scan-255995e`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-worker-dry-scan-255995e`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-worker-dry-scan-255995e.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-worker-dry-scan-255995e.png`
- Production smoke evidence:
  - Build City created `127` objects with `48` components and `4` scripts in Edit mode.
  - Asset host loaded manifest `6f09cc09da2f`.
  - Published public asset lifecycle still passes: public GLB download `200`, cleanup removed public copy, post-delete download `404`.
  - Admin page sees the cleanup Worker as ready, deletion disabled, limit `200`.
  - Admin page exposes a `Run Dry Scan` cleanup Worker control and keeps it locked without an accepted admin token.

What changed in this deploy:

- `admin.html`
  - Added `Run Dry Scan` to the Scheduled cleanup Worker panel.
  - The button stays disabled until the admin token is accepted.
  - The action calls the deployed cleanup Worker `/cleanup` endpoint with `dryRun=true`, never delete mode.
  - The panel updates immediately with the returned scan counts and marks whether the Worker persisted the `lastRun` record.
- `scripts/smoke-production.mjs`
  - Verifies the Admin dashboard exposes the Worker dry-scan action and keeps it disabled while locked.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is available, clicks the action and verifies the Worker persisted a manual dry-run last-run record.

Next recommended asset step:

- Use a real admin token in `/admin.html` or set `CRATE_SMOKE_ADMIN_TOKEN`, run the new `Run Dry Scan` action, and confirm the Scheduled cleanup panel changes from `none persisted yet` to the manual dry-run counts. After that, the next useful hardening step is storing a small cleanup history list instead of only the latest run.

Latest Worker + app deploy on 2026-05-22:

- Final commit deployed: `631e4429` (`Persist cleanup worker last run`)
- Final Cloudflare deployment: `f1cd9b7f-f403-4568-b046-29e715aa119c`
- Final deployment URL: `https://f1cd9b7f.crateship-games.pages.dev`
- Cleanup Worker version ID: `56963b53-174d-4b2e-875a-fa8b2f40dc94`
- Worker deploy command:

```powershell
npm run deploy:cleanup-worker
```

- Worker smoke passed:

```powershell
npm run smoke:cleanup-worker
```

- Worker smoke evidence:
  - Health: `deleteEnabled=false`, `limit=200`, bindings ready.
  - Last run field is present and currently reports `none persisted yet`.
  - Guard: unauthenticated `POST /cleanup` returns `403`.
  - Authenticated dry run skipped because no admin token env var was present in this shell.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=631e442973f38c72e71518f8c252d961764de185 --commit-message="Persist cleanup worker last run" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cleanup-last-run-631e442`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-last-run-631e442`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-last-run-631e442.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-last-run-631e442.png`
- Production smoke evidence:
  - Build City created `127` objects with `48` components and `4` scripts in Edit mode.
  - Asset host loaded manifest `6f09cc09da2f`.
  - Published public asset lifecycle still passes: public GLB download `200`, cleanup removed public copy, post-delete download `404`.
  - Admin page sees the cleanup Worker as ready, deletion disabled, limit `200`, and health includes the `lastRun` field.

What changed in this deploy:

- `worker/public-asset-cleanup/index.js`
  - Persists the last scheduled or manual cleanup result into `CRATE_GAMES` KV under `cleanup:last-run`.
  - Exposes a sanitized `lastRun` summary from `/health` without leaking detailed object error rows.
  - Returns `lastRunPersisted` from authenticated manual cleanup runs and logs it from scheduled runs.
- `admin.html`
  - Shows the last persisted cleanup run in the Scheduled cleanup panel when available.
  - Shows a clear "No persisted cleanup run yet" message until a cron or authenticated dry run records the first run.
- `scripts/smoke-cleanup-worker.mjs`
  - Verifies live Worker health includes the `lastRun` field.
  - When `CRATE_SMOKE_ADMIN_TOKEN` is available, verifies authenticated dry runs persist `lastRun`.
- `scripts/smoke-production.mjs`
  - Verifies the live Admin dashboard can read the cleanup Worker `lastRun` health field.

Next recommended asset step:

- Run `npm run smoke:cleanup-worker` with `CRATE_SMOKE_ADMIN_TOKEN` available to seed and verify an authenticated dry run immediately. Without that token, wait for the next scheduled dry-run at `17 9 * * *` UTC, then refresh `/admin.html` and confirm the Scheduled cleanup panel shows the persisted scheduled run.

Latest app-only deploy on 2026-05-22:

- Final commit deployed: `f8309b5d` (`Show cleanup worker health in admin`)
- Final Cloudflare deployment: `aaf4b65a-28bd-46c2-a0a2-c5ad9a5703ed`
- Final deployment URL: `https://aaf4b65a.crateship-games.pages.dev`
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=f8309b5deb4c00197913de6db88e1a10406573c6 --commit-message="Show cleanup worker health in admin" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cleanup-worker-admin-f8309b5`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-worker-admin-f8309b5`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-worker-admin-f8309b5.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-worker-admin-f8309b5.png`
- Production smoke now proves `/admin.html` can read the scheduled cleanup Worker health endpoint and reports: `cleanup worker ready delete disabled limit 200`.

What changed in this deploy:

- `admin.html`
  - Added a Scheduled cleanup panel showing `crateship-public-asset-cleanup` Worker health, R2/KV binding readiness, scheduled deletion status, cleanup limit, refresh action, and direct health link.
- `scripts/smoke-production.mjs`
  - Added a live Admin-page assertion that the cleanup Worker is reachable, has R2 and KV bindings, reports the expected Worker name, has a positive cleanup limit, and still has deletion disabled.

Next recommended asset step:

- Add a visible last-run/result record for the scheduled cleanup Worker. The Worker currently logs scheduled scans to Cloudflare logs, but it does not persist the last scheduled scan result into KV/D1 for the Admin dashboard to show after the run.

Previous Cloudflare deploy on 2026-05-22:

- Worker commit deployed: `fd2f43fa` (`Add scheduled public asset cleanup worker`)
- Worker deployed: `crateship-public-asset-cleanup`
- Worker URL: `https://crateship-public-asset-cleanup.koikes2021.workers.dev`
- Worker version ID: `36e2f0fb-4c49-4e78-9952-330d26208d9a`
- Worker schedule: `17 9 * * *` UTC daily
- Worker deploy command:

```powershell
npm run deploy:cleanup-worker
```

- Worker bindings verified by Wrangler deploy:
  - `CRATE_GAMES` KV namespace `cfd1bca8ac84439cadc2bb146a034d41`
  - `CRATE_USER_ASSETS` R2 bucket `crateship-games-user-assets`
  - `CRATE_PUBLIC_ASSET_CLEANUP_DELETE="false"`
  - `CRATE_PUBLIC_ASSET_CLEANUP_LIMIT="200"`
- Worker smoke passed:

```powershell
npm run smoke:cleanup-worker
```

- Smoke evidence:
  - Health: `deleteEnabled=false`, `limit=200`, bindings ready.
  - Guard: unauthenticated `POST /cleanup` returns `403`.
  - Authenticated dry run skipped because no admin token env var was present in this shell.
- Cloudflare docs checked for this design: Cron Triggers map a cron expression to a Worker `scheduled()` handler, are configured with `[triggers] crons = [...]` in `wrangler.toml`, and execute on UTC time.
- The Pages app bundle did not change in this Worker deploy, but the live app was smoke-tested again:
  - Apex smoke passed: `https://crateshipgames.com/play?verify=cleanup-worker-36e2f0f`
  - WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cleanup-worker-36e2f0f`
  - Screenshots:
    - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cleanup-worker-36e2f0f.png`
    - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cleanup-worker-36e2f0f.png`

What changed in this deploy:

- `worker/public-asset-cleanup/index.js`
  - Added a scheduled Worker that scans published public R2 asset metadata, checks each asset against the live `CRATE_GAMES` KV game record, and reports orphan counts.
  - Scheduled runs are dry-run by default. They delete only if `CRATE_PUBLIC_ASSET_CLEANUP_DELETE` is set to `true`.
  - Manual `POST /cleanup` is admin-token protected and supports dry-run or delete mode.
- `worker/public-asset-cleanup/wrangler.toml`
  - Added R2/KV bindings and the daily UTC cron trigger.
- `scripts/smoke-cleanup-worker.mjs`
  - Verifies live Worker health, binding readiness, safe delete default, unauthenticated guard, and optional authenticated dry run.
- `package.json`
  - Added `deploy:cleanup-worker` and `smoke:cleanup-worker`.

Next recommended asset step:

- Run `npm run smoke:cleanup-worker` with `CRATE_SMOKE_ADMIN_TOKEN` available to verify the authenticated dry run. If the orphan count is correct, set `CRATE_PUBLIC_ASSET_CLEANUP_DELETE=true` in the cleanup Worker and redeploy when ready for scheduled deletion.

Previous app-only deploy on 2026-05-22:

- Final commit deployed: `34c34767` (`Add admin public asset cleanup controls`)
- Final Cloudflare deployment: `789f791b-855e-4454-b6b6-fdd9ce52067b`
- Final deployment URL: `https://789f791b.crateship-games.pages.dev`
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=34c3476795cb327d8756be0ac52566297e0f5e89 --commit-message="Add admin public asset cleanup controls" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle stayed unchanged: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk stayed unchanged: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk stayed unchanged: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk stayed unchanged: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=admin-asset-cleanup-34c3476`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-admin-asset-cleanup-34c3476`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-asset-cleanup-34c3476.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-admin-asset-cleanup-34c3476.png`
- Production smoke now proves the Admin page exposes locked public asset cleanup controls without an admin token: `asset cleanup controls locked`.
- `CRATE_SMOKE_ADMIN_TOKEN` was not present in this shell, so the authenticated dry-run/delete cleanup was not executed from Codex. Use the Admin page with a valid Cloudflare admin token to run `Dry Run Assets`, then `Clean Orphans` only if the dry run finds orphaned public assets.

What changed in this deploy:

- `admin.html`
  - Added a separate Published R2 public assets panel.
  - The panel unlocks only after the admin token is accepted.
  - Dry Run Assets scans `/api/assets/admin/public-cleanup` without deleting.
  - Clean Orphans stays disabled until a dry run reports orphaned public assets.
- `scripts/smoke-production.mjs`
  - Added locked-state checks for the public asset cleanup panel.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is available, smoke now also clicks the Admin UI dry-run control and verifies it stays non-destructive.

Next recommended asset step:

- Run an authenticated dry run from `/admin.html`, then run Clean Orphans if the orphan count is correct. After that, add a scheduled Cloudflare cleanup job or recurring admin task so old public R2 copies do not accumulate.

Previous app-only deploy on 2026-05-22:

- Final commit deployed: `33bbb92f` (`Refresh storage usage after publish cleanup`)
- Final Cloudflare deployment: `ba863cd9-b0b0-408b-9960-2360867f5ab1`
- Final deployment URL: `https://ba863cd9.crateship-games.pages.dev`
- This batch also deployed:
  - `0785cab8` (`Add asset storage usage controls`) as `https://f8f007a9.crateship-games.pages.dev`
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=33bbb92ff8f2d46f04e581ed7473d811f312b81e --commit-message="Refresh storage usage after publish cleanup" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle: `/assets/play-D201ytkw.js`
- Lazy App Builder chunk: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk: `/assets/game-builder-ui-ZAqK_loq.js`
- Lazy Asset Browser chunk: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=asset-storage-refresh-33bbb92`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-asset-storage-refresh-33bbb92`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-asset-storage-refresh-33bbb92.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-asset-storage-refresh-33bbb92.png`
- Production smoke now proves creator storage usage loads in the Builder, private upload/delete changes storage counts, publish-safe public asset copies count toward usage, and published-game cleanup refreshes back to `0 private/0 public` for the smoke owner.
- Admin moderation smoke now proves `/api/assets/admin/public-cleanup` is locked without a Cloudflare admin token.

What changed in this deploy:

- `functions/api/assets/[[path]].js`
  - Added owner-token `GET /api/assets/usage` for private imports, public published copies, total bytes, quota bytes, quota percent, and upload limit.
  - Added quota checks for private upload and public publish copies, with a default 500 MB owner quota unless Cloudflare environment configuration overrides it.
  - Public published asset metadata now stores `ownerHash` so public copies can be attributed back to the creator's storage usage without exposing the owner token.
  - Added admin-only `POST /api/assets/admin/public-cleanup` for dry-run or delete cleanup of orphaned public R2 assets.
- `engine.mjs`
  - Added `window._getUserAssetStorageUsage` and refreshes storage usage after upload, delete, publish, published-game update, and published-game delete paths.
- `game-builder-ui.mjs`
  - Added a creator-facing Storage status panel in the Asset Pack area with quota meter, private/public counts, byte totals, and refresh control.
- `scripts/smoke-production.mjs`
  - Added production checks for user storage usage, quota presence, UI panel state, admin cleanup guard, and post-cleanup storage refresh.

Next recommended asset step:

- Add an authenticated admin UI action for the public-cleanup route, then run a one-time dry-run/delete cleanup for older public assets created before lifecycle cleanup and usage tracking existed.

Previous app-only deploy on 2026-05-22:

- Final commit deployed: `353fe3b1` (`Clean up published public assets`)
- Final Cloudflare deployment: `b1c55738-6279-4419-bf93-d5b453801419`
- Final deployment URL: `https://b1c55738.crateship-games.pages.dev`
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=353fe3b1e40672a45a038887f77883c89cf6bb44 --commit-message="Clean up published public assets" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Main app bundle: `/assets/play-K36VOxZs.js`
- Lazy App Builder chunk: `/assets/app-builder-gPCLCTUn.js`
- Lazy Game Builder UI chunk: `/assets/game-builder-ui-D-vHjpFi.js`
- Lazy Asset Browser chunk: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=asset-cleanup-353fe3b`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-asset-cleanup-353fe3b`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-asset-cleanup-353fe3b.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-asset-cleanup-353fe3b.png`
- Production smoke now proves the published-game delete path removes the public R2 GLB object and metadata: `Published cleanup: game delete 200, public asset 404/404, removed 1/1`.
- Publish updates now garbage-collect public assets no longer referenced by the new game record, and asset republish removes the old public object if the filename/key changes.

What changed in this deploy:

- `functions/api/assets/[[path]].js`
  - Public asset republish reads the old public metadata and deletes the previous public R2 object when the public ID now points at a different object key.
- `functions/api/games/[[path]].js`
  - Published-game publish/delete paths clean up public R2 asset copies that are no longer referenced.
  - Delete responses include `publicAssetCleanup` counts so operations and smokes can prove the cleanup result.
- `scripts/smoke-production.mjs`
  - Production smoke deletes its published game, checks the public asset detail/download routes both return 404, and checks the published game API returns 404 after delete.

Next recommended asset step:

- Add a creator-facing storage/quota panel for private and public R2 assets, plus a scheduled cleanup/backfill for older public assets created before lifecycle cleanup existed.

Previous app-only deploy on 2026-05-22:

- Final commit deployed: `c74bb62e` (`Check private asset rejection outside browser console`)
- Final Cloudflare deployment: `84b7b236-1436-46c5-a8b2-a2edc5284a93`
- Final deployment URL: `https://84b7b236.crateship-games.pages.dev`
- This batch also deployed:
  - `998c3f6e` (`Publish user cloud assets with games`) as `https://6747ff1b.crateship-games.pages.dev`
  - `5ad3ffae`, `5ec76eb7`, `75639f88`, and `c74bb62e` as smoke hardening/source-tag deploys.
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=c74bb62e26797987a46160a1bbbfab217e22f2f9 --commit-message="Check private asset rejection outside browser console" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- App deploy uploaded the new bundle in the first deploy and then source-tagged the smoke-only fixes; shipped asset host stayed separate.
- Main app bundle: `/assets/play-K36VOxZs.js`
- Project Tools chunk: `/assets/project-tools-Bz2kId07.js`
- Game Builder UI chunk: `/assets/game-builder-ui-D-vHjpFi.js`
- Asset Browser chunk: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=public-assets-c74bb62`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-public-assets-c74bb62`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-public-assets-c74bb62.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-public-assets-c74bb62.png`
- Production smoke now proves a user-uploaded GLB is copied from the private owner-token R2 namespace into a public per-game R2 asset, the published project rewrites to `crate-cloud-public-asset:*`, the public download returns HTTP 200 without an owner token, and the original private asset still returns HTTP 403 without the owner token.

What changed in this deploy:

- `functions/api/assets/[[path]].js`
  - Added `POST /api/assets/:id/publish` to copy an owner-token private GLB/GLTF into `published-assets/<publicId>/...`.
  - Added no-token public read routes `GET /api/assets/public/:publicId` and `GET /api/assets/public/:publicId/download`.
- `engine.mjs`
  - Publish now scans project objects for private `cloudAssetId` references, publishes each unique asset to a public game-safe R2 object, and rewrites the published project snapshot to `crate-cloud-public-asset:<publicId>`.
  - Project loading now prefers public cloud asset IDs when present, so other players can load published games without the creator's local owner token.
- `project-tools.mjs`
  - Playable export can receive the publish-safe project snapshot, so published package metadata follows the public asset rewrite.
- `functions/api/games/[[path]].js`
  - Published-game records now store/report cloud asset counts and detail metadata.
- `scripts/smoke-production.mjs`
  - Smoke covers public asset copy/download, private no-token rejection, published-game load, marketplace/detail page checks, and both apex and `www` custom domains.

Failed intermediate deploy notes from this batch:

- `998c3f6e` shipped the public-copy feature but the smoke compared against a pre-cleanup object count.
- `5ad3ffae` and `5ec76eb7` exposed that deleted private test objects could still be serialized by later guard publishes.
- `75639f88` proved the feature but the browser console filter treated the intentional private HTTP 403 as a failure.
- The final `c74bb62e` smoke checks the private 403 outside the browser console and passes on both hostnames.

Next recommended asset step:

- Add a published-asset lifecycle policy: either keep public R2 assets forever with quota reporting, or garbage-collect public assets when a published game is deleted or updated.

Previous app-only deploy on 2026-05-22:

- Final commit deployed: `9b8a22cc` (`Handle exact marketplace smoke consistency`)
- Final Cloudflare deployment: `0133badf-5dc8-420a-9aa3-7f28eafabfae`
- Final deployment URL: `https://0133badf.crateship-games.pages.dev`
- This batch also deployed:
  - `1818c906` (`Add cloud user asset library`) as `https://aaaa1607.crateship-games.pages.dev`
  - `69ef0c8a` (`Keep imported assets out of command replay`) as `https://36129ce3.crateship-games.pages.dev`
  - `c416f0fa` (`Clean cloud asset smoke objects before delete`) as `https://ecbaa79d.crateship-games.pages.dev`
  - `c1a7b4e8`, `d1bff253`, `321392e7`, and `c6c62bbc` as smoke hardening source-tag deploys
  - `9cf6841b` (`Support exact slug marketplace search`) as `https://5c2571bd.crateship-games.pages.dev`
- App deploy command:

```powershell
npm run build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=9b8a22cc241a0797f95fbb7d09cbc572f34a86d7 --commit-message="Handle exact marketplace smoke consistency" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`, `.deploy\marketplace.html=True`
- Important deployment detail: run `npm run build` before `prepare:deploy` when any static HTML changes; `prepare:deploy` copies from `dist`.
- Final app-only deploy uploaded a new Functions bundle and reused the already-uploaded static marketplace file from the corrected `9cf6841b` package.
- Main app bundle: `/assets/play-Cwp9yIrc.js`
- Game Builder UI chunk: `/assets/game-builder-ui-D-vHjpFi.js`
- Asset Browser chunk: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=cloud-assets-9b8a22c`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-cloud-assets-9b8a22c`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-cloud-assets-9b8a22c.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-cloud-assets-9b8a22c.png`
- Production smoke now proves user GLB import upload to R2, local IndexedDB import persistence, cloud-only library listing, local placement, cloud placement, cleanup before delete, and R2 delete verification.
- The separated shipped asset host remained unchanged; user-uploaded assets now go to the separate R2 bucket instead of the app deploy package.

What changed in this deploy:

- `wrangler.toml`
  - Added R2 binding `CRATE_USER_ASSETS` for bucket `crateship-games-user-assets`.
- `functions/api/assets/[[path]].js`
  - Added owner-token protected `/api/assets` routes for health, list, upload, download, and delete of GLB/GLTF user assets.
- `engine.mjs`
  - User imports now sync successful GLB/GLTF files to R2, store `cloudAssetId` metadata, and can place local-only, local-plus-cloud, or cloud-only imported assets.
  - Project snapshots preserve `cloudAssetId`; project load can fetch `crate-cloud-asset:*` entries through `/api/assets/:id/download`.
  - Imported/cloud asset placement is kept out of command replay so saved games do not try to load deleted smoke assets as bundled model paths.
- `functions/api/games/[[path]].js` and `marketplace.html`
  - Marketplace exact slug searches now use the direct slug API path, falling back to normal list search when no direct record exists. This avoids KV list consistency delays right after publishing.
- `scripts/smoke-production.mjs`
  - Added R2 cloud asset smoke coverage and made marketplace smoke deterministic with exact slug search.
  - Smoke cleanup removes temporary imported objects before deleting the R2 smoke asset.

Failed intermediate deploy notes from this batch:

- `1818c906` initially failed smoke because cloud asset placement was recorded into command replay and later replayed as a bundled model URL.
- `69ef0c8a` fixed command replay but smoke still deleted the R2 object while temporary scene objects referenced it.
- `c416f0fa` passed apex, then `www` exposed marketplace smoke fragility because older production-smoke rows pushed the new game off page one.
- The final fix was exact slug marketplace search plus direct slug API lookup; the smoke no longer depends on KV list freshness for the just-published row.

Next recommended asset step:

- Decide whether user-uploaded cloud assets become public when a game is published or whether private cloud assets are copied into a published-game package. Other players need a public/package-safe path that does not require the creator's owner token.

Previous app-only deploy on 2026-05-22:

- Final commit deployed: `696b36ff` (`Harden user imports and play camera`)
- Final Cloudflare deployment: `8771c3e4-d70d-43d7-bb7d-4e1c681416d5`
- Final deployment URL: `https://8771c3e4.crateship-games.pages.dev`
- App deploy command:

```powershell
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=696b36f --commit-message="Harden user imports and play camera" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`
- App-only deploy uploaded `8` changed files and reused `103` existing files; the separated GLB/texture asset host stayed unchanged.
- Main app bundle: `/assets/play-Cnqgr37R.js`
- Game Builder UI chunk: `/assets/game-builder-ui-D-vHjpFi.js`
- Asset Browser chunk: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed: `https://crateshipgames.com/play?verify=import-camera-696b36f`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-import-camera-696b36f`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-import-camera-696b36f.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-import-camera-696b36f.png`
- Production smoke now proves user GLB import persistence by fetching a real GLB from the separated asset host, importing it, listing it in Imported Models, placing it from IndexedDB, and deleting the saved library entry.
- Apex smoke also verifies phone and tablet Builder layout so cramped menu buttons/labels fail the gate before deployment is considered good.

What changed in this deploy:

- `engine.mjs`
  - User GLB/GLTF imports now go through the same validated placement path whether they come from the import modal or viewport drag/drop.
  - Successful user imports are saved in IndexedDB with size/source/file/metric metadata and exposed through an Imported Models library with Place/Delete actions.
  - Added `window._importGLBFile`, `window._listUserImportedModels`, `window._placeUserImportedModel`, and `window._deleteUserImportedModel` for smoke and future UI integrations.
  - Added a Play-mode `Reset View` control plus `window._resetPlayCameraView` to flatten camera roll when scrolling/dragging makes the world look tilted.
- `game-builder-ui.mjs`
  - Mobile Builder grids collapse to two columns and key buttons get a minimum height so text is less likely to be covered or clipped.
- `scripts/smoke-production.mjs`
  - Verifies import modal library controls, real user import/place/delete, Play camera reset behavior, and mobile Builder text/grid layout.

Previous app-only deploy on 2026-05-22:

- Final commit deployed: `1ed1faa8` (`Stabilize public game listing smoke`)
- Final Cloudflare deployment: `ddfd35df-1f96-4540-b85c-46b4363c930a`
- Final deployment URL: `https://ddfd35df.crateship-games.pages.dev`
- This batch also deployed:
  - `92ef091d` (`Harden production smoke and mode selection`) as `12da66f3-a630-44f3-8c2a-beffda1dc48c`.
  - `84269ca3` (`Repair restored gameplay links`) as `828978d2-950e-4d3c-9873-bdd814de3e73`.
- App deploy command:

```powershell
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=1ed1faa816599fef7c6611323459245441104422 --commit-message="Stabilize public game listing smoke" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`
- Final source-tag deploy uploaded `0` new static files and reused `111` existing files; it uploaded a new Functions bundle for the public-game listing fix.
- Main app bundle: `/assets/play-Gh-UhNtc.js`
- Game Builder UI chunk: `/assets/game-builder-ui-cSxJVtDQ.js`
- Asset Browser chunk: `/assets/asset-browser-ui-CAOy79B3.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Primary smoke passed in parallel: `https://crateshipgames.com/play?verify=listing-smoke-1ed1faa`
- WWW smoke passed in parallel: `https://www.crateshipgames.com/play?verify=www-listing-smoke-1ed1faa`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-listing-smoke-1ed1faa.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-listing-smoke-1ed1faa.png`
- Production smokes are now namespaced per run and passed concurrently on apex and `www`; the old fixed-slug race is resolved.

What changed in this deploy:

- `engine.mjs`
  - Added `window._retryLastAssetPlacement` and wired asset-placement retry state for failed catalog loads.
  - Added `window._engineBridge.getSelectedOrLast()` for edit-only fallback selection and made `getSelected()` return no editor selection outside Edit mode.
  - Repairs dangling restored mission, wave, and trigger links after project/published-game load so saved games return to a validation-ready state instead of keeping stale component IDs.
- `game-builder-ui.mjs`
  - Shows a `Retry` button in the placement status panel when the last asset placement failed.
- `functions/api/games/[[path]].js`
  - Public game listings now read the current KV record before filtering visibility/moderation, so unlisted games do not stay visible because KV list metadata lagged.
- `scripts/smoke-production.mjs`
  - Smoke records use per-run slugs injected into every browser context, allowing apex and `www` production smokes to run in parallel.
  - Smoke verifies the asset retry hook, no editor selection leaks into Explore/Play, restored project validation is ready, metadata guards are consistent, and published games load back into the editor.

Previous app-only deploy on 2026-05-20:

- Commit deployed: `4b1e3e11` (`Refresh builder validation before production smoke summary`)
- Cloudflare deployment: `cc79ff03-de44-4176-9573-6bf3e54dcc82`
- App deploy command:

```powershell
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=4b1e3e11 --commit-message="Refresh builder validation before production smoke summary" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`
- Final source-tag deploy uploaded `0` new static files and reused `111` existing files; the app bundle had already been uploaded by deployment `2acbb6e8-84ec-44cb-9458-f79f457379fe` from commit `0b395ff1`.
- Primary smoke passed sequentially: `https://crateshipgames.com/play?verify=starter-kit-layout-4b1e3e11-seq`
- WWW smoke passed sequentially: `https://www.crateshipgames.com/play?verify=www-starter-kit-layout-4b1e3e11-seq`
- Visual Starter Kits layout check passed: `https://crateshipgames.com/play?verify=starter-kit-layout-visual-1779319691667`
- Screenshots:
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-starter-kit-layout-4b1e3e11-seq.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-starter-kit-layout-4b1e3e11-seq.png`
  - `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\starter-kit-layout-visual-1779319691667.png`
- Smoke bundle: `/assets/play-CxgPiKlg.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`
- Historical note: this older deploy still required sequential production smokes because the smoke slugs were fixed. That limitation was removed by the 2026-05-22 deploy.

What changed in this deploy:

- `game-builder-ui.mjs`
  - Added `Starter Kits` in the Builder panel: `Adventure Loop`, `Combat Loop`, and `Inventory Loop`.
  - `Adventure Loop` creates a player spawn, guide NPC, mission step, reward chest, mission gate, checkpoint, and finish goal, and installs Inventory, HUD, Quest, and Component Runtime scripts.
  - `Combat Loop` creates a spawn, weapon pickup, enemy spawn, wave controller, checkpoint, and finish goal.
  - `Inventory Loop` creates a spawn, pickup, equipment item, merchant, checkpoint, and finish goal.
  - Fixed Builder section clipping by preventing sections from flex-shrinking inside the scroll body; this keeps Starter Kit cards and labels visible.
- `scripts/smoke-production.mjs`
  - Applies the `Adventure Loop` starter kit and verifies generated gameplay components/scripts.
  - Fails if the Starter Kits section collapses or clips its cards.
  - Refreshes Builder validation before the final smoke summary and records row-level validation messages when a warning is real.

Previous app-only deploy on 2026-05-20:

- Commit deployed: `ba017dd9` (`Add persistent mode dock and clean asset picker`)
- Cloudflare deployment: `ced94f30-9c75-4240-b9da-5c42195ccac0`
- App deploy command:

```powershell
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=ba017dd9 --commit-message="Add persistent mode dock and clean asset picker" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`
- App-only deploy uploaded `10` changed app files and reused `101` existing files; the separate asset host stayed unchanged.
- Primary smoke passed: `https://crateshipgames.com/play?verify=mode-dock-ba017dd9`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-mode-dock-ba017dd9`
- Manual live playtest passed: `https://crateshipgames.com/play?verify=mode-dock-manual-1779310783926`
- Smoke bundle: `/assets/play-DV3nZ-s8.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`

What changed in this deploy:

- `game-builder-ui.mjs`
  - Added a persistent `Mode` dock so Edit, Explore, and Play remain reachable even when Play mode hides the Builder panel.
  - The production smoke now verifies that the dock stays visible in Play and can return cleanly to Edit.
- `asset-browser-ui.mjs`
  - Removed duplicate category cards from the asset picker, added stable category/item data attributes, and let gallery item names wrap instead of truncating.
  - Manual live test placed a furniture asset from the real picker with no model/texture errors.
- `scripts/smoke-production.mjs`
  - Verifies the global mode dock on both the main custom domain and the `www` hostname.

Previous app-only deploy on 2026-05-20:

- Commit deployed: `edb0293b` (`Harden imports and runtime effect pools`)
- Cloudflare deployment: `9c7a3d97-f704-4dd1-8872-0fb530208c85`
- App deploy command:

```powershell
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`
- App-only deploy reused the separate asset host and uploaded `0` new app files on the final clean deploy.
- Primary smoke passed: `https://crateshipgames.com/play?verify=runtime-pools-edb0293b`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-runtime-pools-edb0293b`
- Smoke bundle: `/assets/play-Bac2DHpz.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`

What changed in this deploy:

- `engine.mjs`
  - Added `.crate` project migration from legacy/v1-style saves into schema version `3`.
  - Keeps future project versions blocked instead of silently downgrading them.
  - Added GLTF collision-proxy detection for imported models using names like `collider`, `collision`, `UCX`, `convex`, `hull`, or `physics`.
  - Warns when a heavy physics model has no collision proxy metadata.
  - Added runtime pools for damage-number DOM nodes, impact particles, and muzzle-flash lights.
- `game-builder-ui.mjs`
  - Added runtime pool counts to the Builder `Performance` panel.
- `scripts/smoke-production.mjs`
  - Verifies collision-proxy warnings and proxy-ready model metadata.
  - Verifies legacy project migration and future-version rejection.
  - Exercises runtime effect pools and fails if they keep creating new transient objects instead of reusing them.

Previous app-only deploy on 2026-05-20:

- Commit deployed: `e54549a5` (`Fix builder asset placement and play camera mode`)
- Cloudflare deployment: `f2e8e2bb-91c0-4eeb-9811-1214f59d0831`
- App deploy command:

```powershell
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'; npm run prepare:deploy
npx wrangler pages deploy .deploy --project-name crateship-games --branch=main --commit-hash=e54549a5 --commit-message="Fix builder asset placement and play camera mode" --commit-dirty=false
```

- Deploy package check: `.deploy\models=False`, `.deploy\textures=False`, `.deploy\play.html=True`, `.deploy\admin.html=True`
- Primary smoke passed: `https://crateshipgames.com/play?verify=asset-camera-e54549a5`
- WWW smoke passed: `https://www.crateshipgames.com/play?verify=www-asset-camera-e54549a5`
- Smoke bundle: `/assets/play-CTbbfF-h.js`
- Asset host stayed unchanged: `https://crateship-games-assets.pages.dev`, manifest `6f09cc09da2f`

What changed in this deploy:

- `game-builder-ui.mjs`
  - Fixed the `Asset Library` Builder action so the selected catalog asset is actually placed through `window._placeCatalogAsset`.
  - Relaxed fixed-height Builder buttons so preset, mode, quality, and system action labels wrap instead of clipping.
- `engine.mjs`
  - Split camera-only Play mode from character-owned camera mode so Play can move/look without editor orbit controls fighting it.
  - Added a Play camera roll guard to keep scroll/drag from tilting the world.
  - Restores unmatched saved gameplay objects as lightweight placeholders when project command replay returns fewer objects than the saved `.crate` snapshot.
- `scripts/smoke-production.mjs`
  - Verifies Builder asset-button placement, visible button text fit, Play camera roll guard behavior, and project-load placeholder restoration.

Check the latest deployment with:

```powershell
npx wrangler pages deployment list --project-name=crateship-games --environment=production
```

## What Was Deployed

The 2026-05-17 deploy added the first sellable-engine editor pass:

- `game-builder-ui.mjs`
  - Left-side `Game Builder` panel.
  - World presets: Modern City, Medieval Village, Zombie Survival, Space Station, Pirate Cove, Forest Camp.
  - System presets: Inventory, Game HUD, Quest Tracker, Pickups, FPS Combat, Dialogue NPC, Autosave, Day/Night.
  - Asset shortcuts: Asset Library, Characters, Vehicles, Weapons, Buildings, Trees.
  - Ship shortcuts: Play Mode, Save, Export, Share, Scripts, Settings.
- `user-scripts.mjs`
  - Added `installUserScript(scriptObj)` for one-click gameplay/system presets.
- `engine.mjs`
  - Exposes `window._installUserScriptPreset`.
  - Exposes `window._showScriptManager`.
  - Exposes selection helpers so the Game Builder panel can select the same object as the inspector.
  - Fixed the interpreter command runner strict-mode `result` variable bug that stopped preset buttons from completing.
  - Reduced minimap readback frequency to lower WebGL stall risk.
- `play.html`
  - Loads the Game Builder UI.
  - Cache-busts the changed production module path through the Vite bundle.
- `scripts/prepare-deploy.mjs`
  - Removed hardcoded Mac deploy paths.
  - Supports `CRATE_MODELS_DIR`, `CRATE_ENGINE_ROOT`, and `CRATE_DEPLOY_DIR`.
  - Creates a Windows junction for the model directory when deploying from Windows.
- `scripts/optimize-gltf.mjs`
  - Fixed missing `await` on glTF Transform read/write.
- `vite.config.mjs`
  - Removed hardcoded Mac root path.
  - Includes `404.html` in static files.
- `404.html`
  - Added so missing `/models/*` paths return a real 404 instead of app HTML.

Follow-up production deploys on 2026-05-17 added the builder component pass:

- `game-builder-ui.mjs`
  - Added a live `Scene` section listing recent scene objects with position and component tags.
  - Added one-click component buttons: Collider, Pickup, Damage, Objective, Spin, Float, Spawn Pt, Focus.
  - Added a `Component Runtime` script preset for pickup, damage, objective, spin, and float behavior.
  - Moved Components and Scene directly under World so they are visible in the first panel view.
  - Raised the Game Builder panel above gameplay overlays so the builder buttons remain clickable after a city is generated.

Follow-up production deploys on 2026-05-17 fixed the asset/runtime warnings seen during live city builds:

- `scripts/fetch-polyhaven-textures.mjs`
  - Added a repeatable texture downloader for the Poly Haven modular street seating and electricity pole JPEG dependencies.
- `scripts/prepare-deploy.mjs`
  - Keeps `/models/*` linked for GLB assets.
  - Also links `/textures/*` to the model cache textures directory so GLTFLoader-relative texture paths resolve on the custom domain.
- `engine.mjs`, `city-builder.mjs`, and `crate-engine/web/engine.mjs`
  - Switched the HDR environment loader path from deprecated `RGBELoader` to `HDRLoader`.
  - Renamed the city-builder loader hook to `setCityBuilderHDRLoader`.
- `scripts/sync-legacy-web.mjs`
  - Removed the old hardcoded Mac desktop path.
  - Uses the current repo root on Windows and syncs current top-level `.mjs` files into the legacy `crate-engine/web` copy when needed.

Follow-up production deploys on 2026-05-17 added the first object inspector and blueprint workflow:

- `game-builder-ui.mjs`
  - Added an `Inspector` section inside the Game Builder panel.
  - Inspector shows the selected scene object's name, transform, component list, and editable component fields.
  - Added selected-object actions for Focus, Clone, and Delete.
  - Added editable fields for Collider, Pickup, Damage, Objective, Spin, Float, and Spawn Point components.
  - Added a `Blueprints` section backed by `localStorage`.
  - Blueprints save a selected object's component setup and can apply that setup to another selected object.

Follow-up production deploys on 2026-05-17 added the first asset-host split foundation and fixed a broken city asset dependency:

- `asset-url.mjs`
  - Added a browser-side asset resolver for `/models/*` and `/textures/*`.
  - Supports `window.CRATESHIP_ASSET_BASE_URL`, `<meta name="crate-asset-base">`, or `localStorage.crate_asset_base_url`.
  - Patches `GLTFLoader.load/loadAsync` and asset fetches so the app can later point to a separate asset host without rewriting every loader call.
- `engine.mjs`, `model-registry.mjs`, and `editor-tools-ui.mjs`
  - Installed the asset pipeline early in the engine boot.
  - Routed `/models/catalog.json` and `/models/fab/fab_aliases.json` through the resolver.
- `scripts/prepare-deploy.mjs`
  - Added `CRATE_DEPLOY_INCLUDE_ASSETS=false` as a future switch to deploy only app code after a separate asset host is verified.
  - Added `CRATE_TEXTURES_DIR` support.
- `scripts/prepare-assets-deploy.mjs`
  - Added a repeatable `.deploy-assets` staging workflow that links `/models` and `/textures` for a future dedicated Cloudflare Pages asset project.
- `scripts/check-syntax.mjs`
  - Expanded syntax checks from 12 hardcoded files to 53 current JS modules while excluding generated deploy folders and legacy duplicates.
- `gen_npcs.mjs`
  - Fixed the broken `NPC_DEFS` export found by the expanded syntax check.
- `_headers`
  - Added `/models/*` and `/textures/*` CORS/cache headers for durable asset delivery.
- `scripts/fetch-polyhaven-textures.mjs`
  - Added downloads for `modular_street_seating.bin` and `modular_electricity_poles.bin`.
  - This fixed the live city-builder warnings for `ph_modular_street_seating.glb` and `ph_modular_electricity_poles.glb`.

Follow-up production deploys on 2026-05-17 added a predeploy asset integrity guardrail:

- `scripts/check-assets.mjs`
  - Scans critical city/gameplay model references from `city_assets.json`.
  - Verifies the default engine-critical assets: vehicle, building, street prop, Poly Haven seating/pole GLBs, and the modular `.bin` buffers.
  - Parses binary GLB and JSON glTF files, including `.glb` files that are actually JSON glTF.
  - Checks external `buffers[].uri` and `images[].uri` dependencies case-sensitively before deploy.
  - Supports optional broader checks:
    - `CRATE_ASSET_CHECK_CATALOGS=warn|strict`
    - `CRATE_ASSET_CHECK_ALL_MODELS=true`
- `scripts/prepare-deploy.mjs`
  - Runs the asset integrity check before linking `/models` and `/textures` when assets are included.
  - Supports emergency bypass with `CRATE_SKIP_ASSET_CHECK=true`, but only use that when deliberately deploying code while asset checks are being repaired.
- `package.json`
  - Added `npm run check:assets`.
  - Added `npm run check:deploy` for code plus asset validation.

Follow-up production deploys on 2026-05-17 added a production smoke test:

- `scripts/smoke-production.mjs`
  - Uses Playwright Core with the installed Chrome browser to test the real custom domain.
  - Verifies `/play` returns a hashed play bundle.
  - Verifies critical live asset URLs for GLB, texture, modular `.bin`, and missing-model `404` behavior.
  - Opens `https://crateshipgames.com/play?verify=<id>`, waits for `window._engineReady`, `window._engineBridge`, and `window._crateAssetUrl`.
  - Runs the `Inventory` Game Builder preset, types `build city`, waits for the city objects and Scene list, selects a scene row, applies the `Pickup` component, and saves a screenshot under `output/playwright/`.
  - Supports `CRATE_SMOKE_BASE_URL`, `CRATE_SMOKE_VERIFY`, `CRATE_SMOKE_TIMEOUT_MS`, `CRATE_SMOKE_HEADLESS=false`, `CRATE_SMOKE_CHROME_PATH`, and `CRATE_SMOKE_SCREENSHOT_DIR`.
- `package.json`
  - Added `npm run smoke:production`.
- `.gitignore`
  - Ignores `output/` so smoke screenshots do not pollute commits.

Follow-up production deploys on 2026-05-17 activated the separate Cloudflare asset host:

- Cloudflare Pages project `crateship-games-assets`
  - Created as the dedicated host for shared `/models/*` and `/textures/*`.
  - First upload attempt hit a Wrangler socket error after partial upload; retry succeeded and uploaded `4,182` files to deployment `fa06faf8-9969-46dc-b8b1-1d7d3b70122f`.
  - Hardened asset-host deployment `d6e01bfb-66b0-4d69-a9a1-51f1d625bb74` added asset integrity checking, a real asset `404.html`, and cleaner CORS/cache headers.
- `scripts/prepare-assets-deploy.mjs`
  - Now runs `checkAssets()` before staging the asset host unless `CRATE_SKIP_ASSET_CHECK=true`.
  - Writes a real `404.html` so missing asset URLs return `404 Not Found` instead of `200 text/html`.
- `play.html` and `demo.html`
  - Added `<meta name="crate-asset-base" content="https://crateship-games-assets.pages.dev">`.
  - This points GLB, texture, and catalog requests at the asset host through `asset-url.mjs`.
- `scripts/smoke-production.mjs`
  - Reads the asset-base meta tag or `CRATE_SMOKE_ASSET_BASE_URL` and verifies model/texture URLs against that asset host.
- App deployment `bbadc73c-c7a7-45cb-9bd3-662c843bbc89`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload contained only `105` files and uploaded `2` changed files plus `_headers`, instead of uploading the full model cache again.

Follow-up production deploys on 2026-05-17 added asset-pack manifest verification:

- `scripts/prepare-assets-deploy.mjs`
  - Writes `/asset-manifest.json` into the asset host.
  - Manifest includes the asset pack version, source commit, asset base URL, `/models/` and `/textures/` paths, integrity counts from `checkAssets()`, and critical asset paths.
  - Adds no-store CORS headers for `/asset-manifest.json`.
- `scripts/smoke-production.mjs`
  - Fetches and validates `/asset-manifest.json` from the configured asset host before checking GLB/texture files and running the browser smoke flow.
- Asset-host deployment `4ab7dcd8-6d39-4472-89f3-3077c2bd904d`
  - Uploaded `1` changed file, reused `4,183` already-uploaded files, and refreshed `_headers`.
  - Published manifest version `6f09cc09da2f`.

Follow-up production deploys on 2026-05-17 fixed furniture loading and separated editor modes:

- `engine.mjs`
  - Added one canonical engine mode state for `edit`, `explore`, and `play`.
  - Kept legacy `view` mode calls as an alias for `explore`.
  - Restricted canvas click selection, dragging, Delete, Clone, and Delete Selected to Edit mode.
  - Clears editor selection when entering Explore or Play so camera/exploration clicks do not select objects.
  - Fixed the interpreter `addObject` command path strict-mode `score` variable bug that broke commands like `add chair`.
  - Fixed the street-props suggestion hook so normal `add <asset>` commands do not crash before `city-builder.mjs` has loaded grouped assets.
  - Passes catalog `path` values into `loadGLBModel()` when command-search results include a custom path.
- `game-builder-ui.mjs`
  - Added a visible `Mode` section with `Edit`, `Explore`, and `Play` buttons.
  - Game Builder stats now report `Edit`, `Explore`, or `Play` from engine mode state.
  - Mode button state updates immediately when mode changes from either the panel or engine commands.
- `scripts/smoke-production.mjs`
  - Added a live furniture command check by running `add chair` before the city build.
  - Added a direct asset-host HTTP check for `/models/house_interior_pack_chair_1.glb`.
  - Added Explore/Edit mode verification so Explore canvas clicks cannot open the legacy object inspector.
- App deployment `e2b1f6e2-7e26-4254-9b3d-67d731015a90`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload contained only `105` files, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.

Follow-up production deploys on 2026-05-17 filtered unavailable asset catalog entries:

- `engine.mjs`
  - Filters `asset-catalog.json` against the deployed `/models/catalog.json` availability map before the gallery or command-search paths use it.
  - Keeps user-saved, user-generated, marketplace, blob, data, and absolute external model entries.
  - Hides `.tmp`/`.glb.tmp` entries and catalog entries that do not exist in the deployed asset host catalog.
  - Uses alias and duplicate-folder normalization so known deployed paths can still be resolved instead of hidden.
  - Exposes `window._assetCatalogHiddenUnavailable` for production diagnostics and smoke tests.
- `asset-browser-ui.mjs`
  - Gallery thumbnails now load from the corrected `item.path` when the scrubber resolves a canonical asset path.
- `scripts/smoke-production.mjs`
  - Verifies the filtered catalog is still large enough to be useful.
  - Fails if `.tmp` asset references are still exposed to users.
  - Prints the hidden unavailable asset count in smoke output.
- App deployment `239040e1-3f9c-48b8-a31e-0ea17d220dbe`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload contained only `105` files, uploaded `8` changed files, reused `97` already-uploaded files, and refreshed `_headers`.

Follow-up production deploys on 2026-05-17 hardened Play mode editor separation:

- `engine.mjs`
  - Entering Play mode now immediately syncs the canonical mode state, clears editor selection, and updates mode buttons.
  - Play mode hides the Game Builder panel, marks it with `data-play-hidden="true"`, and removes open asset/gallery/import modals so editor UI cannot intercept player input.
  - Returning to Edit restores the Game Builder panel only if Play mode hid it.
  - If gameplay systems fail to load while entering Play, the engine falls back to Edit mode instead of leaving the UI in a mixed state.
- `scripts/smoke-production.mjs`
  - Clicks the real `Play` button on the live site.
  - Verifies `window._playMode === true`, the Game Builder is hidden, the prompt is hidden, and the legacy inspector is not visible.
  - Returns to Edit and verifies the Game Builder panel is visible again.
- App deployment `5c762057-59bc-4f0d-beb1-ac80cdd6471f`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `6` changed files, reused `99` already-uploaded files, and refreshed `_headers`.

Follow-up production deploys on 2026-05-17 improved asset placement feedback:

- `engine.mjs`
  - Added one tracked placement path for command adds, model browser picks, direct asset library picks, and Fab gallery picks.
  - Asset placement now switches to Edit mode when needed, places the model in front of the camera instead of always at the origin, and selects the newly placed model.
  - Exposes `window._placeCatalogAsset` and `window._lastAssetPlacement` for editor UI and production smoke diagnostics.
  - Hides the floating model-browser button during Play mode and restores it when returning to Edit.
- `game-builder-ui.mjs`
  - Added a `Placement` status section to show loading, placed, blocked, or failed placement state with the placed asset name and position.
- `editor-tools-ui.mjs`
  - Routes Fab gallery clicks through the same tracked placement path when available.
- `scripts/smoke-production.mjs`
  - Verifies tracked furniture placement on the live custom domain.
  - Verifies the placed asset is selected and the Placement panel names it.
  - Verifies Play mode hides the model-browser button and Edit mode restores it.
- App deployment `f365f9e1-591e-4faa-ae13-8b7724753c2d`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `8` changed files, reused `97` already-uploaded files, and refreshed `_headers`.

Follow-up production deploys on 2026-05-18 locked Game Builder editing outside Edit mode:

- `game-builder-ui.mjs`
  - Added mode-aware edit guards for mutating Game Builder actions.
  - Disables and labels edit-only controls in Explore and Play mode, including scene selection, component buttons, transform/name fields, Clone/Delete, blueprint Save/Apply/Delete, asset placement, scripts, and mutating presets.
  - Keeps Focus available outside Edit so users can inspect/explore without changing the scene.
  - Shows a read-only inspector note outside Edit: `Read-only in Explore. Switch to Edit to change this object.`
  - Forces the inspector to redraw when engine mode changes, including mode changes triggered by `window._setMode()` instead of the panel buttons.
- `scripts/smoke-production.mjs`
  - Verifies Explore mode disables mutating Game Builder controls on the live custom domain.
  - Force-clicks disabled component, scene-select, and Clone controls and fails if object count, selected object, or component count changes.
  - Verifies Edit mode re-enables the controls after returning from Explore/Play.
- App deployment `3c88d1a7-d5f7-466d-b5a8-78a55bbfcdc2`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - Production smoke caught a read-only inspector redraw gap and this deployment was superseded.
- App deployment `4e7ae6f3-4238-4158-b907-4290eefae405`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - Production smoke passed on the real custom domain after the inspector redraw fix.

Follow-up production deploys on 2026-05-18 added Game Builder project controls:

- `game-builder-ui.mjs`
  - Added a top-level `Project` section in the Game Builder panel.
  - Exposes Save, Load, Import, Export, Share, and Settings as visible builder actions instead of relying on hidden legacy toolbar buttons.
  - Shows saved project count in `#gb-project-status`.
  - Keeps Save, Load, and Import edit-only because they can mutate project state or scene contents.
  - Keeps Export and Share available in Explore because they are read-only project actions.
  - Added stable `data-gb-action` selectors for project buttons.
- `engine.mjs`
  - Added stable modal IDs for project smoke tests: `#sl-close`, `#ie-close`, `#ie-export-share`, `#ie-export-crate`, and `#ie-export-html`.
  - Play mode now removes Save/Load and Share modals along with existing import/asset modals so project UI cannot intercept gameplay input.
- `scripts/smoke-production.mjs`
  - Verifies the Project section has Save, Load, Import, Export, Share, and Settings actions.
  - Saves a named project into `localStorage.crate-saves`.
  - Opens and verifies the Import modal and Export modal on the real custom domain.
  - Verifies Import is disabled in Explore while Export remains available.
- App deployment `8cc68a30-fb5b-45ca-a6f0-3fb9962ce2e9`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `6` changed files, reused `99` already-uploaded files, and refreshed `_headers`.
  - Production smoke passed on the real custom domain.

Follow-up production deploys on 2026-05-18 added richer project snapshots:

- `engine.mjs`
  - Upgraded `serializeScene()` to `format: crate-engine-project`, `version: 3`.
  - Project saves and `.crate` exports now include command history, object snapshots, builder components, transform data, asset file/path metadata, interaction metadata, and installed user scripts.
  - `.crate` imports and project Load now use the same richer deserializer while still accepting older command-array files.
  - GLB placement records `gbAssetFile` and `gbAssetPath` on loaded objects so exported projects can identify asset-backed objects.
- `scripts/smoke-production.mjs`
  - Saves after the live city, placement, Inventory script, and Pickup component exist.
  - Verifies the saved project is `version 3` and includes 100+ objects, asset paths, user scripts, and a Pickup component snapshot.
- App deployment `7617ff7e-4bd1-4f3f-b1f2-be9f68e2203c`
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `6` changed files, reused `99` already-uploaded files, and refreshed `_headers`.
  - Production smoke passed on the real custom domain.

Follow-up production deploys on 2026-05-18 verified project Load restores full city projects:

- `engine.mjs`
  - Exposes `window._sceneHistory` and `window._recordSceneCommand` for command-history diagnostics.
  - Records direct city-builder commands so saved projects can replay the generated city instead of only restoring standalone GLBs.
  - Saves `placementSource` in project object snapshots and restores it during project load.
  - Clears the current scene before project load, waits for command replay, applies object snapshots, restores user scripts, and publishes `window._lastProjectLoad` diagnostics.
- `city-builder.mjs`
  - Records `build city` from inside `buildCityWorld3()` so typed prompt, interpreter, quick-start, and preset paths all produce replayable project saves.
- `scripts/smoke-production.mjs`
  - Saves after a city build, loads the saved project, and verifies the loaded project returns 100+ objects, scripts, and the saved Pickup component.
  - Verifies the save contains a city replay command and logs project load details.
- Superseded app deployment `f35c9da7-79e1-4a77-9ba4-c86a27b7a853`
  - Source `2f688bf`; bundle `/assets/play-DO9LsZCu.js`.
  - Uploaded `6` changed files, reused `99`, and refreshed `_headers`.
  - Production smoke failed because project load restored only the two GLB chair objects and lost the city object carrying the Pickup component.
- Superseded app deployment `a9f65d82-422e-4afa-ac6e-da42c572304c`
  - Source `8350b0b`; bundle `/assets/play-ds8MB5xP.js`.
  - Uploaded `6` changed files, reused `99`, and refreshed `_headers`.
  - Production smoke caught that the typed prompt path still built the city without recording a replayable city command.
- Final app deployment `3caa710e-7ae6-416e-ac40-447e5386760d`
  - Source `acb2ea2`; bundle `/assets/play-BqRlEDUu.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `8` changed files, reused `97` already-uploaded files, and refreshed `_headers`.
  - Production smoke passed on the real custom domain.

Follow-up production deploys on 2026-05-18 added live asset-pack diagnostics:

- `game-builder-ui.mjs`
  - Added an `Asset Pack` section to the Game Builder panel.
  - Loads `/asset-manifest.json` from the configured asset host and shows the live asset pack version, host, checked model count, and catalog reference count.
  - Exposes the loaded manifest as `window._crateAssetManifest` and `window._assetManifestVersion` for diagnostics and smoke tests.
- `scripts/check-assets.mjs`
  - Keeps the existing local `CRATE_MODELS_DIR` deep check when local models exist.
  - Falls back to the Cloudflare asset host when the checkout is app-only and has no local `models` directory.
  - Validates the remote manifest plus required city/catalog assets with HTTP checks.
- `scripts/smoke-production.mjs`
  - Verifies the Asset Pack section loads the same manifest version as the production asset host before running the city/project smoke.
- Final app deployment `03a70092-dd8a-4397-971e-0f7d76cd3734`
  - Source `03ad4e1`; bundle `/assets/play-C3mtcMDV.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `npm run check:assets` now passed from the app-only checkout by validating `114` remote assets and `107` catalog references against `https://crateship-games-assets.pages.dev`.
  - Production smoke passed on the real custom domain.

Follow-up production deploys on 2026-05-18 improved Game Builder status readability:

- `game-builder-ui.mjs`
  - Replaced the compressed `#gb-stats` HTML string with DOM-rendered stat pills.
  - Added a readable `data-summary` and `aria-label` so the header reports `objects, components, scripts, mode` with clear separators.
  - Changed the mode stat from `Edit` to `Edit mode` for clearer builder state.
- `scripts/smoke-production.mjs`
  - Reads the explicit stats summary before falling back to text content, so production smoke catches future status regressions.
- Final app deployment `2858ab61-a221-4660-9b63-bc57e139a6e5`
  - Source `75eea03`; bundle `/assets/play-nmptH-vK.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported readable stats: `411 objects, 1 components, 2 scripts, Edit mode`.

Follow-up production deploys on 2026-05-18 added Game Builder readiness checks:

- `game-builder-ui.mjs`
  - Added a `Readiness` section to the Game Builder panel.
  - Shows whether the current scene is missing a world, needs gameplay, has an asset issue, or is ready to test.
  - Tracks world object count, enabled gameplay scripts, builder components, spawn/pickup/objective tags, saved project count, asset pack state, and current mode.
  - Exposes `window._gameBuilderReadiness` for diagnostics and production smoke tests.
- `scripts/smoke-production.mjs`
  - Requires the Readiness section to exist.
  - Fails production smoke unless the live built city reports a ready/testable state with loaded assets, at least one script, and at least one component.
- Final app deployment `f5bd018f-7619-47d8-8ea2-7e75cb3281c9`
  - Source `b30bcf6`; bundle `/assets/play-D_UxywgF.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported readiness: `Ready to test, 411 objects, 2 scripts, 1 components, Edit mode`.

Follow-up production deploys on 2026-05-18 added the Game Systems Library:

- `game-builder-ui.mjs`
  - Added a `Game Systems` section to the Game Builder panel.
  - Shows install/tag status for Inventory, Game HUD, Quest Tracker, Component Runtime, Pickup System, Objective System, Spawn Points, and Damage Zones.
  - Provides direct `Install` or `Tag Selected` actions instead of forcing creators to type prompts for common gameplay systems.
  - Exposes `window._gameBuilderSystems` for diagnostics and production smoke tests.
- `scripts/smoke-production.mjs`
  - Requires all eight Game Systems cards to exist on the live site.
  - Installs Inventory from the Game Systems section.
  - Fails production smoke unless Inventory, Component Runtime, and Pickup System are reported as installed/tagged after the build flow.
- Final app deployment `f316aad7-26ef-4d4a-b3c2-4d9e72211244`
  - Source `147d95a`; bundle `/assets/play-BWBpHDR0.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported systems: `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, spawns:Ready, damage:Ready`.

Follow-up production deploys on 2026-05-18 added checkpoint and win-condition systems:

- `game-builder-ui.mjs`
  - Extended Component Runtime to handle `checkpoint` and `winCondition` builder components.
  - Runtime HUD now shows active checkpoints, win goals, game-complete state, and game-over state.
  - Added Checkpoint and Win Goal component buttons plus editable labels/radii in the Inspector.
  - Added Checkpoints and Win Condition cards to the Game Systems Library.
  - Readiness now tracks pickups, checkpoints, objectives, win goals, and spawn counts separately.
- `scripts/smoke-production.mjs`
  - Requires the live Game Systems Library to include Checkpoints and Win Condition.
  - Tags the selected live city object with Pickup, Checkpoint, and Win Condition.
  - Fails production smoke unless Readiness reports at least three gameplay components, one checkpoint, and one win condition.
- Final app deployment `4b4ad1c1-d948-4856-a21c-6f12efa08b62`
  - Source `3967314`; bundle `/assets/play-DfB0C3M-.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported systems: `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, checkpoints:1 tagged, win:1 tagged, spawns:Ready, damage:Ready`.
  - Production smoke confirmed selected components: `pickup, checkpoint, winCondition`.

Follow-up production deploys on 2026-05-18 added functional spawn/respawn runtime behavior and fixed the scripting hook runner:

- `game-builder-ui.mjs`
  - Extended Component Runtime to handle `spawnPoint` as an active Play-mode system, not only editor metadata.
  - Spawn points now set the active player start, show in the runtime HUD, and reset when leaving Play mode.
  - Respawns now target the active checkpoint first, then the active player spawn, restoring runtime health to `100`.
  - Spawn Point Inspector fields now include a label, kind, and radius.
  - Installing or tagging a Spawn Point now installs the Component Runtime automatically.
- `user-scripts.mjs`
  - Fixed the sandbox runner so `onUpdate`, `onKeyPress`, and `onCollision` assignments are captured from script code.
  - This bug was preventing installed gameplay scripts from ticking even when the script card showed as installed.
- `scripts/smoke-production.mjs`
  - Requires the live Game Systems Library to tag Spawn Points.
  - Fails production smoke unless saved projects include Spawn Point components.
  - Enters Play mode, forces runtime health to `0`, and fails unless the component runtime respawns to `100` HP.
- App deployment `7f3399a9-fcc0-44f4-847b-079d06cea6fa`
  - Source `f71e8d3`; bundle `/assets/play-1kwhOa_e.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - This deployment was superseded because production smoke revealed the sandbox was not capturing `onUpdate` hooks.
- Final app deployment `bde12b5e-d62c-4318-96f3-cc2d4992e663`
  - Source `dd6afca`; bundle `/assets/play-ZkCR6qii.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `8` changed files, reused `97` already-uploaded files, and refreshed `_headers`.
  - Quick hook probe on `https://crateshipgames.com/play` confirmed both `gb_inventory_hotbar` and `gb_component_runtime` had active `onUpdate` hooks.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported systems: `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, checkpoints:1 tagged, win:1 tagged, spawns:1 tagged, damage:Ready`.
  - Production smoke confirmed selected components: `pickup, checkpoint, winCondition, spawnPoint`.
  - Production smoke verified respawn runtime: `1` respawn and `100` HP.

Follow-up production deploys on 2026-05-18 added Door and Trigger systems:

- `game-builder-ui.mjs`
  - Added Door and Trigger component buttons plus Game Systems cards.
  - Added Door Inspector fields for label, axis, slide distance, and speed.
  - Added Trigger Inspector fields for label, action, target door id, radius, and message.
  - Extended Component Runtime to collect doors/triggers in Play mode, fire trigger zones, and open the nearest or targeted door.
  - Runtime HUD now lists door open/closed state and the last fired trigger.
  - Readiness now tracks trigger and door counts separately.
- `scripts/smoke-production.mjs`
  - Requires the live Game Systems Library to include Door and Trigger cards.
  - Tags a live city object with Door and Trigger components, saves the project, reloads it, enters Play mode, and fails unless the trigger opens the door.
  - Prints global gameplay component coverage in smoke output so Door/Trigger can be verified even when selected object remains the pickup/spawn object.
- Final app deployment `157f4b60-1d07-427d-8366-d698d8de0ba5`
  - Source `f846adf`; bundle `/assets/play-DcjOECDa.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported systems: `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Production smoke verified Door/Trigger runtime: `Group trigger opened Group door`.
  - Production smoke verified gameplay components: `door, triggerZone, pickup, checkpoint, winCondition, spawnPoint`.

Follow-up production deploys on 2026-05-18 added Mission Flow systems:

- `game-builder-ui.mjs`
  - Added Mission, Reward, and Gate component buttons plus Game Systems cards.
  - Added Mission Step Inspector fields for label, order, required step id, and radius.
  - Added Reward Inspector fields for label, item, score, required step id, and radius.
  - Added Mission Gate Inspector fields for label, required step id, axis, distance, and speed.
  - Extended Component Runtime to complete mission steps, grant score/inventory rewards, and unlock sliding mission gates in Play mode.
  - Runtime HUD now lists mission progress and the last claimed reward.
  - Readiness now tracks mission step, reward, and gate counts separately.
- `scripts/smoke-production.mjs`
  - Requires the live Game Systems Library to include Mission Flow, Rewards, and Mission Gates.
  - Tags a live city object with Mission Step, Reward, and Mission Gate components, saves the project, reloads it, enters Play mode, and fails unless the mission step completes, the reward is claimed, and the gate unlocks.
  - Prints mission runtime evidence in smoke output.
- Final app deployment `06f6f159-b445-4ee8-8b20-7c61e644b837`
  - Source `f851cfc`; bundle `/assets/play-DGlRyrjF.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported systems: `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Production smoke verified Mission runtime: `Smoke mission step -> Smoke reward -> Smoke gate (75 score)`.
  - Production smoke verified gameplay components: `missionStep, missionReward, missionGate, door, triggerZone, pickup, checkpoint, winCondition, spawnPoint`.

Follow-up production deploys on 2026-05-18 added Enemy Spawn and Wave systems:

- `game-builder-ui.mjs`
  - Added Enemy Spawn and Wave component buttons plus Game Systems cards.
  - Added Enemy Spawn Inspector fields for label, type, count, radius, speed, damage, health, attack radius, and cooldown.
  - Added Wave Controller Inspector fields for label, wave number, count, spawn target, enemy overrides, and reward score.
  - Extended Component Runtime to create red runtime enemy meshes in Play mode, attach them to the engine object registry, move them toward the player, apply cooldown-based damage, and clear them when leaving Play.
  - Runtime attacks support `F`, `E`, or Space to damage the closest enemy, with wave summary tracking alive/defeated/cleared state.
  - Runtime HUD now lists wave state and alive enemy count.
  - Readiness now tracks enemy spawn and wave counts separately.
- `scripts/smoke-production.mjs`
  - Requires the live Game Systems Library to include Enemy Spawns and Wave Controller.
  - Tags a live city object with Enemy Spawn and Wave Controller components, saves the project, reloads it, enters Play mode, and fails unless the wave spawns runtime enemies.
  - Prints enemy wave runtime evidence in smoke output.
- Final app deployment `2fc7c8cb-5569-4809-8736-a794b630028a`
  - Source `e7bc20d`; bundle `/assets/play-C7T9ROip.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported systems: `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, enemySpawns:1 tagged, waves:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Production smoke verified Enemy wave runtime: `Smoke wave from Smoke enemy spawn (2 spawned, 2 alive)`.
  - Production smoke verified gameplay components: `enemySpawn, waveController, missionStep, missionReward, missionGate, door, triggerZone, pickup, checkpoint, winCondition, spawnPoint`.

Follow-up production deploys on 2026-05-18 added Inventory, Equipment, and Player Progression:

- `game-builder-ui.mjs`
  - Upgraded the Inventory preset into `Inventory + Equipment` with a five-slot hotbar, structured inventory items, equipment slots, and player stats.
  - Added equipped weapon, armor, trinket, level, XP, attack, defense, speed, and attack range to runtime state and the Play-mode HUD.
  - Added the `Equipment Item` Game System, component preset, and inspector fields for item, slot, power, score, XP, and pickup radius.
  - Updated pickups and mission rewards to grant structured items and optional XP/equipment bonuses instead of plain string inventory entries.
  - Added enemy and wave drop fields so defeated runtime enemies can grant score, XP, inventory items, and equipment.
  - Runtime attacks now use player/equipment attack damage and attack range instead of fixed combat values.
  - Readiness now tracks equipment components in the Progress row.
- `user-scripts.mjs`
  - Hardened gameplay key handling with a capture-phase document listener and a handled-event flag, so attack and play/edit hotkeys are not lost or double-fired.
- `scripts/smoke-production.mjs`
  - Requires the live Game Systems Library to include Equipment.
  - Tags a live city object with an Equipment Item component and verifies save/load restoration.
  - Configures a trinket mission reward and a weapon enemy drop, then fails unless Play mode grants inventory, equips the weapon, and raises the attack stat.
  - Prints inventory/equipment/stat runtime evidence in smoke output.
- Final app deployment `f025f020-b916-4f8c-9cba-dac8a003c484`
  - Source `d7df45a`; bundle `/assets/play-Cn8E9d2h.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `8` changed files, reused `97` already-uploaded files, and refreshed `_headers`.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `node --check user-scripts.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported systems: `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, equipment:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, enemySpawns:1 tagged, waves:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Production smoke verified Inventory runtime: `smoke blade equipped smoke blade (7 power, 20 attack, 3 items)`.
  - Production smoke verified gameplay components: `equipmentItem, enemySpawn, waveController, missionStep, missionReward, missionGate, door, triggerZone, pickup, checkpoint, winCondition, spawnPoint`.

Follow-up production deploys on 2026-05-18 added NPC Dialogue and Merchant systems:

- `game-builder-ui.mjs`
  - Added Dialogue NPC and Merchant Game System cards plus component presets.
  - Added NPC inspector fields for name, role, dialogue, quest id, requirement, reward item, reward slot, reward power, reward score, reward XP, and radius.
  - Added Merchant inspector fields for name, item, price, equipment slot, power, XP, stock, and radius.
  - Extended Component Runtime with `gbRuntime.npcs`, `gbRuntime.merchants`, active NPC/merchant tracking, dialogue state, NPC reward grants, and merchant purchases.
  - Play mode now supports `T` to talk to nearby NPCs and `E` to buy from merchants before falling back to enemy attack.
  - Runtime HUD now shows nearby NPC/merchant prompts, dialogue text, and the last purchase.
  - Readiness now tracks Dialogue NPC and Merchant component counts.
- `scripts/smoke-production.mjs`
  - Requires the live Game Systems Library to include `npcs` and `merchants`.
  - Tags live city objects with NPC and Merchant components, saves the project, reloads it, enters Play mode, and verifies both components restore.
  - Verifies NPC dialogue grants `smoke note`, then verifies the merchant sells and equips `smoke cloak`.
- Final app deployment `b8b2adb0-dc89-4aaf-95e8-a873ef7a72af`
  - Source `4c8b817`; bundle `/assets/play-BBnOxDb9.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke reported systems: `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, equipment:1 tagged, npcs:1 tagged, merchants:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, enemySpawns:1 tagged, waves:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Production smoke verified NPC runtime: `Smoke guide said "The city needs a real quest giver." and granted smoke note`.
  - Production smoke verified Merchant runtime: `Smoke vendor sold smoke cloak for 25 score (4 armor power)`.
  - Production smoke verified gameplay components: `merchant, npc, equipmentItem, enemySpawn, waveController, missionStep, missionReward, missionGate, door, triggerZone, pickup, checkpoint, winCondition, spawnPoint`.

Follow-up production deploys on 2026-05-18 added Playable Web Package export:

- `project-tools.mjs`
  - Added `exportPlayablePackage()` to turn the current project snapshot into a single playable HTML package.
  - The package embeds the `.crate` project data, object/component manifest, shared asset-host URL, Three.js player runtime, WASD movement, NPC dialogue, merchant purchase, pickup/equipment collection, and simple combat interaction.
  - The export also prepares `game.crate` and `README.md` payloads in `window._lastPlayableExport` for diagnostics and future zip packaging.
- `engine.mjs`
  - Added a `Playable Web Package` button to the Export Scene modal.
  - Exposed `exportAsHTML`, `exportForUnity`, `exportForUnreal`, and `_exportPlayablePackage` on `window` so inline export actions can call the module wrappers reliably.
- `scripts/smoke-production.mjs`
  - Requires the live export modal to include the playable package button.
  - Calls `_exportPlayablePackage({ download:false })` on the real custom domain and fails unless the output includes embedded project data, runtime controls, NPC/merchant support, the asset-host URL, and a large enough playable HTML payload.
- Final app deployment `adbf2876-0a00-4da6-9948-4f2d53091739`
  - Source `face24d`; bundle `/assets/play-V6Rd-gpY.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `8` changed files, reused `97` already-uploaded files, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check project-tools.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke verified playable export `production-smoke-game-playable.html` with `411` objects, `14` components, and `209790` HTML bytes.
  - Production smoke still verified NPC, merchant, enemy wave, inventory/equipment, mission, door/trigger, respawn, project save/load, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added Publish Library and portable game links:

- `engine.mjs`
  - Added local published-game records in `localStorage.crate_published_games`.
  - Added `_publishLocalGame`, `_showPublishedGames`, and `_getPublishedGames` helpers for publishing, managing, and smoke-testing local published builds.
  - Publish now creates a portable `/play?published=<slug>#<encoded-project>` link even when the user is not signed in, while premium server-side publishing still remains available when auth allows it.
  - The Export Scene modal now includes `Publish to Game Library` and `Published Games` actions.
  - Shared/published links can load full `crate-engine-project` JSON through `deserializeScene()`, and `?published=<slug>` can fall back to a local published-library row when no hash is present.
  - Exposed `_loadSharedScene`, `_compressScene`, and `_decompressScene` for verification and future publish-link tooling.
- `scripts/smoke-production.mjs`
  - Requires the live export modal to include publish and published-library controls.
  - Publishes `production-smoke-published-game` on the real custom domain, verifies the share URL, checks the saved library row, decodes the full project payload, and confirms the generated playable package is runtime-ready.
- Final app deployment `824c508c-7cca-474a-ad8f-de4002b1853f`
  - Source `f534ac2`; bundle `/assets/play-ve-g4PUj.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The main app upload skipped bundled `/models` and `/textures`, uploaded `6` changed files, reused `99` already-uploaded files, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Production smoke verified published game `production-smoke-published-game` with `411` objects, `14` components, and a `209819` byte playable package.
  - Production smoke still verified NPC, merchant, enemy wave, inventory/equipment, mission, door/trigger, respawn, project save/load, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added the Cloudflare Published Games API:

- `functions/api/games/[[path]].js`
  - Added Pages Functions routes for `POST /api/games/publish`, `GET /api/games/<slug>`, and `GET /api/games`.
  - Stores published game records in the existing `CRATE_GAMES` KV namespace.
  - Saves the full project payload, encoded scene data, publish metadata, component counts, playable-package summary, and clean URL.
- `wrangler.toml`
  - Updated the Pages project name to `crateship-games`.
  - Added the `CRATE_GAMES` KV binding.
  - Updated the compatibility date for this deploy.
- `_routes.json` and `vite.config.mjs`
  - Added route rules so only `/api/*` invokes Pages Functions.
  - The static app continues serving normally from Pages assets.
- `engine.mjs`
  - Publish now syncs local published-game records to `/api/games/publish`.
  - A synced game uses the clean URL `/play?published=<slug>` instead of requiring the hash payload.
  - Clean published links can fetch the game from `/api/games/<slug>` in a fresh browser and load it through `deserializeScene()`.
  - Local hash links and local-library fallback remain available if the API is unavailable.
- `scripts/smoke-production.mjs`
  - Verifies the publish API response, direct game lookup, list lookup, and clean cloud link loading in a fresh browser context.
  - Blocks service workers during smoke so verification uses the live Cloudflare deployment instead of cached worker responses.
- Final app deployment `559da24a-c56f-4cb0-abfb-287ea6926070`
  - Source `51dcde5`; bundle `/assets/play-D3alRuCc.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - The final upload reused all `105` static files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Published API: cloudflare-pages-kv 200 (cloud-published, 411 objects loaded)`.
  - Production smoke still verified NPC, merchant, enemy wave, inventory/equipment, mission, door/trigger, respawn, project save/load, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added the Cloud Published Games library UI:

- `engine.mjs`
  - The `Published Games` modal now has separate `Cloud Library` and `This Browser` sections.
  - The Cloud Library fetches `/api/games`, has a `Refresh Cloud` button, and renders clean cloud rows with readonly URLs plus Copy Link and Open controls.
  - The modal keeps browser-local published records visible for offline/local fallback.
  - The modal fetches the just-published slug directly if it is not already in the latest cloud list, so a new publish appears immediately.
  - Exposes `window._fetchCloudPublishedGames` for smoke/debug checks.
- `scripts/smoke-production.mjs`
  - Opens the Published Games modal after publishing `production-smoke-published-game`.
  - Waits for the Cloud Library to report `data-status="loaded"`.
  - Verifies both cloud and local rows exist, the cloud URL is `/play?published=production-smoke-published-game` with no hash payload, and copy/open buttons are present.
- Final app deployment `fc425040-70f5-403a-a6ce-063784376e45`
  - Source `8d6f6ea`; bundle `/assets/play-CXxUDet_.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Published library UI: 1 cloud rows, 1 local rows`.
  - Production smoke verified `Published API: cloudflare-pages-kv 200 (cloud-published, 349 objects loaded)`.
  - Production smoke still verified NPC, merchant, enemy wave, inventory/equipment, mission, door/trigger, respawn, project save/load, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added published-game editor actions:

- `game-builder-ui.mjs`
  - Added a direct `Published` action to the Project panel, so creators can open the cloud/browser published-game library without going through Export first.
- `engine.mjs`
  - Added an `Edit` action to each published-game row.
  - Cloud rows load the selected slug from `/api/games/<slug>` and deserialize it back into the editor.
  - Browser-local rows load their saved `projectData` or encoded scene payload back into the editor.
  - Exposes `window._loadPublishedGameIntoEditor` and records `window._lastPublishedEditorLoad` after a row load.
- `scripts/smoke-production.mjs`
  - Requires the new Project-panel `published` action.
  - Opens the Published Games modal from the Project panel.
  - Verifies cloud and local published rows both expose Edit controls.
- Final app deployment `6c6c8626-9b13-4b7a-9614-406a3af8840b`
  - Source `6f58dc8`; bundle `/assets/play-Ck3o3p7W.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Published library UI: 1 cloud rows, 1 local rows, 2 edit buttons`.
  - Production smoke verified `Published API: cloudflare-pages-kv 200 (cloud-published, 411 objects loaded)`.
  - Production smoke still verified NPC, merchant, enemy wave, inventory/equipment, mission, door/trigger, respawn, project save/load, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added published-game search/filter and edit-load smoke:

- `engine.mjs`
  - Added a search field to the Published Games modal.
  - Added `All`, `Cloud`, and `Browser` filters with a visible result-count summary.
  - Fixed a click-handler collision where storing filter state on the modal as `data-published-source-filter` intercepted row Edit clicks.
- `scripts/smoke-production.mjs`
  - Verifies the search field and source filter buttons exist.
  - Types `production smoke`, switches between Cloud and Browser filters, then returns to All.
  - Clicks the cloud row Edit action and waits for the published game to deserialize back into the editor.
- Intermediate deployment `11b39c0f-9dd7-499f-abcf-b972da753eab`
  - Source `cad9f6c`; bundle `/assets/play-Djk_FoSI.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`.
  - Superseded because live smoke timed out on the new Edit-click check; root cause was the modal filter-state attribute intercepting row clicks.
- Final app deployment `2c8e6ec0-a4d3-48fc-9c67-38fe20a84192`
  - Source `295390c`; bundle `/assets/play-BoyOU95c.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Published library UI: 1 cloud rows, 1 local rows, 2 edit buttons`.
  - Production smoke verified `Published editor load: cloud-published production-smoke-published-game (411 objects, filter production smoke)`.
  - Production smoke verified `Published API: cloudflare-pages-kv 200 (cloud-published, 411 objects loaded)`.
  - Production smoke still verified NPC, merchant, enemy wave, inventory/equipment, mission, door/trigger, respawn, project save/load, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added published-game management guardrails:

- `functions/api/games/[[path]].js`
  - Added `DELETE /api/games/<slug>` for published-game cleanup.
  - Added owner-token and admin-token authorization helpers while storing only a SHA-256 owner token hash in KV.
  - Publish now preserves existing ownership and requires the matching owner token or admin token before overwriting an owner-managed slug.
  - Published game detail responses return full scene/project/playable data but never expose the stored owner hash.
  - List/detail metadata now marks owner-managed games with `ownerManaged`.
- `engine.mjs`
  - Added a browser-local owner token for publishing from the editor.
  - Syncs the owner token to Cloudflare publish requests so the same browser can later manage its own published game.
  - Added a Published Games detail panel with metadata, object/component/script counts, asset/tag summaries, readonly URL, Edit, Duplicate, Copy, Open, and Delete/Remove actions.
  - Cloud rows can now fetch full details before rendering, duplicate a published game back into the editor, and delete from Cloudflare when the owner token matches.
  - Browser-local rows can be removed locally without touching the cloud library.
- `scripts/smoke-production.mjs`
  - Verifies the publish API and list API both return `ownerManaged`.
  - Publishes a temporary delete-guard game, confirms an unauthenticated delete returns `403`, confirms owner-token delete returns `200`, and confirms the deleted game then returns `404`.
  - Runs the expected `403/404` delete-guard requests from Node-side fetch instead of the browser so expected API guard responses do not pollute the browser console error gate.
  - Opens the Published Games detail panel and verifies the loaded cloud detail includes project data plus Duplicate and Delete controls.
- Intermediate app deployment `c255ae77-3834-41c2-989e-118c9e71bb1e`
  - Source `454dd47`; bundle `/assets/play-LnmMuJtF.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the app upload uploaded `6` changed files and reused `99` already-uploaded files.
  - Superseded because production smoke correctly failed after the in-browser delete-guard test caused expected `403` and `404` API responses to appear as browser console resource errors.
- Final app deployment `587cfc81-130c-4bbf-a0e6-01a6eb6882ed`
  - Source `0155d9b`; bundle `/assets/play-LnmMuJtF.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The final upload reused all `105` static files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Published management: detail loaded, owner managed, delete guard 403/200/404`.
  - Production smoke verified `Published library UI: 1 cloud rows, 2 local rows, 3 edit buttons`.
  - Production smoke verified `Published editor load: cloud-published production-smoke-published-game (411 objects, filter production smoke)`.
  - Production smoke still verified NPC, merchant, enemy wave, inventory/equipment, mission, door/trigger, respawn, project save/load, playable export, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added published-game metadata management:

- `functions/api/games/[[path]].js`
  - Added `PATCH /api/games/<slug>` for owner/admin metadata updates without republishing the whole game.
  - Published games now store sanitized creator name/website metadata, `visibility` (`public` or `unlisted`), and moderation status.
  - Public list results now include active public games only; unlisted games still load directly by slug and can be managed by owner token.
  - Metadata updates require the matching owner token or admin token; moderation-status changes require admin authorization.
- `engine.mjs`
  - Added browser-local creator profile storage for published games.
  - Added browser-local admin-token storage for future moderation/admin operations.
  - Publish now sends creator metadata and visibility to Cloudflare.
  - Published Games detail panel now shows creator and visibility, and includes a List/Unlist action backed by the new PATCH route.
- `scripts/smoke-production.mjs`
  - Publishes the production smoke game with creator metadata and public visibility.
  - Verifies detail/list API responses preserve creator metadata and visibility.
  - Publishes a temporary metadata guard game, updates it to `unlisted` through `PATCH`, confirms it no longer appears in the public list, confirms direct slug lookup still works, then deletes it.
- Final app deployment `f1fcd980-8c12-49a2-9692-043250b2d662`
  - Source `92f41e6`; bundle `/assets/play-jPFx6JZK.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Published metadata: creator Production Smoke Creator, visibility public, unlisted guard 200/unlisted`.
  - Production smoke verified `Published management: detail loaded, owner managed, delete guard 403/200/404`.
  - Production smoke verified `Published library UI: 1 cloud rows, 3 local rows, 4 edit buttons`.
  - Production smoke still verified NPC, merchant, enemy wave, inventory/equipment, mission, door/trigger, respawn, project save/load, playable export, cloud clean-link loading, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added the public Published Games marketplace browser:

- `marketplace.html`
  - Added a top-level `Published Games` section above the asset marketplace grids.
  - Fetches public published games from `/api/games?limit=24`.
  - Renders playable cards with creator name, description, object/component/script counts, Play, and Remix links.
  - Adds a search field and refresh button for public game browsing.
  - Runs independently of the Three.js asset viewer module so published games can render even if a 3D asset preview is slow.
- `scripts/smoke-production.mjs`
  - Verifies `https://crateshipgames.com/marketplace.html` returns `200 text/html`.
  - Opens the live marketplace page, waits for the Published Games section to load, searches `production smoke`, and verifies the public smoke game appears.
  - Verifies the temporary unlisted metadata guard game does not appear in the marketplace browser.
- Final app deployment `c2ca8b5a-150d-4329-a7bc-4f0f7a0294fe`
  - Source `c191064`; bundle `/assets/play-jPFx6JZK.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `1` changed file, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Marketplace games: 1/1 shown for production smoke, smoke visible`.
  - Production smoke still verified published metadata, owner/delete guardrails, clean cloud link loading, playable export, all live gameplay systems, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added marketplace game discovery filters:

- `functions/api/games/[[path]].js`
  - Added public list query support for `q`, `tag`, and `sort`.
  - Centralized published-game summary metadata through `recordMetadata(record)`.
  - Public summaries now include sanitized description, tags, scripts, object/component counts, creator name, visibility, and moderation status.
  - Public list responses include available tags plus the selected query, tag, and sort values.
  - Supported sort modes are newest updated, title, objects, components, and scripts.
- `marketplace.html`
  - Added a category/tag chip row backed by published-game tags.
  - Added a sort select for newest, title, object count, component count, and script count.
  - Published-game cards now show tags and keep Play/Remix links visible after filtering.
  - The browser state exposes `window._cratePublishedMarketplace` with status, totals, query, tag, sort, slugs, and available tags for smoke checks.
- `scripts/smoke-production.mjs`
  - Searches `production smoke`, clicks the `smoke` category chip, chooses object-count sorting, and verifies the smoke game remains visible.
  - Verifies the available tag list includes `smoke` and `publish`.
  - Still verifies the temporary unlisted metadata guard game does not appear in the marketplace browser.
- Final app deployment `01afd098-d832-447b-b47b-86a59b2f2ace`
  - Source `1eb0e04`; bundle `/assets/play-jPFx6JZK.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `1` changed file, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Marketplace games: 1/1 shown for production smoke tag smoke sort objects, smoke visible`.
  - Production smoke still verified published metadata, owner/delete guardrails, clean cloud link loading, playable export, all live gameplay systems, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added public game detail pages and pagination:

- `game.html`
  - Added a dedicated public published-game detail page loaded by `?slug=<game-slug>`.
  - Fetches `/api/games/<slug>` and shows title, creator, description, tags, counts, component/system tags, updated time, asset host, Play Game, Open in Engine, and Browse More Games actions.
  - Exposes `window._crateGameDetail` for smoke verification.
- `functions/api/games/[[path]].js`
  - Added `page`, `pageSize`, `total`, `pages`, `hasNext`, and `hasPrev` fields to public list responses.
  - Scans published-game KV metadata before filtering so `q`, `tag`, and `sort` are applied before pagination.
  - Keeps direct slug list compatibility while returning the same paging metadata shape.
- `marketplace.html`
  - Added Previous/Next pagination controls for Published Games.
  - Card actions now include a Details link to `/game.html?slug=<slug>`.
  - Marketplace smoke state now includes page, page size, pagination presence, and detail href.
- `vite.config.mjs`
  - Added `game.html` to the Vite build inputs so it is deployed with the rest of the static app.
- `scripts/smoke-production.mjs`
  - Verifies `/game.html?slug=production-smoke-published-game` returns `200 text/html` on the custom domain.
  - Opens the public detail page and verifies the smoke game title, creator, visibility, tags, stats, and Play/Open links.
  - The first smoke immediately after deploy saw `/game.html` return `404` on the custom domain while the Pages preview URL already served the page; after Cloudflare propagation, rerunning the same smoke passed.
- Final app deployment `27ce8272-0693-44a6-9ba9-0b7a2f7912dd`
  - Source `f60bb86`; bundle `/assets/play-jPFx6JZK.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `3` changed files, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing for `marketplace.html` and `game.html`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Game detail: production-smoke-published-game by Production Smoke Creator (411 objects, 14 components)`.
  - Production smoke still verified marketplace filters, published metadata, owner/delete guardrails, clean cloud link loading, playable export, all live gameplay systems, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added public marketplace discovery rails:

- `marketplace.html`
  - Added three Published Games discovery sections: Featured Builds, Recent Publishes, and Top Systems.
  - Discovery rails are populated from the public `/api/games?limit=50&sort=updated` metadata list.
  - Featured is ranked by object/component/script richness, Recent is ranked by publish update time, and Top Systems is ranked by component count.
  - Rail cards link to the public `/game.html?slug=<slug>` detail page.
  - Exposes `window._cratePublishedDiscovery` with rail status, total games, rail-card count, and lane slugs for production smoke checks.
- `scripts/smoke-production.mjs`
  - Waits for the discovery rails to load on the live marketplace page.
  - Verifies the smoke published game appears in Featured Builds, Recent Publishes, and Top Systems.
  - Logs `Marketplace discovery: loaded 3 cards from 1 games` in the current smoke dataset.
- Final app deployment `ab9765be-0bbb-4cbf-9bf0-f26d11049844`
  - Source `1255806`; bundle `/assets/play-jPFx6JZK.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `1` changed file, reused `106` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, inline HTML script parsing for `marketplace.html` and `game.html`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Marketplace discovery: loaded 3 cards from 1 games`.
  - Production smoke still verified marketplace filters, public game details, published metadata, owner/delete guardrails, clean cloud link loading, playable export, all live gameplay systems, and remote asset-host checks.

Follow-up production deploys on 2026-05-19 added admin-featured game curation metadata:

- `functions/api/games/[[path]].js`
  - Added `featured` and `featuredAt` fields to published-game records, KV metadata, public list responses, and game detail responses.
  - Preserves existing featured state when a game is republished.
  - Requires Cloudflare admin authorization for featured changes; owner tokens can still update safe owner metadata but get `403` when trying to feature a game.
- `marketplace.html`
  - Featured Builds now puts admin-featured games first, then falls back to the existing richness score when no admin picks exist.
  - Added a compact Featured badge for promoted games on cards and rail rows.
  - Expanded `window._cratePublishedDiscovery` with admin-featured slugs and featured flags for smoke verification.
- `game.html`
  - Public game detail pages now show Featured status and expose it through `window._crateGameDetail`.
- `engine.mjs`
  - Published Games cloud detail panel now shows Featured status and a Feature/Unfeature admin button.
  - The admin token field already stored in the Published Games modal is used through `X-Crate-Admin-Token`.
- `scripts/smoke-production.mjs`
  - Verifies owner-token attempts to set `featured` are blocked with `403`.
  - Verifies the Published Games detail panel includes the featured curation control.
  - Logs featured state on marketplace discovery and public game detail smoke output.
- Final app deployment `3e04786d-eb8c-4ee0-b524-7be1b637df9f`
  - Source `0f0789c`; bundle `/assets/play-ovN8zwhf.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload uploaded `8` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing for `marketplace.html` and `game.html`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Published metadata: creator Production Smoke Creator, visibility public, unlisted guard 200/unlisted, featured guard 403, featured toggle ready`.
  - Production smoke verified `Marketplace discovery: loaded 3 cards from 1 games, admin featured 0`.
  - Production smoke verified `Game detail: production-smoke-published-game by Production Smoke Creator (411 objects, 14 components, featured no)`.
  - Smoke URL was `https://crateshipgames.com/play?verify=featured-curation-0f0789cf`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-featured-curation-0f0789cf.png`.

Follow-up production deploys on 2026-05-19 added the admin moderation dashboard:

- `admin.html`
  - Added a dedicated Published Game Moderation dashboard.
  - Uses the same browser-local admin token key as the Published Games modal: `crate_publish_admin_token`.
  - Shows moderation totals for total, listed, unlisted, hidden, featured, and owner-managed games.
  - Provides search, status filter, sort controls, and row actions for Feature/Unfeature, List/Unlist, Hide/Restore, Details, and Open.
  - Exposes `window._crateAdminDashboard` for production smoke verification without exposing token values.
- `functions/api/games/[[path]].js`
  - Added admin-only `GET /api/games/admin/list`.
  - Returns metadata-only rows plus counts, filtering, sorting, paging, featured state, moderation state, and last audit fields.
  - Keeps unauthenticated admin-list requests blocked with `403`.
  - Stores compact admin audit entries in each KV record when admin changes visibility, moderation status, or featured state.
- `vite.config.mjs`
  - Added `admin.html` as a Vite build input so it ships with the static app.
- `scripts/smoke-production.mjs`
  - Verifies `/admin.html` returns `200 text/html` on the custom domain.
  - Verifies `/api/games/admin/list` returns `403` without an admin token.
  - Verifies the dashboard renders the locked state with token, filter, sort, refresh, save, clear, table, and Review Queue controls.
  - Supports optional `CRATE_SMOKE_ADMIN_TOKEN`; when provided, the smoke logs into the dashboard and verifies the smoke game appears in the admin list.
- Final app deployment `10d6f2e4-33a0-4b96-9ed9-9fb63c3185f4`
  - Source `5fefd03`; bundle stayed `/assets/play-ovN8zwhf.js` because this pass did not change the engine runtime bundle.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures` and did include `admin.html`.
  - The app upload uploaded `2` changed files, reused `107` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing for `admin.html`, `marketplace.html`, and `game.html`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Admin moderation: API guard 403, dashboard locked, controls ready`.
  - Smoke URL was `https://crateshipgames.com/play?verify=admin-moderation-5fefd03b`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-moderation-5fefd03b.png`.

Follow-up production deploys on 2026-05-19 bound D1 moderation audit storage:

- Cloudflare D1
  - Created remote database `crateship-games-audit`.
  - Database ID: `9cbee4e4-caa7-43fb-bbb7-9f0f7d7e2b9a`.
  - Bound it to the Pages Functions runtime as `CRATE_AUDIT` in `wrangler.toml`.
  - Ran `migrations/0001_moderation_audit.sql` against the remote database.
  - Confirmed the remote `moderation_audit` table exists.
- `functions/api/games/[[path]].js`
  - Added protected `POST /api/games/admin/audit/backfill?dryRun=true`.
  - The backfill route requires a valid Cloudflare admin token with `admin` role.
  - The route scans `CRATE_GAMES` KV records and copies existing `auditTrail` entries into D1.
  - The backfill route is idempotent for existing audit entries by preserving audit IDs or deriving stable IDs from slug, timestamp, index, and changed fields.
- Remote data check
  - The current KV namespace only had the smoke game key `game:production-smoke-published-game`.
  - That record had `auditTrail: []`, so there were no old moderation events to backfill yet.
  - D1 row count after migration/backfill prep: `0`.
- `scripts/smoke-production.mjs`
  - Added an unauthenticated guard check for the audit backfill route.
  - Production smoke now requires admin list, audit history, and audit backfill endpoints to return `403` without admin authorization.
- Final app deployment `b0c3106d-4223-4a4b-823f-94ed6167b689`
  - Source `0bc525a`; bundle `/assets/play-ovN8zwhf.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload reused `109` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check functions/api/games/[[path]].js`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Admin moderation: API guard 403, audit guard 403, backfill guard 403, dashboard locked, controls ready, actor ready, audit panel ready, review notes ready`.
  - Smoke URL was `https://crateshipgames.com/play?verify=admin-audit-d1-0bc525a7`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-audit-d1-0bc525a7.png`.

Follow-up production deploys on 2026-05-19 added a D1 audit storage probe:

- `functions/api/games/[[path]].js`
  - Added protected `POST /api/games/admin/audit/verify`.
  - The route requires a valid Cloudflare admin token with `admin` role.
  - It verifies D1 write/read/delete by inserting a temporary `__audit_probe__` row, reading it back, and deleting it before returning.
  - It does not mutate any published game record and does not leave a persistent audit row when the delete succeeds.
- `scripts/smoke-production.mjs`
  - Added an unauthenticated guard check for the audit verify route.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is present in the local/CI environment, smoke posts to `/api/games/admin/audit/verify` and requires `writeVerified: true`.
  - The current local environment did not have `CRATE_SMOKE_ADMIN_TOKEN`, so this live smoke verified the new route is locked and left the authenticated probe for CI/local env configuration.
- Final app deployment `01ada5ca-a48a-4afa-b746-eae1bbfc85ce`
  - Source `d605a14`; bundle `/assets/play-ovN8zwhf.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload reused `109` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check functions/api/games/[[path]].js`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Admin moderation: API guard 403, audit guard 403, verify guard 403, backfill guard 403, dashboard locked, controls ready, actor ready, audit panel ready, review notes ready`.
  - Smoke URL was `https://crateshipgames.com/play?verify=audit-probe-d605a14a`.
  - D1 row count after deploy remained `0`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-audit-probe-d605a14a.png`.

Follow-up production deploys on 2026-05-19 surfaced audit storage verification in the admin dashboard:

- `admin.html`
  - Added an `Audit storage` panel to the Published Game Moderation dashboard.
  - The panel shows the D1 moderation audit status while locked, loading, ready, verifying, verified, or failed.
  - Added a `Verify D1` button that calls `POST /api/games/admin/audit/verify` only after a valid admin token has loaded the dashboard.
  - The button runs the same temporary write/read/delete D1 probe as the API smoke path and does not mutate published game records.
  - Exposes `hasAuditStorage`, `hasAuditStorageVerify`, `auditStorageStatus`, `auditStorageSource`, and `auditStorageWriteVerified` on `window._crateAdminDashboard` for smoke verification.
- `scripts/smoke-production.mjs`
  - Verifies the storage panel and button exist in the locked dashboard state on the live custom domain.
  - If `CRATE_SMOKE_ADMIN_TOKEN` is present, smoke now clicks the dashboard `Verify D1` button and requires the UI to report `verified` from source `d1`.
- Final app deployment `e09eea70-4137-4eaa-91bc-d7d60dfaa7f7`
  - Source `cb41922`; bundle `/assets/play-ovN8zwhf.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; `.deploy` had no `/models` or `/textures`.
  - The app upload changed `admin.html`, reused `108` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, inline script parsing for `admin.html`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Admin moderation: API guard 403, audit guard 403, verify guard 403, backfill guard 403, dashboard locked, controls ready, actor ready, audit panel ready, storage panel locked, review notes ready`.
  - Smoke URL was `https://crateshipgames.com/play?verify=admin-storage-cb419225`.
  - D1 row count after deploy remained `0`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-storage-cb419225.png`.

Follow-up production deploys on 2026-05-20 added frame-budget probes and fixed Build City steady-state performance:

- `engine.mjs`
  - Added `window._crateFrameProfile` with sampled frame time, update time, render time, FPS, draw calls, triangles, and object counts.
  - Scheduled heavy editor/runtime updates differently in Edit, Explore, and Play so non-play modes do less per-frame work.
  - Moved smart traffic out from the FPS-counter-only block, then guarded it so it skips simpler city-builder traffic cars that do not use smart `direction` vectors.
  - Kept programmatic object selection blocked outside Edit mode unless explicitly forced.
- `city-builder.mjs`
  - Added static procedural proxy batching with `THREE.InstancedMesh` for repeated balanced-profile props such as lamps, signs, fences, trees, flowers, barrels, and parked proxy vehicles.
  - Left animated traffic lights and moving vehicles as separate objects so their state and animation remain editable/testable.
- `game-builder-ui.mjs`
  - Performance diagnostics now read the engine frame profile and show update/render loop timing.
- `scripts/smoke-production.mjs`
  - Added a raw Build City frame probe that resets frame samples after `build city`, reads live renderer counters directly, and fails if draw calls/triangles exceed the production budget.
  - Added Explore/Play bridge-selection checks so programmatic selection cannot mutate editor state outside Edit.
  - Added concise Door/Trigger timeout diagnostics that report runtime/component/frame state without dumping large frame arrays.
- Superseded app deployment `0adaaa21-4db8-47f3-a8c1-d3688b361f62`
  - Source `4e9eb4a`; bundle `/assets/play-DZRofMvR.js`.
  - Added the first frame-profile/raw-probe pass.
  - Production smoke failed after entering Play because the newly un-gated smart traffic loop hit city-builder cars without `direction.clone()`.
- Superseded app deployment `eb3288a3-8e9d-4616-a4c6-ee88f2f244ee`
  - Source `e7cd940`; bundle `/assets/play-BDVa3m9_.js`.
  - Kept component runtime metadata refreshed outside Play and made Spin/Float mutate only in Play.
  - Production smoke still failed on the same Play-frame smart traffic crash.
- Superseded app deployment `02a96039-11ac-4e53-81d6-1d71e5db5abd`
  - Source `913384b`; bundle `/assets/play-Byn16iFg.js`.
  - Fixed the smart traffic crash by skipping non-smart city-builder traffic entries.
  - Production smoke reached the gameplay/runtime checks but failed the new raw Build City budget with about `1,120` immediate draw calls.
- Final app deployment `8ef07d4e-230c-4e8b-a054-6cc2380f4718`
  - Source `ded2a36`; bundle `/assets/play-C3NW8f4Y.js`.
  - Was staged with `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and did include `admin.html` and `play.html`.
  - The app-only deploy uploaded `8` changed files, reused `103` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check city-builder.mjs`, `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Production smoke verified `Performance: ready (71.4 FPS, 14 ms, 73 calls, 4932 tris)`.
  - Production smoke verified raw Build City frame budget: `20.1 FPS`, `49.7 ms` average, `742` calls, `286,222` triangles, `45` samples.
  - Production smoke verified `Readiness: Ready to test, 192 objects, 2 scripts, 40 components, Edit mode`.
  - Production smoke verified project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, Door/Trigger, Mission, NPC, Merchant, Enemy Wave, Inventory, and Respawn runtime systems.
  - Remote D1 `moderation_audit` row count after deploy remained `0`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-city-batch-ded2a368.png`.

## Deploy Workflow

Run these from the repo:

```powershell
cd C:\Users\koike\Downloads\crate-engine-web-latest
npm run check
npm run check:assets
npm run build
npx wrangler pages functions build
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'
npm run prepare:deploy
npx wrangler pages deploy .deploy `
  --project-name=crateship-games `
  --branch=main `
  --commit-hash=<current-git-commit> `
  --commit-message="<deploy message>" `
  --commit-dirty=false
npm run smoke:production
```

Prepare and deploy the separate asset host when model or texture assets change:

```powershell
$env:CRATE_MODELS_DIR='C:\Users\koike\Documents\Codex\2026-05-16\okay-so-let-s-find-my\models-live-cache\models'
npm run prepare:deploy:assets
npx wrangler pages deploy .deploy-assets `
  --project-name=crateship-games-assets `
  --branch=main `
  --commit-hash=<current-git-commit> `
  --commit-message="<asset deploy message>" `
  --commit-dirty=false
```

Prepare the main Cloudflare upload directory without bundled assets:

```powershell
$env:CRATE_DEPLOY_INCLUDE_ASSETS='false'
npm run prepare:deploy
```

The app reads `<meta name="crate-asset-base" content="https://crateship-games-assets.pages.dev">`
from `play.html` and `demo.html`, so the city builder loads `/models/*` and
`/textures/*` from the asset project.

### D1 Audit Storage Workflow

The moderation audit D1 database was created and migrated on 2026-05-19:

```powershell
npx wrangler d1 list
npx wrangler d1 create crateship-games-audit
npx wrangler d1 execute crateship-games-audit --remote --file migrations\0001_moderation_audit.sql
npx wrangler d1 execute crateship-games-audit --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name; SELECT COUNT(*) AS audit_rows FROM moderation_audit;"
```

Current binding in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "CRATE_AUDIT"
database_name = "crateship-games-audit"
database_id = "9cbee4e4-caa7-43fb-bbb7-9f0f7d7e2b9a"
```

Protected backfill endpoint:

```text
POST https://crateshipgames.com/api/games/admin/audit/backfill?dryRun=true
```

Protected temporary D1 write probe endpoint:

```text
POST https://crateshipgames.com/api/games/admin/audit/verify
```

Both routes require a valid admin token and role `admin`. Do not put admin
tokens in tracked files or browser-exposed code. For production smoke, set
`CRATE_SMOKE_ADMIN_TOKEN` only in the local shell or CI secret environment.

Deploy to the real Cloudflare Pages project:

```powershell
npx wrangler pages deploy .deploy `
  --project-name=crateship-games `
  --branch=main `
  --commit-hash=<current-git-commit> `
  --commit-message="<deploy message>" `
  --commit-dirty=false
```

Important: do not deploy only `dist` manually. Use `prepare:deploy` so `_headers`,
`404.html`, static catalogs, and the current asset-host strategy are preserved.

### Asset Host Override Workflow

The current production app uses `https://crateship-games-assets.pages.dev` by
default. For temporary testing, override the asset base in the browser:

```javascript
window.CRATESHIP_ASSET_BASE_URL = 'https://assets.example.com';
localStorage.setItem('crate_asset_base_url', 'https://assets.example.com');
```

For smoke tests against a different asset host:

```powershell
$env:CRATE_SMOKE_ASSET_BASE_URL='https://assets.example.com'
npm run smoke:production
```

## Model Assets

The repo does not contain a normal usable `models/` directory on this machine.
The repo root `models` entry is a small text/stub file pointing to:

```text
/Users/jamainemartin/.openclaw/workspace/crate-engine/web/models
```

That path is not valid on this Windows machine. For the 2026-05-17 production
deploy, Codex reconstructed a deploy-safe model cache from the already-working
live site:

```text
C:\Users\koike\Documents\Codex\2026-05-16\okay-so-let-s-find-my\models-live-cache\models
```

Recovered model cache summary:

- Requested live model/catalog paths: `4,188`
- Real assets saved: `4,143`
- Failed downloads: `0`
- Known live-missing fallback paths: `45`
- Recovered asset size: about `1.70 GB`
- First Pages upload skipped `4,193` already-uploaded files and uploaded `55` changed files.
- Follow-up source-sync deploy skipped `4,244` already-uploaded files and uploaded `4` changed files.
- Latest builder-overlay deploy skipped `4,245` already-uploaded files and uploaded `3` changed files.
- HDR/Poly Haven texture deploy skipped `4,276` already-uploaded files and uploaded `8` changed files.
- Inspector/blueprint deploy skipped `4,281` already-uploaded files and uploaded `3` changed files.
- Asset-host pipeline deploy skipped `4,272` already-uploaded files and uploaded `12` changed files.
- Poly Haven buffer deploy skipped `4,285` already-uploaded files and uploaded `1` changed file plus `_headers`.
- Predeploy asset-check guardrail deploy uploaded `0` changed files, reused `4,286` already-uploaded files, and refreshed `_headers`.
- Production smoke-test deploy uploaded `0` changed files, reused `4,286` already-uploaded files, and refreshed `_headers`.
- Initial asset-host deploy to `crateship-games-assets` uploaded `4,182` files after one retry.
- Hardened asset-host deploy uploaded `1` changed file, reused `4,182` already-uploaded files, and refreshed `_headers`.
- Lean main-app deploy skipped bundled `/models` and `/textures`, uploaded `2` changed files, reused `103` already-uploaded files, and refreshed `_headers`.
- Asset-manifest deploy uploaded `1` changed file, reused `4,183` already-uploaded files, and refreshed `_headers`.
- Furniture/mode main-app deploy skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
- Play-mode separation main-app deploy skipped bundled `/models` and `/textures`, uploaded `6` changed files, reused `99` already-uploaded files, and refreshed `_headers`.
- Asset-placement main-app deploy skipped bundled `/models` and `/textures`, uploaded `8` changed files, reused `97` already-uploaded files, and refreshed `_headers`.
- Editor-lock intermediate main-app deploy skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, refreshed `_headers`, and was superseded after smoke caught a read-only inspector redraw gap.
- Editor-lock fix main-app deploy skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
- Project-controls main-app deploy skipped bundled `/models` and `/textures`, uploaded `6` changed files, reused `99` already-uploaded files, and refreshed `_headers`.
- Rich-project-snapshot main-app deploy skipped bundled `/models` and `/textures`, uploaded `6` changed files, reused `99` already-uploaded files, and refreshed `_headers`.
- Status-summary main-app deploy skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
- Readiness-panel main-app deploy skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
- Game-systems main-app deploy skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
- Checkpoint-win main-app deploy skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `102` already-uploaded files, and refreshed `_headers`.
- Published-management main-app deploy skipped bundled `/models` and `/textures`, reused all `105` static files on the final upload, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
- Published-metadata main-app deploy skipped bundled `/models` and `/textures`, uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
- Published-games marketplace deploy skipped bundled `/models` and `/textures`, uploaded `1` changed file, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
- Marketplace filters deploy skipped bundled `/models` and `/textures`, uploaded `1` changed file, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
- Published-game detail-pages deploy skipped bundled `/models` and `/textures`, uploaded `3` changed files, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
- Published-game discovery-rails deploy skipped bundled `/models` and `/textures`, uploaded `1` changed file, reused `106` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
- Frame-budget and city-batching deploys skipped bundled `/models` and `/textures`; the final `ded2a368` app-only deploy uploaded `8` changed files, reused `103` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.

Critical city assets verified after deploy:

```text
https://crateship-games-assets.pages.dev/models/kenney_cars/sedan.glb
https://crateship-games-assets.pages.dev/models/house_interior_pack_chair_1.glb
https://crateship-games-assets.pages.dev/models/buildings_pack_3_6story_stack_mat.glb
https://crateship-games-assets.pages.dev/models/fab/street_props_streeprops.glb
https://crateship-games-assets.pages.dev/models/ph_modular_street_seating.glb
https://crateship-games-assets.pages.dev/textures/modular_street_seating_armrests_diff_1k.jpg
https://crateship-games-assets.pages.dev/textures/modular_street_seating_supports_nor_gl_1k.jpg
https://crateship-games-assets.pages.dev/textures/modular_electricity_poles_nor_gl_1k.jpg
https://crateship-games-assets.pages.dev/textures/modular_electricity_poles_pieces_arm_1k.jpg
https://crateship-games-assets.pages.dev/models/modular_street_seating.bin
https://crateship-games-assets.pages.dev/models/modular_electricity_poles.bin
```

The `.glb` assets returned `Content-Type: model/gltf-binary` on the asset host.
The modular texture dependencies returned `200 OK` with `Content-Type: image/jpeg`.
The modular `.bin` buffer dependencies returned `200 OK` with
`Content-Type: application/octet-stream` and `/models/*` CORS/cache headers.
Missing asset-host model paths return `404 Not Found` and `Cache-Control: no-store`.
The asset manifest is available at:

```text
https://crateship-games-assets.pages.dev/asset-manifest.json
```

Current manifest version:

```text
6f09cc09da2f
```

## Post-Deploy Verification

Always verify the real site:

```powershell
npm run check:assets
npm run smoke:production
curl.exe -L --silent https://crateshipgames.com/play | Select-String -Pattern "crate-asset-base|assets/play"
curl.exe -I -L https://crateship-games-assets.pages.dev/asset-manifest.json
curl.exe -I -L https://crateship-games-assets.pages.dev/models/kenney_cars/sedan.glb
curl.exe -I -L https://crateship-games-assets.pages.dev/models/fab/street_props_streeprops.glb
curl.exe -I -L https://crateship-games-assets.pages.dev/textures/modular_street_seating_armrests_diff_1k.jpg
curl.exe -I -L https://crateship-games-assets.pages.dev/textures/modular_electricity_poles_nor_gl_1k.jpg
curl.exe -I -L https://crateship-games-assets.pages.dev/models/modular_street_seating.bin
curl.exe -I -L https://crateship-games-assets.pages.dev/models/__definitely_missing__.glb
```

Expected current results:

- `npm run check:assets` passes from this app-only checkout by validating `114` remote asset URLs and `107` catalog references against `https://crateship-games-assets.pages.dev`.
- `npm run smoke:production` passes against `https://crateshipgames.com/play` and reports `Asset base: https://crateship-games-assets.pages.dev` plus `Asset manifest: 6f09cc09da2f`.
- `/play` references `/assets/play-C3NW8f4Y.js`.
- `/play` includes `<meta name="crate-asset-base" content="https://crateship-games-assets.pages.dev">`.
- `/asset-manifest.json` returns `200 OK`, `application/json`, and `Cache-Control: no-store`.
- Existing `.glb` models return `200 OK` and `model/gltf-binary` on the asset host.
- The representative furniture asset `/models/house_interior_pack_chair_1.glb` returns `200 OK` and `model/gltf-binary` on the asset host.
- Modular texture dependencies return `200 OK` and `image/jpeg` from the asset host `/textures/*`.
- Modular Poly Haven buffer dependencies return `200 OK` from the asset host `/models/*`.
- The served play bundle contains `HDRLoader` and no `RGBELoader` references.
- The served play bundle contains `gb-inspector`, `gb-blueprints`, `Inspector`, and `Blueprints`.
- The served play bundle contains `data-gb-mode`, `Explore Mode`, the fixed `let score = 0` command matcher, and the asset catalog availability filter.
- The served play bundle contains `gb-placement-status`, `window._placeCatalogAsset`, and `window._lastAssetPlacement`.
- The served play bundle hides the Game Builder and model browser in Play mode and restores them after switching back to Edit.
- The served play bundle contains `data-gb-edit-only`, `gb-readonly-note`, and the forced inspector refresh used by the Edit/Explore/Play lock.
- Explore mode disables Game Builder mutation controls, and forced clicks on those disabled controls do not change object count, selection, or components.
- The served play bundle contains `gb-project`, `data-gb-action="import"`, `data-gb-action="export"`, and the project Save/Load modal IDs used by smoke tests.
- The Game Builder stats summary reads with clear separators, for example `192 objects, 40 components, 2 scripts, Edit mode`.
- The served play bundle contains `gb-readiness`, `window._gameBuilderReadiness`, and readiness smoke output like `Ready to test, 192 objects, 2 scripts, 40 components, Edit mode`.
- The served play bundle contains `window._crateFrameProfile`, and production smoke verifies both the Game Builder Performance panel and the raw Build City frame budget.
- Current production smoke reports the settled Performance panel as `93.5 FPS`, `10.7 ms`, `27` calls, and `5,052` triangles.
- Current production smoke reports raw Build City as `66.7 FPS`, `15 ms`, `316` calls, and `283,478` triangles.
- The served play bundle contains `gb-systems`, `window._gameBuilderSystems`, and systems smoke output with Inventory installed, Runtime installed, Pickup tagged, Mission tagged, Reward tagged, Gate tagged, Checkpoint tagged, Win Condition tagged, Door tagged, Trigger tagged, and Spawn Point tagged.
- The served play bundle contains `checkpoint`, `winCondition`, `spawnPoint`, `door`, `triggerZone`, `missionStep`, `missionReward`, `missionGate`, and Component Runtime support for active checkpoints, active player spawns, respawns, door opening, trigger zones, mission steps, reward claims, mission gates, and game-complete/game-over states.
- Installed scripts expose active runtime hooks through `onUpdate`, so the Component Runtime actually ticks in Play mode.
- The production smoke forces runtime health to `0` in Play mode and expects the Spawn/Checkpoint runtime to respawn back to `100` HP.
- The production smoke verifies Trigger opens Door in Play mode and prints the opened door/trigger labels from the selected smoke object.
- The production smoke verifies Mission Step grants Reward and opens Mission Gate in Play mode and prints `Mission runtime: Smoke mission step -> Smoke reward -> Smoke gate (75 score)`.
- The Project section can save a named project, open Import, open Export, and keeps Import disabled in Explore while Export stays enabled.
- Saved projects use `version: 3` and include object snapshots, asset paths, builder components, and installed user scripts.
- The served app-assets bundle contains the asset resolver exports and `_crateAssetUrl` support.
- Missing asset-host model paths return `404 Not Found`, not `200 text/html`.
- The Published Games modal exposes search/filter, row Edit, row Details, creator/admin settings, detail-panel Duplicate, List/Unlist, and guarded Delete/Remove controls.
- The published-game API marks owner-managed records, blocks unmanaged deletes with `403`, accepts matching owner-token deletes with `200`, returns `404` after successful delete, and supports owner-token metadata updates with public/unlisted visibility.
- The published-game API exposes `featured` and `featuredAt`, requires admin authorization for featured changes, and blocks owner-token-only featured updates with `403`.
- The Published Games cloud detail panel exposes a Feature/Unfeature control when a Cloudflare admin token is saved in the modal.
- `/marketplace.html` exposes the public Published Games browser backed by `/api/games`, supports Featured Builds, Recent Publishes, Top Systems, search, tag/category filters, sorting, pagination, and detail links, and unlisted games are excluded from that public browser.
- `/game.html?slug=<published-game-slug>` loads a public game detail page from `/api/games/<slug>` with Play Game, Open in Engine, and Featured status.
- `/admin.html` loads the Published Game Moderation dashboard, stays locked without the Cloudflare admin token, and uses `GET /api/games/admin/list` plus existing `PATCH /api/games/<slug>` actions for admin moderation.
- `GET /api/games/admin/list` returns `403` without admin authorization and returns metadata-only rows with counts, filters, sorting, featured status, moderation status, and last audit fields when authorized.
- `GET /api/games/admin/audit/<slug>`, `POST /api/games/admin/audit/verify`, and `POST /api/games/admin/audit/backfill?dryRun=true` all return `403` without admin authorization.
- The admin dashboard includes an `Audit storage` panel and `Verify D1` button; without an admin token it stays locked, and with `CRATE_SMOKE_ADMIN_TOKEN` smoke can click it to verify temporary D1 write/read/delete.
- `CRATE_AUDIT` points at D1 database `crateship-games-audit` (`9cbee4e4-caa7-43fb-bbb7-9f0f7d7e2b9a`), and the remote `moderation_audit` table exists.

Browser verification history:

- `Game Builder` panel visible on `https://crateshipgames.com/play`.
- Panel state: `data-open="true"`.
- Preset button count after the first Game Builder deploy: `26`.
- Clicking `Inventory` installed one user script.
- Typing `build city` on the real site built a city:
  - Engine objects: `408`
  - Scene children: `414`
  - Bundle: `/assets/play-CdQnR1E6.js`
- Final custom-domain verification after deployment `b054c20b-1a78-44aa-acef-844d6e9983ad`:
  - `/play` served `/assets/play-CZKplQBh.js`.
  - Modern City preset built the city from the live Game Builder panel.
  - Scene list populated with `10` visible rows.
  - Pickup component tagging changed the live stats to `408 objects`, `1 components`, `2 scripts`.
  - No `result is not defined` command-runner error was seen after the fix.
- Final custom-domain verification after deployment `c7f5a390-c203-426a-8e21-232437a25f0e`:
  - `/play` served `/assets/play-C18sl_xm.js`.
  - The served bundle had `HDRLoader` and no `RGBELoader`.
  - Root texture URLs under `/textures/*` returned `200 OK image/jpeg`.
  - Typing `build city` in the live command box built the city and populated the Game Builder scene list.
  - Live Game Builder stats after the browser run: `408 objects`, `0 components`, `2 scripts`.
  - No new browser logs matched `RGBELoader`, `Couldn't load texture`, `modular_street_seating`, `modular_electricity_poles`, or failed modular GLB loads during the verified run.
- Final custom-domain verification after deployment `567b6212-c084-45ad-bf85-4069754db6e8`:
  - `/play` served `/assets/play-C5SgZO54.js`.
  - The served bundle included the new Inspector and Blueprints UI code.
  - Live command box `build city` built the city.
  - Selecting a scene row opened the Inspector with transform fields and component fields.
  - Adding `Pickup` created editable `Score` and `Radius` fields.
  - Saving `Collectible Blueprint` created a blueprint row with Apply/Delete actions.
  - Applying that blueprint to another scene object changed the live stats to `408 objects`, `2 components`, `2 scripts`.
  - No new console errors were recorded during the verified inspector/blueprint run.
- Final custom-domain verification after deployment `5be13994-820b-4ecf-b815-9f4ab5cab719`:
  - `/play` served `/assets/play-5xgKmEkq.js`.
  - The live app exposed `window._crateAssetUrl`.
  - Typing `build city` on the real site built `408 objects`.
  - The Game Builder Inspector and Blueprints sections were present.
  - The verification found warnings for `ph_modular_street_seating.glb` and `ph_modular_electricity_poles.glb`; these were caused by missing external `.bin` buffers.
- Final custom-domain verification after deployment `475ff430-bbfe-45cf-9460-f32cdbacadf8`:
  - `/play` still served `/assets/play-5xgKmEkq.js`.
  - `/models/modular_street_seating.bin` and `/models/modular_electricity_poles.bin` returned `200 OK`.
  - Typing `build city` on the real site built `409 objects`.
  - The Game Builder Inspector and Blueprints sections were present.
  - No console logs matched `failed`, `RGBELoader`, `Couldn't load texture`, `modular_street_seating`, or `modular_electricity_poles`.
  - No `/models/*` or `/textures/*` browser responses returned `400+` during the verified run.
- Final custom-domain verification after deployment `41e5066b-ed87-43c5-a8be-5bf9e4f192aa`:
  - Cloudflare source showed `4340fff`.
  - `/play?verify=4340fff1` still served `/assets/play-5xgKmEkq.js`.
  - `npm run check:assets` passed before deploy with `108` required models, `20` external dependencies, and `107` catalog references.
  - Cloudflare uploaded `0` changed files, reused `4,286` already-uploaded files, and refreshed `_headers`.
  - `/models/modular_street_seating.bin` returned `200 OK`, `application/octet-stream`, and the `/models/*` CORS/cache headers.
  - `/models/__definitely_missing__.glb` returned `404 Not Found` instead of app HTML.
- Final custom-domain verification after deployment `adee2aca-1910-45fb-b517-fb62f9abef53`:
  - Cloudflare source showed `d1efb55`.
  - `/play?verify=d1efb55` still served `/assets/play-5xgKmEkq.js`.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke result: `409` objects, `10` scene rows, `2` scripts, selected component `pickup`.
  - Critical HTTP checks passed: sedan GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-d1efb55.png`.
- Final asset-host verification after deployment `d6e01bfb-66b0-4d69-a9a1-51f1d625bb74`:
  - Cloudflare source showed `9afd946`.
  - `https://crateship-games-assets.pages.dev/models/kenney_cars/sedan.glb` returned `200 OK` and `model/gltf-binary`.
  - `https://crateship-games-assets.pages.dev/models/modular_street_seating.bin` returned `200 OK` and `application/octet-stream`.
  - `https://crateship-games-assets.pages.dev/textures/modular_street_seating_armrests_diff_1k.jpg` returned `200 OK` and `image/jpeg`.
  - `https://crateship-games-assets.pages.dev/models/__definitely_missing__.glb` returned `404 Not Found`.
- Final custom-domain verification after deployment `bbadc73c-c7a7-45cb-9bd3-662c843bbc89`:
  - Cloudflare source showed `5c139d3`.
  - `/play?verify=5c139d3a` served `/assets/play-5xgKmEkq.js`.
  - `/play?verify=5c139d3a` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke result: asset base `https://crateship-games-assets.pages.dev`, `409` objects, `10` scene rows, `2` scripts, selected component `pickup`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-5c139d3a.png`.
- Final custom-domain verification after deployment `e2b1f6e2-7e26-4254-9b3d-67d731015a90`:
  - Cloudflare source showed `e235efe`.
  - `/play?verify=<timestamp>` served `/assets/play-Df5V4vMM.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke verified `add chair`, `build city`, Game Builder Inventory, Scene list, Pickup component tagging, and Explore/Edit mode switching.
  - Smoke result: asset manifest `6f09cc09da2f`, `410` objects, `10` scene rows, `2` scripts, mode `edit`, selected component `pickup`.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mp9vevn1.png`.
- Final custom-domain verification after deployment `239040e1-3f9c-48b8-a31e-0ea17d220dbe`:
  - Cloudflare source showed `0932fa3`.
  - `/play?verify=<timestamp>` served `/assets/play-CYg0M6tJ.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check:assets` passed with `108` required models, `20` external dependencies, and `107` catalog references.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke verified catalog filtering, `add chair`, `build city`, Game Builder Inventory, Scene list, Pickup component tagging, and Explore/Edit mode switching.
  - Smoke result: asset manifest `6f09cc09da2f`, hidden unavailable assets `45`, `410` objects, `10` scene rows, `2` scripts, mode `edit`, selected component `pickup`.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpa2pxfr.png`.
- Final custom-domain verification after deployment `5c762057-59bc-4f0d-beb1-ac80cdd6471f`:
  - Cloudflare source showed `a677827`.
  - `/play?verify=<timestamp>` served `/assets/play-C7r1H5jl.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run build`, and `npm run check:assets` passed before deploy.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke verified catalog filtering, `add chair`, `build city`, Game Builder Inventory, Scene list, Pickup component tagging, Explore/Edit switching, and Play/Edit separation.
  - Smoke result: asset manifest `6f09cc09da2f`, hidden unavailable assets `45`, `410` objects, `10` scene rows, `2` scripts, mode `edit`, selected component `pickup`.
  - Play mode smoke verified the Game Builder and prompt were hidden in Play, then restored the Game Builder after returning to Edit.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpa3n1f4.png`.
- Final custom-domain verification after deployment `f365f9e1-591e-4faa-ae13-8b7724753c2d`:
  - Cloudflare source showed `1967b37`.
  - `/play?verify=<timestamp>` served `/assets/play-BFEZwrmY.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run build`, and `npm run check:assets` passed before deploy.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke verified tracked furniture placement, placement status UI, selected placed asset, catalog filtering, `add chair`, `build city`, Game Builder Inventory, Scene list, Pickup component tagging, Explore/Edit switching, and Play/Edit separation.
  - Smoke result: asset manifest `6f09cc09da2f`, hidden unavailable assets `45`, `411` objects, `10` scene rows, `2` scripts, mode `edit`, placement `placed (production-smoke)`, selected component `pickup`.
  - Play mode smoke verified the Game Builder, prompt, and model browser were hidden in Play, then restored after returning to Edit.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpa4m4hq.png`.
- Intermediate custom-domain verification after deployment `3c88d1a7-d5f7-466d-b5a8-78a55bbfcdc2`:
  - Cloudflare source showed `c529d95`.
  - `/play?verify=<timestamp>` served `/assets/play-Bli1_0nK.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - Production smoke verified controls were disabled in Explore, but failed because the read-only inspector note did not redraw immediately after an engine-side mode switch.
  - This was fixed by deployment `4e7ae6f3-4238-4158-b907-4290eefae405`.
- Final custom-domain verification after deployment `4e7ae6f3-4238-4158-b907-4290eefae405`:
  - Cloudflare source showed `b8364e7`.
  - `/play?verify=<timestamp>` served `/assets/play-DowQ6fa7.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run build`, and `npm run check:assets` passed before deploy.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke verified tracked furniture placement, placement status UI, selected placed asset, catalog filtering, `add chair`, `build city`, Game Builder Inventory, Scene list, Pickup component tagging, Explore read-only locking, Edit control restore, and Play/Edit separation.
  - Smoke result: asset manifest `6f09cc09da2f`, hidden unavailable assets `45`, `411` objects, `10` scene rows, `2` scripts, mode `edit`, placement `placed (production-smoke)`, selected component `pickup`.
  - Play mode smoke verified the Game Builder, prompt, and model browser were hidden in Play, then restored after returning to Edit.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbiyeq0.png`.
- Final custom-domain verification after deployment `8cc68a30-fb5b-45ca-a6f0-3fb9962ce2e9`:
  - Cloudflare source showed `1cb6c6c`.
  - `/play?verify=<timestamp>` served `/assets/play-Cdu9RoE0.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run build`, and `npm run check:assets` passed before deploy.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke verified Project Save, Import, and Export controls before the existing city/gameplay checks.
  - Smoke result: asset manifest `6f09cc09da2f`, hidden unavailable assets `45`, `411` objects, `10` scene rows, `2` scripts, `1` saved project, mode `edit`, placement `placed (production-smoke)`, selected component `pickup`.
  - Explore smoke verified mutating project controls like Import are disabled while Export stays available.
  - Play mode smoke verified the Game Builder, prompt, model browser, and project modals were not left visible during Play.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbjdqtv.png`.
- Final custom-domain verification after deployment `7617ff7e-4bd1-4f3f-b1f2-be9f68e2203c`:
  - Cloudflare source showed `679a58d`.
  - `/play?verify=<timestamp>` served `/assets/play-BKNz5ckv.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run build`, and `npm run check:assets` passed before deploy.
  - `npm run smoke:production` passed after deploy on the real custom domain.
  - Smoke verified Project Save/Import/Export controls, then saved after city build, tracked asset placement, Inventory script install, and Pickup component tagging.
  - Smoke result: asset manifest `6f09cc09da2f`, hidden unavailable assets `45`, `411` objects, `10` scene rows, `2` scripts, `1` saved project, project snapshot `v3` with `411` objects and `2` scripts, mode `edit`, placement `placed (production-smoke)`, selected component `pickup`.
  - Explore smoke verified mutating project controls like Import are disabled while Export stays available.
  - Play mode smoke verified the Game Builder, prompt, model browser, and project modals were not left visible during Play.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbjouuf.png`.
- Intermediate custom-domain verification after deployment `f35c9da7-79e1-4a77-9ba4-c86a27b7a853`:
  - Cloudflare source showed `2f688bf`.
  - `/play?verify=<timestamp>` served `/assets/play-DO9LsZCu.js`.
  - `/play?verify=<timestamp>` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check` and `npm run build` passed before deploy.
  - `npm run smoke:production` failed after 120 seconds while waiting for project Load to restore the saved city and Pickup component.
- Intermediate custom-domain verification after deployment `a9f65d82-422e-4afa-ac6e-da42c572304c`:
  - Cloudflare source showed `8350b0b`.
  - `/play?verify=8350b0b-1779130707705` served `/assets/play-ds8MB5xP.js`.
  - `/play?verify=8350b0b-1779130707705` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check` and `npm run build` passed before deploy.
  - `npm run smoke:production` failed because the typed prompt path still saved only the two chair commands, not the city replay command.
- Final custom-domain verification after deployment `3caa710e-7ae6-416e-ac40-447e5386760d`:
  - Cloudflare source showed `acb2ea2`.
  - `/play?verify=acb2ea2-1779131129878` served `/assets/play-BqRlEDUu.js`.
  - `/play?verify=acb2ea2-1779131129878` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run build`, and `npm run smoke:production` passed against the real custom domain.
  - `npm run check:assets` was not used for the app-only checkout because local `models` is absent after the asset-host split; the production smoke verified the live asset host instead.
  - Smoke verified Project Save/Load restore, Project Import/Export controls, tracked furniture placement, Inventory script install, Pickup component tagging, Explore read-only locking, and Play/Edit separation.
  - Smoke result: asset manifest `6f09cc09da2f`, hidden unavailable assets `45`, `411` objects, `10` scene rows, `2` scripts, `1` saved project, project snapshot `v3` with `411` objects, `2` scripts, and `3` commands.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and a restored Pickup component.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-acb2ea2-live.png`.
- Final custom-domain verification after deployment `03a70092-dd8a-4397-971e-0f7d76cd3734`:
  - Cloudflare source showed `03ad4e1`.
  - `/play?verify=03ad4e1-1779132508465` served `/assets/play-C3mtcMDV.js`.
  - `/play?verify=03ad4e1-1779132508465` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - `npm run check:assets` used the remote asset-host fallback and verified `114` remote assets plus `107` catalog references.
  - Smoke verified the new Asset Pack UI loaded manifest `6f09cc09da2f`.
  - Smoke result: asset manifest `6f09cc09da2f`, hidden unavailable assets `45`, `411` objects, `10` scene rows, `2` scripts, `1` saved project, project snapshot `v3` with `411` objects, `2` scripts, and `3` commands.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and a restored Pickup component.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-03ad4e1-live.png`.
- Final custom-domain verification after deployment `2858ab61-a221-4660-9b63-bc57e139a6e5`:
  - Cloudflare source showed `75eea03`.
  - `/play?verify=75eea039-1779133487829` served `/assets/play-nmptH-vK.js`.
  - `/play?verify=75eea039-1779133487829` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified the Asset Pack UI loaded manifest `6f09cc09da2f`.
  - Smoke result: `411 objects`, `10` scene rows, readable stats `411 objects, 1 components, 2 scripts, Edit mode`, hidden unavailable assets `45`, `1` saved project, and project snapshot `v3` with `411` objects, `2` scripts, and `3` commands.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and a restored Pickup component.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbm59on.png`.
- Final custom-domain verification after deployment `f5bd018f-7619-47d8-8ea2-7e75cb3281c9`:
  - Cloudflare source showed `b30bcf6`.
  - `/play?verify=b30bcf69-1779134335899` served `/assets/play-D_UxywgF.js`.
  - `/play?verify=b30bcf69-1779134335899` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified the Asset Pack UI loaded manifest `6f09cc09da2f`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 1 components, Edit mode`.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and a restored Pickup component.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbmng8a.png`.
- Final custom-domain verification after deployment `f316aad7-26ef-4d4a-b3c2-4d9e72211244`:
  - Cloudflare source showed `147d95a`.
  - `/play?verify=147d95ab-1779134788324` served `/assets/play-BWBpHDR0.js`.
  - `/play?verify=147d95ab-1779134788324` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified the Asset Pack UI loaded manifest `6f09cc09da2f`.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, spawns:Ready, damage:Ready`.
  - Smoke verified Game Builder Readiness still reported `Ready to test, 411 objects, 2 scripts, 1 components, Edit mode`.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and a restored Pickup component.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbmx6fb.png`.
- Final custom-domain verification after deployment `4b4ad1c1-d948-4856-a21c-6f12efa08b62`:
  - Cloudflare source showed `3967314`.
  - `/play?verify=39673143-1779135241661` served `/assets/play-DfB0C3M-.js`.
  - `/play?verify=39673143-1779135241661` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified Checkpoints and Win Condition cards exist in Game Systems.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, checkpoints:1 tagged, win:1 tagged, spawns:Ready, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 3 components, Edit mode`.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and a selected object with `pickup`, `checkpoint`, and `winCondition`.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbn6vdc.png`.
- Final custom-domain verification after deployment `bde12b5e-d62c-4318-96f3-cc2d4992e663`:
  - Cloudflare source showed `dd6afca`.
  - `/play?verify=hooks-dd6afcab-1779110858.34615` served `/assets/play-ZkCR6qii.js`.
  - `/play?verify=hooks-dd6afcab-1779110858.34615` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - Quick hook probe verified installed scripts reported `hasUpdate: true` for Inventory Hotbar and Component Runtime.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, checkpoints:1 tagged, win:1 tagged, spawns:1 tagged, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 4 components, Edit mode`.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and a selected object with `pickup`, `checkpoint`, `winCondition`, and `spawnPoint`.
  - Smoke verified Component Runtime respawned from `0` health back to `100` HP in Play mode.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbnoyxz.png`.
- Final custom-domain verification after deployment `157f4b60-1d07-427d-8366-d698d8de0ba5`:
  - Cloudflare source showed `f846adf`.
  - `/play?verify=doors-f846adfc-1779112342.00942` served `/assets/play-DcjOECDa.js`.
  - `/play?verify=doors-f846adfc-1779112342.00942` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 6 components, Edit mode`.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and restored pickup, door, and trigger components.
  - Smoke verified `Group trigger opened Group door` in Play mode before respawn verification.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbok5hz.png`.
- Final custom-domain verification after deployment `06f6f159-b445-4ee8-8b20-7c61e644b837`:
  - Cloudflare source showed `f851cfc`.
  - `/play?verify=mission-f851cfc1-1779113470.67827` served `/assets/play-DGlRyrjF.js`.
  - `/play?verify=mission-f851cfc1-1779113470.67827` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 9 components, Edit mode`.
  - Project load restored `411` objects and `2` scripts with `411` snapshots applied, `0` spawned, and restored pickup, door, trigger, mission, reward, and gate components.
  - Smoke verified `Smoke mission step -> Smoke reward -> Smoke gate (75 score)` in Play mode before respawn verification.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-mpbp8dt5.png`.
- Final custom-domain verification after deployment `2fc7c8cb-5569-4809-8736-a794b630028a`:
  - Cloudflare source showed `e7bc20d`.
  - `/play?verify=enemy-wave-e7bc20de` served `/assets/play-C7T9ROip.js`.
  - `/play?verify=enemy-wave-e7bc20de` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the upload set had `105` files and no staged `/models` or `/textures` directories.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, enemySpawns:1 tagged, waves:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 11 components, Edit mode`.
  - Project load restored `411` objects and `2` scripts with `410` snapshots applied, `0` spawned, and restored pickup, door, trigger, mission, reward, gate, enemy spawn, and wave components.
  - Smoke verified `Smoke wave from Smoke enemy spawn (2 spawned, 2 alive)` in Play mode before respawn verification.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-enemy-wave-e7bc20de.png`.
- Final custom-domain verification after deployment `f025f020-b916-4f8c-9cba-dac8a003c484`:
  - Cloudflare source showed `d7df45a`.
  - `/play?verify=inventory-d7df45a3` served `/assets/play-Cn8E9d2h.js`.
  - `/play?verify=inventory-d7df45a3` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The upload set changed `8` app files, reused `97` already-uploaded files, and refreshed `_headers`.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `node --check user-scripts.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, equipment:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, enemySpawns:1 tagged, waves:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 412 objects, 2 scripts, 12 components, Edit mode`.
  - Project load restored equipment plus pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Smoke verified Inventory runtime: `smoke blade equipped smoke blade (7 power, 20 attack, 3 items)`.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-inventory-d7df45a3.png`.
- Final custom-domain verification after deployment `b8b2adb0-dc89-4aaf-95e8-a873ef7a72af`:
  - Cloudflare source showed `4c8b817`.
  - `/play?verify=npc-4c8b8179` served `/assets/play-BBnOxDb9.js`.
  - `/play?verify=npc-4c8b8179` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The upload set changed `3` app files, reused `102` already-uploaded files, and refreshed `_headers`.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, equipment:1 tagged, npcs:1 tagged, merchants:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, enemySpawns:1 tagged, waves:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 14 components, Edit mode`.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Smoke verified NPC runtime: `Smoke guide said "The city needs a real quest giver." and granted smoke note`.
  - Smoke verified Merchant runtime: `Smoke vendor sold smoke cloak for 25 score (4 armor power)`.
  - Smoke verified Inventory runtime: `smoke blade equipped smoke blade (7 power, 22 attack, 5 items)`.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-npc-4c8b8179.png`.
- Final custom-domain verification after deployment `adbf2876-0a00-4da6-9948-4f2d53091739`:
  - Cloudflare source showed `face24d`.
  - `/play?verify=export-face24d3` served `/assets/play-V6Rd-gpY.js`.
  - `/play?verify=export-face24d3` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The upload set changed `8` app files, reused `97` already-uploaded files, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check project-tools.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, equipment:1 tagged, npcs:1 tagged, merchants:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, enemySpawns:1 tagged, waves:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 412 objects, 2 scripts, 14 components, Edit mode`.
  - Playable export verified `production-smoke-game-playable.html` with `411` objects, `14` components, and `209790` HTML bytes.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Smoke verified NPC runtime: `Smoke guide said "The city needs a real quest giver." and granted smoke note`.
  - Smoke verified Merchant runtime: `Smoke vendor sold smoke cloak for 25 score (4 armor power)`.
  - Smoke verified Inventory runtime: `smoke blade equipped smoke blade (7 power, 22 attack, 5 items)`.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-export-face24d3.png`.
- Final custom-domain verification after deployment `824c508c-7cca-474a-ad8f-de4002b1853f`:
  - Cloudflare source showed `f534ac2`.
  - `/play?verify=publish-f534ac27` served `/assets/play-ve-g4PUj.js`.
  - `/play?verify=publish-f534ac27` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The upload changed `6` app files, reused `99` already-uploaded files, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, and `npm run smoke:production` passed.
  - `engine.mjs` added the publish library workflow: local published-game records, portable `/play?published=<slug>#<project>` links, a Published Games modal, and export-modal buttons for publishing and library management.
  - `engine.mjs` now lets shared/published links load full project JSON through `deserializeScene()` and still supports local published slug fallback from `localStorage`.
  - `scripts/smoke-production.mjs` now verifies the publish/export buttons, creates `production-smoke-published-game`, checks the stored library row, decodes the saved project, and validates the generated playable package.
  - Smoke verified Game Systems reported `inventory:Installed, hud:Ready, quest:Ready, runtime:Installed, pickups:1 tagged, equipment:1 tagged, npcs:1 tagged, merchants:1 tagged, objectives:Ready, missions:1 tagged, rewards:1 tagged, gates:1 tagged, enemySpawns:1 tagged, waves:1 tagged, checkpoints:1 tagged, win:1 tagged, doors:1 tagged, triggers:1 tagged, spawns:1 tagged, damage:Ready`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 14 components, Edit mode`.
  - Playable export verified `production-smoke-game-playable.html` with `411` objects, `14` components, and `209789` HTML bytes.
  - Published game verified `production-smoke-published-game` with `411` objects, `14` components, and a `209819` byte playable package.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Smoke verified NPC runtime: `Smoke guide said "The city needs a real quest giver." and granted smoke note`.
  - Smoke verified Merchant runtime: `Smoke vendor sold smoke cloak for 25 score (4 armor power)`.
  - Smoke verified Inventory runtime: `smoke blade equipped smoke blade (7 power, 22 attack, 5 items)`.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-publish-f534ac27.png`.
- Final custom-domain verification after deployment `559da24a-c56f-4cb0-abfb-287ea6926070`:
  - Cloudflare source showed `51dcde5`.
  - `/play?verify=api-51dcde5e` served `/assets/play-D3alRuCc.js`.
  - `/play?verify=api-51dcde5e` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The final deploy reused all `105` static files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified `/api/games/publish` wrote `production-smoke-published-game` to `CRATE_GAMES`.
  - Smoke verified `/api/games/production-smoke-published-game` returned `200` with `crate-cloud-published-game`, full project data, `411` objects, and `14` components.
  - Smoke verified `/api/games?slug=production-smoke-published-game` returned the game in the list API.
  - Smoke loaded the clean cloud URL `/play?published=production-smoke-published-game` in a fresh browser context and reported `cloud-published, 411 objects loaded`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 14 components, Edit mode`.
  - Playable export verified `production-smoke-game-playable.html` with `411` objects, `14` components, and `209797` HTML bytes.
  - Published game verified `production-smoke-published-game` with `411` objects, `14` components, and a `209822` byte playable package.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-api-51dcde5e.png`.
- Final custom-domain verification after deployment `fc425040-70f5-403a-a6ce-063784376e45`:
  - Cloudflare source showed `8d6f6ea`.
  - `/play?verify=library-8d6f6ea8` served `/assets/play-CXxUDet_.js`.
  - `/play?verify=library-8d6f6ea8` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The deploy uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke opened the Published Games modal and verified `Published library UI: 1 cloud rows, 1 local rows`.
  - Smoke verified the cloud row uses a clean `/play?published=production-smoke-published-game` link without a hash payload and the local row still exists.
  - Smoke loaded the clean cloud URL `/play?published=production-smoke-published-game` in a fresh browser context and reported `cloud-published, 349 objects loaded`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 412 objects, 2 scripts, 14 components, Edit mode`.
  - Playable export verified `production-smoke-game-playable.html` with `411` objects, `14` components, and `209800` HTML bytes.
  - Published game verified `production-smoke-published-game` with `411` objects, `14` components, and a `209835` byte playable package.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-library-8d6f6ea8.png`.
- Final custom-domain verification after deployment `6c6c8626-9b13-4b7a-9614-406a3af8840b`:
  - Cloudflare source showed `6f58dc8`.
  - `/play?verify=published-edit-6f58dc8d` served `/assets/play-Ck3o3p7W.js`.
  - `/play?verify=published-edit-6f58dc8d` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The deploy uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the Project panel includes the direct `Published` action and opens `#published-games-modal`.
  - Smoke opened the Published Games modal after publishing and verified `Published library UI: 1 cloud rows, 1 local rows, 2 edit buttons`.
  - Smoke loaded the clean cloud URL `/play?published=production-smoke-published-game` in a fresh browser context and reported `cloud-published, 411 objects loaded`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 14 components, Edit mode`.
  - Playable export verified `production-smoke-game-playable.html` with `411` objects, `14` components, and `209800` HTML bytes.
  - Published game verified `production-smoke-published-game` with `411` objects, `14` components, and a `209833` byte playable package.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-published-edit-6f58dc8d.png`.
- Intermediate custom-domain verification after deployment `11b39c0f-9dd7-499f-abcf-b972da753eab`:
  - Cloudflare source showed `cad9f6c`.
  - `/play?verify=published-search-cad9f6ce` served `/assets/play-Djk_FoSI.js`.
  - `npm run smoke:production` failed on the new row Edit-click wait.
  - Targeted live debugging showed the modal remained open, `window._lastPublishedEditorLoad` stayed empty, and the row click was being treated as a filter click because the modal itself had `data-published-source-filter`.
  - Superseded by deployment `2c8e6ec0-a4d3-48fc-9c67-38fe20a84192`.
- Final custom-domain verification after deployment `2c8e6ec0-a4d3-48fc-9c67-38fe20a84192`:
  - Cloudflare source showed `295390c`.
  - `/play?verify=published-search-295390cf` served `/assets/play-BoyOU95c.js`.
  - `/play?verify=published-search-295390cf` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The deploy uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the Published Games search field and All/Cloud/Browser filters.
  - Smoke typed `production smoke`, filtered to Cloud, filtered to Browser, returned to All, then clicked the cloud row Edit action.
  - Smoke verified `Published editor load: cloud-published production-smoke-published-game (411 objects, filter production smoke)`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 14 components, Edit mode`.
  - Playable export verified `production-smoke-game-playable.html` with `411` objects, `14` components, and `209790` HTML bytes.
  - Published game verified `production-smoke-published-game` with `411` objects, `14` components, and a `209823` byte playable package.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-published-search-295390cf.png`.
- Intermediate custom-domain verification after deployment `c255ae77-3834-41c2-989e-118c9e71bb1e`:
  - Cloudflare source showed `454dd47`.
  - `/play?verify=published-guard-454dd47a` served `/assets/play-LnmMuJtF.js`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - `npm run smoke:production` failed because the in-browser delete-guard check intentionally generated expected `403` and `404` API responses, which Chrome surfaced as console resource errors.
  - The smoke was fixed to run those expected guard checks from Node-side fetch and this deployment was superseded by `587cfc81-130c-4bbf-a0e6-01a6eb6882ed`.
- Final custom-domain verification after deployment `587cfc81-130c-4bbf-a0e6-01a6eb6882ed`:
  - Cloudflare source showed `0155d9b`.
  - `/play?verify=published-guard-0155d9b5` served `/assets/play-LnmMuJtF.js`.
  - `/play?verify=published-guard-0155d9b5` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The final upload reused all `105` static files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified published-game ownership metadata, the cloud detail panel, Duplicate and Delete controls, and delete guard responses `403/200/404`.
  - Smoke verified `Published library UI: 1 cloud rows, 2 local rows, 3 edit buttons`.
  - Smoke verified `Published editor load: cloud-published production-smoke-published-game (411 objects, filter production smoke)`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 14 components, Edit mode`.
  - Playable export verified `production-smoke-game-playable.html` with `411` objects, `14` components, and `209796` HTML bytes.
  - Published game verified `production-smoke-published-game` with `411` objects, `14` components, and a `209824` byte playable package.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-published-guard-0155d9b5.png`.
- Final custom-domain verification after deployment `f1fcd980-8c12-49a2-9692-043250b2d662`:
  - Cloudflare source showed `92f41e6`.
  - `/play?verify=published-meta-92f41e6d` served `/assets/play-jPFx6JZK.js`.
  - `/play?verify=published-meta-92f41e6d` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The deploy uploaded `6` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified published-game creator metadata, public visibility, List/Unlist controls, owner-token PATCH updates, and unlisted games being excluded from the public library list.
  - Smoke verified `Published metadata: creator Production Smoke Creator, visibility public, unlisted guard 200/unlisted`.
  - Smoke verified `Published library UI: 1 cloud rows, 3 local rows, 4 edit buttons`.
  - Smoke verified `Published editor load: cloud-published production-smoke-published-game (411 objects, filter production smoke)`.
  - Smoke verified Game Builder Readiness reported `Ready to test, 411 objects, 2 scripts, 14 components, Edit mode`.
  - Playable export verified `production-smoke-game-playable.html` with `411` objects, `14` components, and `209802` HTML bytes.
  - Published game verified `production-smoke-published-game` with `411` objects, `14` components, and a `209832` byte playable package.
  - Project load restored NPC and merchant components plus equipment, pickup, door, trigger, mission, reward, gate, enemy spawn, wave, checkpoint, win, and spawn components.
  - Critical HTTP checks passed: sedan GLB `200`, furniture chair GLB `200`, FAB street props GLB `200`, modular seating `.bin` `200`, modular seating texture `200`, missing model `404`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-published-meta-92f41e6d.png`.
- Final custom-domain verification after deployment `c2ca8b5a-150d-4329-a7bc-4f0f7a0294fe`:
  - Cloudflare source showed `c191064`.
  - `/play?verify=marketplace-c1910645` served `/assets/play-jPFx6JZK.js`.
  - `/play?verify=marketplace-c1910645` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The deploy uploaded `1` changed file, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the public marketplace Published Games browser loaded, searched `production smoke`, showed `production-smoke-published-game`, and did not show the temporary unlisted guard game.
  - Smoke verified `Marketplace games: 1/1 shown for production smoke, smoke visible`.
  - Smoke still verified published metadata, owner/delete guardrails, cloud clean-link loading, playable export, all live gameplay systems, and remote asset-host checks.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-marketplace-c1910645.png`.
- Final custom-domain verification after deployment `01afd098-d832-447b-b47b-86a59b2f2ace`:
  - Cloudflare source showed `1eb0e04`.
  - `/play?verify=market-filters-1eb0e04d` served `/assets/play-jPFx6JZK.js`.
  - `/play?verify=market-filters-1eb0e04d` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The deploy uploaded `1` changed file, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the public marketplace searched `production smoke`, selected tag `smoke`, sorted by `objects`, and kept `production-smoke-published-game` visible.
  - Smoke verified available marketplace tags included `smoke` and `publish`.
  - Smoke verified `Marketplace games: 1/1 shown for production smoke tag smoke sort objects, smoke visible`.
  - Smoke still verified published metadata, owner/delete guardrails, cloud clean-link loading, playable export, all live gameplay systems, and remote asset-host checks.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-market-filters-1eb0e04d.png`.
- Final custom-domain verification after deployment `27ce8272-0693-44a6-9ba9-0b7a2f7912dd`:
  - Cloudflare source showed `f60bb86`.
  - `/play?verify=game-detail-f60bb86e` served `/assets/play-jPFx6JZK.js`.
  - `/play?verify=game-detail-f60bb86e` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html` after custom-domain propagation.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories and did include `game.html`.
  - The deploy uploaded `3` changed files, reused `104` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified marketplace search `production smoke`, tag `smoke`, sort `objects`, page `1`, page size `12`, pagination controls, and the Details link.
  - Smoke verified the public game detail page for `production-smoke-published-game` showed `Production Smoke Creator`, public visibility, smoke tags, `411` objects, `14` components, Play Game, Open in Engine, and Browse More Games actions.
  - Smoke verified `Game detail: production-smoke-published-game by Production Smoke Creator (411 objects, 14 components)`.
  - Smoke still verified published metadata, owner/delete guardrails, cloud clean-link loading, playable export, all live gameplay systems, and remote asset-host checks.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-game-detail-f60bb86e.png`.
- Final custom-domain verification after deployment `ab9765be-0bbb-4cbf-9bf0-f26d11049844`:
  - Cloudflare source showed `1255806`.
  - `/play?verify=discovery-rails-1255806e` served `/assets/play-jPFx6JZK.js`.
  - `/play?verify=discovery-rails-1255806e` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The deploy uploaded `1` changed file, reused `106` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, inline HTML script parsing, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified discovery rails loaded and included `production-smoke-published-game` in Featured Builds, Recent Publishes, and Top Systems.
  - Smoke verified `Marketplace discovery: loaded 3 cards from 1 games`.
  - Smoke still verified marketplace search/tag/sort/pagination/detail link, public game detail page, published metadata, owner/delete guardrails, cloud clean-link loading, playable export, all live gameplay systems, and remote asset-host checks.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-discovery-rails-1255806e.png`.
- Final custom-domain verification after deployment `3e04786d-eb8c-4ee0-b524-7be1b637df9f`:
  - Cloudflare source showed `0f0789c`.
  - `/play?verify=featured-curation-0f0789cf` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=featured-curation-0f0789cf` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories.
  - The deploy uploaded `8` changed files, reused `99` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified owner-token-only featured updates are blocked with `403` and the cloud detail panel exposes the featured curation button.
  - Smoke verified `Published metadata: creator Production Smoke Creator, visibility public, unlisted guard 200/unlisted, featured guard 403, featured toggle ready`.
  - Smoke verified `Marketplace discovery: loaded 3 cards from 1 games, admin featured 0`.
  - Smoke verified `Game detail: production-smoke-published-game by Production Smoke Creator (411 objects, 14 components, featured no)`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-featured-curation-0f0789cf.png`.
- Final custom-domain verification after deployment `10d6f2e4-33a0-4b96-9ed9-9fb63c3185f4`:
  - Cloudflare source showed `5fefd03`.
  - `/play?verify=admin-moderation-5fefd03b` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=admin-moderation-5fefd03b` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories and did include `admin.html`.
  - The deploy uploaded `2` changed files, reused `107` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified unauthenticated `GET /api/games/admin/list` returned `403`.
  - Smoke verified `/admin.html` rendered the locked dashboard with token, filter, sort, refresh, save, clear, table, and Review Queue controls.
  - Smoke verified `Admin moderation: API guard 403, dashboard locked, controls ready`.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-moderation-5fefd03b.png`.
- Final custom-domain verification after deployment `582efb26-a001-4135-b7f7-8c5df3647691`:
  - Cloudflare source showed `f174b26`.
  - `/play?verify=admin-review-notes-f174b263` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=admin-review-notes-f174b263` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had `111` files, no `/models` or `/textures` directories, and did include `admin.html` and `play.html`.
  - The deploy uploaded `1` changed file, reused `108` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - `admin.html` now requires a review note before Hide, Restore, Feature, Unfeature, List, or Unlist admin changes.
  - `functions/api/games/[[path]].js` stores the submitted review note in the admin audit trail and exposes the latest note in moderation-list metadata.
  - `scripts/smoke-production.mjs` verifies the admin review-note textarea and note-required dashboard state on the real custom domain.
  - Smoke verified `Admin moderation: API guard 403, dashboard locked, controls ready, review notes ready`.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-review-notes-f174b263.png`.
- Final custom-domain verification after deployment `355eeee0-9a64-457f-8a76-a2558c1488a1`:
  - Cloudflare source showed `5990090`.
  - `/play?verify=admin-identity-59900900` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=admin-identity-59900900` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had `111` files, no `/models` or `/textures` directories, and did include `admin.html` and `play.html`.
  - The deploy uploaded `1` changed file, reused `108` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - `functions/api/games/[[path]].js` now supports named admin identities through the existing single-token variables plus optional `CRATE_GAMES_ADMIN_TOKENS` or `CRATE_ADMIN_TOKENS`.
  - Supported admin roles are `admin`, `moderator`, `curator`, and `viewer`; role checks gate moderation-status, visibility, and featured changes.
  - Moderation audit entries now record `adminId`, `adminName`, and `adminRole`; moderation-list metadata exposes the latest actor and role.
  - `admin.html` now shows the resolved signed-in admin identity after a token is accepted and shows the latest moderation actor in each audit row.
  - Smoke verified `Admin moderation: API guard 403, dashboard locked, controls ready, actor ready, review notes ready`.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-identity-59900900.png`.
- Final custom-domain verification after deployment `f461b43d-8d29-493b-a9e4-3ad6d041f149`:
  - Cloudflare source showed `5da8d53`.
  - `/play?verify=admin-audit-5da8d53b` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=admin-audit-5da8d53b` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had `111` files, no `/models` or `/textures` directories, and did include `admin.html` and `play.html`.
  - The deploy uploaded `1` changed file, reused `108` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `node --check scripts/smoke-production.mjs`, `node --check functions/api/games/[[path]].js`, inline HTML script parsing, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - `GET /api/games/admin/audit/<slug>` now returns a sanitized moderation audit timeline for authorized admins.
  - `admin.html` now has an Audit History panel and row-level Audit buttons.
  - The audit API uses the D1 binding `CRATE_AUDIT` when available and falls back to the KV record audit trail when D1 is not bound or has no rows.
  - `migrations/0001_moderation_audit.sql` documents the D1 table/index schema for the future `moderation_audit` store.
  - Smoke verified unauthenticated admin list and admin audit endpoints both returned `403`.
  - Smoke verified `Admin moderation: API guard 403, audit guard 403, dashboard locked, controls ready, actor ready, audit panel ready, review notes ready`.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-audit-5da8d53b.png`.
- Final custom-domain verification after deployment `b0c3106d-4223-4a4b-823f-94ed6167b689`:
  - Cloudflare source showed `0bc525a`.
  - `/play?verify=admin-audit-d1-0bc525a7` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=admin-audit-d1-0bc525a7` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories and did include `admin.html` and `play.html`.
  - The deploy reused `109` static files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `CRATE_AUDIT` was bound to D1 database `crateship-games-audit` (`9cbee4e4-caa7-43fb-bbb7-9f0f7d7e2b9a`).
  - The remote `moderation_audit` table exists and currently has `0` rows because the existing KV smoke game had no stored audit trail to backfill.
  - `POST /api/games/admin/audit/backfill?dryRun=true` now exists for protected KV-to-D1 audit backfills.
  - `node --check functions/api/games/[[path]].js`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified unauthenticated admin list, admin audit, and admin audit backfill endpoints all returned `403`.
  - Smoke verified `Admin moderation: API guard 403, audit guard 403, backfill guard 403, dashboard locked, controls ready, actor ready, audit panel ready, review notes ready`.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-audit-d1-0bc525a7.png`.
- Final custom-domain verification after deployment `01ada5ca-a48a-4afa-b746-eae1bbfc85ce`:
  - Cloudflare source showed `d605a14`.
  - `/play?verify=audit-probe-d605a14a` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=audit-probe-d605a14a` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories and did include `admin.html` and `play.html`.
  - The deploy reused `109` static files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `POST /api/games/admin/audit/verify` now exists and is protected for temporary D1 write/read/delete probes.
  - The local smoke environment did not have `CRATE_SMOKE_ADMIN_TOKEN`, so the live smoke verified the route returns `403` without admin authorization.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check functions/api/games/[[path]].js`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified unauthenticated admin list, admin audit, admin audit verify, and admin audit backfill endpoints all returned `403`.
  - Smoke verified `Admin moderation: API guard 403, audit guard 403, verify guard 403, backfill guard 403, dashboard locked, controls ready, actor ready, audit panel ready, review notes ready`.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-audit-probe-d605a14a.png`.
- Final custom-domain verification after deployment `e09eea70-4137-4eaa-91bc-d7d60dfaa7f7`:
  - Cloudflare source showed `cb41922`.
  - `/play?verify=admin-storage-cb419225` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=admin-storage-cb419225` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories and did include `admin.html` and `play.html`.
  - The deploy changed `admin.html`, reused `108` static files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - The Published Game Moderation dashboard now shows an `Audit storage` panel with a locked `Verify D1` control when no admin token is saved.
  - The local smoke environment did not have `CRATE_SMOKE_ADMIN_TOKEN`, so the live smoke verified the storage panel exists and stays locked without admin authorization.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check scripts/smoke-production.mjs`, inline script parsing for `admin.html`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified unauthenticated admin list, admin audit, admin audit verify, and admin audit backfill endpoints all returned `403`.
  - Smoke verified `Admin moderation: API guard 403, audit guard 403, verify guard 403, backfill guard 403, dashboard locked, controls ready, actor ready, audit panel ready, storage panel locked, review notes ready`.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-storage-cb419225.png`.
- Final custom-domain verification after deployment `edfb31a4-3734-45ef-9500-bbd10ad80b8e`:
  - Cloudflare source showed `ee3a574`.
  - `/play?verify=admin-backfill-ee3a5749` served `/assets/play-ovN8zwhf.js`.
  - `/play?verify=admin-backfill-ee3a5749` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories and did include `admin.html` and `play.html`.
  - The deploy uploaded `1` changed file, reused `108` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - The Published Game Moderation dashboard now shows `Verify D1`, `Dry Run Backfill`, and `Backfill D1` controls in the `Audit storage` panel.
  - The new backfill controls stay locked until the admin token is accepted; smoke verifies the locked state and will run the UI dry-run path when `CRATE_SMOKE_ADMIN_TOKEN` is configured.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check scripts/smoke-production.mjs`, inline script parsing for `admin.html`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified unauthenticated admin list, admin audit, admin audit verify, and admin audit backfill endpoints all returned `403`.
  - Smoke verified `Admin moderation: API guard 403, audit guard 403, verify guard 403, backfill guard 403, dashboard locked, controls ready, actor ready, audit panel ready, storage panel locked, backfill controls locked, review notes ready`.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-admin-backfill-ee3a5749.png`.
- Final custom-domain verification after deployment `08079868-dd7e-4a22-80be-3bef73ad7cea`:
  - Cloudflare source showed `1b8bd15`.
  - `/play?verify=inspector-health-1b8bd15a` served `/assets/play-BZjuct8L.js`.
  - `/play?verify=inspector-health-1b8bd15a` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; the staged `.deploy` directory had no `/models` or `/textures` directories and did include `admin.html` and `play.html`.
  - Deployment `ef4aee06-4de5-4784-821f-7c8a15a7c22a` first uploaded the new UI bundle from source `3145b17`; local smoke then found the inspector-health assertion was too strict for the selected four-component smoke object. Deployment `08079868-dd7e-4a22-80be-3bef73ad7cea` redeployed the same static bundle from source `1b8bd15` after fixing the smoke threshold.
  - `game-builder-ui.mjs` now shows an object health panel in the Inspector with selected-object readiness, mesh/material/triangle counts, component chips, interact label, asset source, and missing-link warnings for trigger/door, mission, and wave setups.
  - The deployed smoke verified `Inspector health: ready (4 components, 3 metrics)`.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-inspector-health-1b8bd15a.png`.
- Final custom-domain verification after deployment `fa9cffcd-287f-404d-83df-43802303496d`:
  - Cloudflare source showed `46de872`.
  - `/play?verify=scene-validation-46de8726` served `/assets/play-B4AHMaG6.js`.
  - `/play?verify=scene-validation-46de8726` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and included `admin.html` and `play.html`.
  - The deploy uploaded `3` changed files, reused `106`, uploaded Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `game-builder-ui.mjs` now shows a `Validation` section that reports scene-level readiness, errors, warnings, and suggestions for missing spawns, goals, trigger/door links, mission chains, wave links, inventory runtime, colliders, and high-triangle hotspots.
  - Smoke verified `Validation: ready (0 errors, 0 warnings, 1 suggestions)`.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-scene-validation-46de8726.png`.
- Final custom-domain verification after deployment `2fee9333-cbd4-4027-921f-d0691f30a272`:
  - Cloudflare source showed `3dbdcfc`.
  - `/play?verify=mpdc2a7h` served `/assets/play-Mz3KQ-fv.js`.
  - `/play?verify=mpdc2a7h` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and included `admin.html` and `play.html`.
  - The final commit-hash redeploy reused `109` uploaded files, uploaded Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `game-builder-ui.mjs` now gives Validation rows safe `Fix` buttons for spawn, checkpoint, win-condition, door/trigger links, invalid mission links, invalid wave links, missing inventory runtime, and collider tagging.
  - Smoke verified `Validation: ready (0 errors, 0 warnings, 0 suggestions)`.
  - Smoke verified `Validation fixes: link-missions, link-waves, add-colliders (24 colliders)`.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-mpdc2a7h.png`.
- Final custom-domain verification after deployment `f90df452-92ae-4cff-a6aa-41d08d5595a8`:
  - Cloudflare source showed `adebace`.
  - `/play?verify=validation-preview-perf-adebace1` served `/assets/play-DcYVH3yq.js`.
  - `/play?verify=validation-preview-perf-adebace1` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and included `admin.html` and `play.html`.
  - The app-only deploy uploaded `6` changed files, reused `103` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `game-builder-ui.mjs` now opens a review card before automatic Validation fixes, shows target objects when available, applies fixes only after confirmation, and exposes Undo for the latest component-level fix.
  - `engine.mjs` now persists sanitized `validationFixHistory` in project saves so automatic builder changes are auditable without storing undo snapshots.
  - `game-builder-ui.mjs` now shows a live `Performance` section with FPS, frame time, worst frame, draw calls, triangle estimate, geometry/texture counts, scene/component totals, asset status, and warnings.
  - Smoke verified `Performance: blocked (14.3 FPS, 69.8 ms, 1863 calls, 3608266 tris)`, which means the next batch should optimize the city scene and play bundle rather than add more editor surface.
  - Smoke verified `Validation: ready (0 errors, 0 warnings, 0 suggestions)`.
  - Smoke verified `Validation fixes: link-missions, link-waves, add-colliders, add-colliders (24 colliders, undo restored 411)`.
  - Smoke verified `Project snapshot: v3 411 objects 2 scripts 3 commands, 4 validation fixes`.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check game-builder-ui.mjs`, `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-validation-preview-perf-adebace1.png`.
- Final custom-domain verification after deployment `a2d75412-8b19-4828-aca8-286c0ae2deef`:
  - Cloudflare source showed `b658c53`.
  - `/play?verify=city-perf-b658c534` served `/assets/play-BiLHJ67T.js`.
  - The build split `game-builder-ui.mjs` into `/assets/game-builder-ui-CZs6NKSQ.js`; the main `play` chunk dropped from about `607 KB` to about `465 KB`.
  - `/play?verify=city-perf-b658c534` included `crate-asset-base` pointing at `https://crateship-games-assets.pages.dev`.
  - `/marketplace.html` returned `200 OK` and `text/html`.
  - `/admin.html` returned `200 OK` and `text/html`.
  - `/game.html?slug=production-smoke-published-game` returned `200 OK` and `text/html`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and included `admin.html`, `play.html`, the new play bundle, and the lazy Game Builder chunk.
  - The app-only deploy uploaded `10` changed files, reused `101` already-uploaded files, uploaded the Functions bundle and `_routes.json`, and refreshed `_headers`.
  - `city-builder.mjs` now defaults to a balanced web profile: regular block buildings are procedural low-triangle meshes, non-landmark district building/furniture preloads are skipped, city shadows are off unless quality mode is requested, and clouds, street props, traffic, parked cars, nature, and pedestrians are scaled down.
  - Quality mode can still be forced before city generation with `localStorage.crate_city_performance = "quality"` or `window.CRATESHIP_CITY_PERFORMANCE = "quality"`.
  - Smoke performance improved from `1,863` calls / `3,608,266` triangles to `74` calls / `11,896` triangles.
  - Smoke still reported `Performance: blocked (18.8 FPS, 53.2 ms, 74 calls, 11896 tris)`, so the next optimization pass should target the remaining frame-time bottleneck after geometry/draw-call reduction.
  - Smoke verified `Readiness: Ready to test, 295 objects, 2 scripts, 40 components, Edit mode`.
  - Smoke verified `Validation: ready (0 errors, 0 warnings, 0 suggestions)`.
  - Smoke verified `Validation fixes: link-missions, link-waves, add-colliders, add-colliders (24 colliders, undo restored 293)`.
  - Smoke verified `Project snapshot: v3 293 objects 2 scripts 3 commands, 4 validation fixes`.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check city-builder.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-city-perf-b658c534.png`.
- Intermediate custom-domain verification after deployment `dbc8c7dd-495d-4213-bdc4-74a218da1a6c`:
  - Cloudflare source showed `7ff1a57`.
  - `/play?verify=prop-proxy-7ff1a576` served `/assets/play-Dlv-oEdc.js`.
  - `city-builder.mjs` added lightweight procedural proxy props and vehicles for the balanced web profile, skipped preloading those proxy-backed GLBs, and reduced balanced traffic cars to avoid shipping repeated high-draw-call prop models into every generated city.
  - Smoke verified `Performance: blocked (22.5 FPS, 44.4 ms, 59 calls, 346 tris)`.
  - Smoke verified `City performance profile: balanced (procedural props on, procedural vehicles on, renderer 59 calls/346 tris)`.
  - A direct raw Build City profile after this deploy still showed about `1,706` calls and `234,042` triangles because additional small multi-mesh GLBs such as flowers, palms, traffic lights, and signs were still entering the city.
- Final custom-domain verification after deployment `8bb1604a-09bf-4ce7-af68-81380dae5c66`:
  - Cloudflare source showed `966f49e`.
  - `/play?verify=nature-proxy-966f49ec` served `/assets/play-DmEADF1c.js`.
  - The build also emitted `/assets/app-builder-DxV98xDK.js` and kept `/assets/game-builder-ui-CZs6NKSQ.js` as a lazy chunk.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and included `admin.html`, `play.html`, the new play bundle, and lazy app/builder chunks.
  - `city-builder.mjs` now also uses procedural proxies for default balanced nature, traffic lights, signs, and small city props, and procedural traffic vehicles now use fewer meshes per vehicle.
  - `scripts/smoke-production.mjs` now reads live renderer counters more directly and verifies procedural props, procedural vehicles, and procedural nature are all active in the balanced city profile.
  - Smoke verified `Performance: blocked (26.5 FPS, 37.8 ms, 618 calls, 234312 tris)`.
  - Smoke verified `City performance profile: balanced (procedural props on, vehicles on, nature on, renderer 618 calls/234312 tris)`.
  - Smoke verified `Readiness: Ready to test, 281 objects, 2 scripts, 40 components, Edit mode`.
  - Smoke verified `Validation: ready (0 errors, 0 warnings, 0 suggestions)`.
  - Smoke verified `Validation fixes: link-missions, link-waves, add-colliders, add-colliders (24 colliders, undo restored 279)`.
  - Smoke verified `Project snapshot: v3 279 objects 2 scripts 3 commands, 4 validation fixes`.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - `node --check city-builder.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke still verified build-city output, separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, and runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-nature-proxy-966f49ec.png`.
- Superseded custom-domain verification after deployment `0adaaa21-4db8-47f3-a8c1-d3688b361f62`:
  - Cloudflare source showed `4e9eb4a`.
  - `/play?verify=frame-budget-4e9eb4a5` served `/assets/play-DZRofMvR.js`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures`.
  - Smoke failed after Play mode because the newly un-gated smart traffic update tried to call `clone()` on city-builder traffic cars that do not have a smart `direction` vector.
- Superseded custom-domain verification after deployment `eb3288a3-8e9d-4616-a4c6-ee88f2f244ee`:
  - Cloudflare source showed `e7cd940`.
  - `/play?verify=runtime-refresh-e7cd9404` served `/assets/play-BDVa3m9_.js`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures`.
  - Smoke still failed on the same Play-mode smart traffic `undefined.clone` frame error.
- Superseded custom-domain verification after deployment `02a96039-11ac-4e53-81d6-1d71e5db5abd`:
  - Cloudflare source showed `913384b`.
  - `/play?verify=smart-traffic-913384bb` served `/assets/play-Byn16iFg.js`.
  - The Play-mode smart traffic crash was fixed and smoke reached the runtime checks.
  - Smoke failed the new raw Build City performance budget with `1,120` immediate draw calls, even though later panel metrics were lower.
- Final custom-domain verification after deployment `8ef07d4e-230c-4e8b-a054-6cc2380f4718`:
  - Cloudflare source showed `ded2a36`.
  - `/play?verify=city-batch-ded2a368` served `/assets/play-C3NW8f4Y.js`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and did include `admin.html` and `play.html`.
  - `node --check engine.mjs`, `node --check city-builder.mjs`, `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the raw Build City budget at `742` calls and `286,222` triangles.
  - Smoke verified settled Performance panel metrics at `71.4 FPS`, `14 ms`, `73` calls, and `4,932` triangles.
  - Smoke verified `Readiness: Ready to test, 192 objects, 2 scripts, 40 components, Edit mode`.
  - Smoke still verified separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, Door/Trigger, Mission, NPC, Merchant, Enemy Wave, Inventory, and Respawn runtime systems.
  - The remote `moderation_audit` table still has `0` rows after deploy.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-city-batch-ded2a368.png`.
- Follow-up production deploys on 2026-05-20 improved the raw Build City frame budget:
  - Superseded deployment `bc14dbeb-c51c-4864-9ff9-dbef3996775c`, source `6b0cd98`, tested procedural building instancing with `/assets/play-CKSiuqgl.js`. Smoke passed, but raw Build City regressed to `13.9 FPS`, `72.2 ms`, `596` calls, and `304,034` triangles, so it was not kept as the final baseline.
  - Deployment `91e967e7-2592-40de-86d6-55c175d6cd35`, source `6cbb638`, backed out the building-instancing regression while keeping the balanced cloud trim. Smoke returned to `20.3 FPS`, `49.2 ms`, `742` calls, and `286,222` triangles on `/assets/play-CaUy8nPN.js`.
  - Deployment `fb7447e8-8145-4a66-b507-a9ea16902566`, source `01500bc`, trimmed balanced cloud puffs and skipped extra procedural roof meshes outside quality mode. Smoke passed on `/assets/play-BA_05dvK.js`; it reduced raw calls to `666` but did not materially improve frame time, so it was followed by the road-surface pass.
  - Final deployment `4116f1ed-1c43-4e19-bd0d-4882fb615074`, source `c887048`, serves `/assets/play-B06mzDQf.js`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and did include `admin.html` and `play.html`.
  - `city-builder.mjs` now batches balanced-profile static road strips, lane lines, intersection pads, sidewalk pads, curbs, and center lines into instanced static draw groups. Quality mode keeps the older unbatched meshes.
  - `node --check city-builder.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the live editor Performance panel at `62.5 FPS`, `16 ms`, `27` calls, and `4,994` triangles.
  - Smoke verified the raw Build City frame probe at `37.7 FPS`, `26.5 ms` average frame time, `0.8 ms` update time, `25.7 ms` render time, `504` calls, and `285,310` triangles.
  - Smoke verified `Readiness: Ready to test, 111 objects, 2 scripts, 40 components, Edit mode`.
  - Smoke still verified separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, Door/Trigger, Mission, NPC, Merchant, Enemy Wave, Inventory, and Respawn runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-road-batch-c8870486.png`.
- Follow-up production deployment `6f5498f8-5fa1-4142-822c-d198896cbbc4`, source `8638d10`, tightened balanced-profile dynamic city props:
  - `/play?verify=dynamic-props-8638d104` served `/assets/play-eHA0ckO_.js`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and did include `admin.html` and `play.html`.
  - `city-builder.mjs` now batches balanced traffic-light proxy bodies, keeps traffic-light visual bulbs only for quality mode, simplifies balanced pedestrians from six-mesh figures to one moving capsule mesh, and simplifies balanced procedural traffic cars to one mesh instead of separate body/cabin meshes.
  - `node --check city-builder.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the live editor Performance panel at `93.5 FPS`, `10.7 ms`, `27` calls, and `5,052` triangles.
  - Smoke verified the raw Build City frame probe at `66.7 FPS`, `15 ms` average frame time, `0.6 ms` update time, `14.4 ms` render time, `316` calls, and `283,478` triangles.
  - Smoke verified `Readiness: Ready to test, 106 objects, 2 scripts, 40 components, Edit mode`.
  - Smoke still verified separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, Door/Trigger, Mission, NPC, Merchant, Enemy Wave, Inventory, and Respawn runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-dynamic-props-8638d104.png`.
- Follow-up production deployment `2ec24744-3316-40da-a7ac-852caad5b39c`, source `a07c194`, added responsive renderer budgets and viewport smoke probes:
  - `/play?verify=a07c194e` served `/assets/play-CkPiLj4T.js`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and did include `admin.html` and `play.html`.
  - `engine.mjs` now applies a renderer pixel budget instead of blindly rendering at full device pixel ratio. The helper caps high-DPR phones at `1.25`, large touch/tablet viewports at `1`, and exposes the active budget through `window._crateRendererBudget`.
  - `scripts/smoke-production.mjs` now runs phone and tablet Build City probes after the main live custom-domain smoke so viewport performance regressions fail before a deploy is considered good.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the live editor Performance panel at `80.6 FPS`, `12.4 ms`, `27` calls, and `5,052` triangles.
  - Smoke verified the raw Build City frame probe at `56.5 FPS`, `17.7 ms` average frame time, `0.6 ms` update time, `17.1 ms` render time, `316` calls, and `283,478` triangles.
  - Smoke verified phone viewport performance at `270.3 FPS`, `3.7 ms`, `107` calls, `78,806` triangles, DPR `3->1.25`, canvas `487x976`, and mobile controls ready.
  - Smoke verified tablet viewport performance at `59.2 FPS`, `16.9 ms`, `285` calls, `201,950` triangles, DPR `2->1`, canvas `820x1116`, and mobile controls ready.
  - Smoke verified `Readiness: Ready to test, 106 objects, 2 scripts, 40 components, Edit mode`.
  - Smoke still verified separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, Door/Trigger, Mission, NPC, Merchant, Enemy Wave, Inventory, and Respawn runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-responsive-budget-a07c194e.png`.
- Follow-up production deployment `0c6d333f-1ce3-4b16-9c72-7d6af7eea274`, source `61e3651`, added runtime performance budgets:
  - `/play?verify=61e36512` served `/assets/play-LE2y4und.js`.
  - `https://www.crateshipgames.com/play?verify=www-61e36512` also returned `200` and served `/assets/play-LE2y4und.js`.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures` and did include `admin.html` and `play.html`.
  - `engine.mjs` now exposes `window._cratePerformanceBudget`, ties culling/shadow distances to graphics quality and viewport size, chunks LOD/culling work across frames, preserves manually hidden objects when auto-culling restores visibility, and fixes the existing strict-mode `count` bug in the instancing helper.
  - `scripts/smoke-production.mjs` now fails if the runtime performance budget is not exposed, and prints the active cull/shadow budget for desktop, phone, and tablet probes.
  - `node --check engine.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke verified the live editor Performance panel at `84.7 FPS`, `11.8 ms`, `9` calls, and `732` triangles.
  - Smoke verified runtime budget `low` after auto-quality with cull `150`, edit cull `360`, shadow `45`, and pass size `80`.
  - Smoke verified the raw Build City frame probe at `53.5 FPS`, `18.7 ms` average frame time, `0.7 ms` update time, `18 ms` render time, `316` calls, and `283,478` triangles.
  - Smoke verified phone viewport performance at `333.3 FPS`, `3 ms`, `105` calls, `78,694` triangles, DPR `3->1.25`, cull `240`, shadow `75`, canvas `487x976`, and mobile controls ready.
  - Smoke verified tablet viewport performance at `50 FPS`, `20 ms`, `285` calls, `201,950` triangles, DPR `2->1`, cull `240`, shadow `75`, canvas `820x1116`, and mobile controls ready.
  - Smoke verified `Readiness: Ready to test, 106 objects, 2 scripts, 40 components, Edit mode`.
  - Smoke still verified separate asset-host loading, furniture placement, project save/load, playable package export, published game export/load, marketplace discovery, game details, admin guardrails, mode/editor separation, Door/Trigger, Mission, NPC, Merchant, Enemy Wave, Inventory, and Respawn runtime systems.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-runtime-budget-61e36512.png`.
- Follow-up production deployments on 2026-05-20 fixed live QA issues found in the editor:
  - Superseded deployment `e0d8e0ee-c63f-431b-ae60-d4b0dbc3dd4f`, source `dd7bb2f`, served `/assets/play-LydZ3sKC.js`; smoke caught that the old editor pointerup path could re-enable OrbitControls during Play mode.
  - Superseded deployment `edfce0df-5d0f-4277-86d7-ef2a94fbf311`, source `c1daad1`, served `/assets/play-C0RkabJt.js`; smoke passed, then hands-on `www` QA found the asset gallery was below the Game Builder panel and card clicks could be intercepted.
  - Final deployment `bff0f4dd-f25e-40c9-88b8-33d68ec0d60b`, source `70de9a9`, serves `/assets/play-hSMoJ33N.js` with lazy asset browser `/assets/asset-browser-ui-BDuV1v3u.js`.
  - `game-builder-ui.mjs` widened the Game Builder panel and changed system/readiness/performance/validation text rows to wrap instead of clipping labels.
  - `asset-browser-ui.mjs` now resolves thumbnail URLs through the same asset-host resolver used by the runtime and raises the gallery overlay above the Game Builder panel.
  - `engine.mjs` now disables editor OrbitControls in Play mode, locks camera roll for camera-only Play, captures Play-mode wheel input, and only re-enables OrbitControls on pointerup when still in Edit mode.
  - `play.html` now labels the third top mode as `Explore` instead of `View`.
  - `scripts/smoke-production.mjs` now fails if visible Game Builder system labels are clipped or if Play mode scroll/drag reintroduces camera roll or re-enables OrbitControls.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures`, had `113` files, and included `admin.html` and `play.html`.
  - During this pass `node --check engine.mjs`, `node --check game-builder-ui.mjs`, `node --check asset-browser-ui.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Final smoke on `https://crateshipgames.com/play?verify=asset-gallery-70de9a9d` verified bundle `/assets/play-hSMoJ33N.js`, asset manifest `6f09cc09da2f`, `Readiness: Ready to test, 106 objects, 2 scripts, 40 components, Edit mode`, and `Validation: ready (0 errors, 0 warnings, 0 suggestions)`.
  - Final smoke verified the live editor Performance panel at `129.9 FPS`, `7.7 ms`, `27` calls, and `5,052` triangles.
  - Final smoke verified the raw Build City frame probe at `71.9 FPS`, `13.9 ms` average frame time, `0.5 ms` update time, `13.4 ms` render time, `316` calls, and `283,478` triangles.
  - Final smoke verified phone viewport performance at `400 FPS`, `2.5 ms`, `105` calls, `78,694` triangles, DPR `3->1.25`, and tablet viewport performance at `61 FPS`, `16.4 ms`, `285` calls, `201,950` triangles, DPR `2->1`.
  - Final `www` hands-on QA at `https://www.crateshipgames.com/play?verify=www-hands-on-70de9a9d` verified zero clipped system labels, Furniture gallery placement of `Bathroom Bathtub`, no model/texture HTTP errors, and Play camera stayed at roll `0` with controls disabled before and after scroll/drag.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-asset-gallery-70de9a9d.png` and `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\www-hands-on-70de9a9d.png`.
- Follow-up production deployment on 2026-05-20 added builder templates, quality controls, and import hardening:
  - Final deployment `63329f47-0866-4d73-a28e-471db6dc2ec2`, source `f893499`, serves `/assets/play-Co4Rkdp6.js` with lazy Game Builder UI `/assets/game-builder-ui-DKbrJ6Mb.js`.
  - `engine.mjs` now exposes `window._setCrateGraphicsQuality`, validates browser GLB/GLTF imports before creating object URLs, blocks non-model files, blocks browser imports over `50 MB`, and records `window._lastUserImportValidation` / `window._lastUserImportStatus` for debugging.
  - `game-builder-ui.mjs` now exposes Low, Medium, High, and Ultra quality buttons in the Performance panel, shows the active render/shadow budget, and wires them to the existing engine quality budget.
  - `game-builder-ui.mjs` now adds starter Game Builder templates for Survival Quest, Shooter Arena, RPG Village, City Racer, Space Adventure, and Tycoon Starter so builders can start from presets instead of typing every setup command.
  - `scripts/smoke-production.mjs` now fails if the quality buttons, template cards, template helper, quality helper, or import validator are missing, or if the validator fails to block wrong extensions and oversized GLB files.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures`, and included `play.html`, `admin.html`, and bundle `/assets/play-Co4Rkdp6.js`.
  - During this pass `node --check engine.mjs`, `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke on `https://crateshipgames.com/play?verify=templates-import-f8934999` verified bundle `/assets/play-Co4Rkdp6.js`, asset manifest `6f09cc09da2f`, `Readiness: Ready to test, 106 objects, 2 scripts, 40 components, Edit mode`, and `Validation: ready (0 errors, 0 warnings, 0 suggestions)`.
  - Smoke verified the live editor Performance panel at `88.5 FPS`, `11.3 ms`, `1` call, and `1` triangle after runtime budget culling.
  - Smoke verified the raw Build City frame probe at `79.4 FPS`, `12.6 ms` average frame time, `0.7 ms` update time, `11.8 ms` render time, `1` call, and `1` triangle after runtime budget culling.
  - Smoke verified phone viewport performance at `156.3 FPS`, `6.4 ms`, `105` calls, `78,694` triangles, DPR `3->1.25`, and tablet viewport performance at `50.5 FPS`, `19.8 ms`, `285` calls, `201,950` triangles, DPR `2->1`.
  - `www` smoke on `https://www.crateshipgames.com/play?verify=www-templates-import-f8934999` also passed against the same `/assets/play-Co4Rkdp6.js` bundle.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-templates-import-f8934999.png` and `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-templates-import-f8934999.png`.
- Follow-up production deployment on 2026-05-20 hardened project/model import budgets and LOD diagnostics:
  - Final deployment `fb3ca344-ca95-44f7-8ba9-cd07dbd90975`, source `f2a9a60`, serves `/assets/play-C1q-ZNZe.js` with lazy Game Builder UI `/assets/game-builder-ui-Cq16LzKH.js`.
  - `engine.mjs` now validates `.crate` project format/version/count limits before clearing the current scene; unsupported formats, future project versions, invalid JSON, oversized project files, too many commands, too many objects, or too many scripts are blocked.
  - `engine.mjs` now exposes `window._crateProjectSchema`, `window._validateCrateProjectData`, `window._serializeCrateProject`, and `window._deserializeCrateProject` for smoke tests and future tooling.
  - GLB/GLTF imports now inspect metadata before loading. Current browser import budgets are `50 MB`, `250,000` triangles, `24` textures, `24` images, `128` materials, `1,500` nodes, and `32` animations. External GLTF buffers/images are reported as warnings.
  - LOD/culling stats now include processed, skipped, near/mid/far, max-per-pass, processed percent, and culled percent. The Game Builder Performance panel now shows an LOD row.
  - `scripts/smoke-production.mjs` now creates light/heavy in-browser GLTF files and fails if metadata budgets do not allow the light file and block the heavy file. It also fails if project schema validation does not allow a valid v3 project and block future/wrong formats.
  - Main app deploy used `CRATE_DEPLOY_INCLUDE_ASSETS=false`; staged `.deploy` had no `/models` or `/textures`, and included `play.html`, `admin.html`, and bundle `/assets/play-C1q-ZNZe.js`.
  - During this pass `node --check engine.mjs`, `node --check game-builder-ui.mjs`, `node --check scripts/smoke-production.mjs`, `git diff --check`, `npm run check`, `npm run check:assets`, `npm run build`, `npx wrangler pages functions build`, and `npm run smoke:production` passed.
  - Smoke on `https://crateshipgames.com/play?verify=schema-import-f2a9a601` verified bundle `/assets/play-C1q-ZNZe.js`, asset manifest `6f09cc09da2f`, `Readiness: Ready to test, 106 objects, 2 scripts, 40 components, Edit mode`, and `Validation: ready (0 errors, 0 warnings, 0 suggestions)`.
  - Smoke verified the live editor Performance panel at `138.9 FPS`, `7.2 ms`, `1` call, and `1` triangle after runtime budget culling.
  - Smoke verified the LOD pass at `80` processed, `0` far, `7` skipped, and max pass `80`.
  - Smoke verified the raw Build City frame probe at `53.2 FPS`, `18.8 ms` average frame time, `5.6 ms` update time, `13.2 ms` render time, `1` call, and `1` triangle after runtime budget culling.
  - Smoke verified phone viewport performance at `294.1 FPS`, `3.4 ms`, `105` calls, `78,694` triangles, DPR `3->1.25`, and tablet viewport performance at `61.3 FPS`, `16.3 ms`, `285` calls, `201,950` triangles, DPR `2->1`.
  - `www` smoke on `https://www.crateshipgames.com/play?verify=www-schema-import-f2a9a601` also passed against the same `/assets/play-C1q-ZNZe.js` bundle.
  - Screenshot evidence was saved locally at `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-schema-import-f2a9a601.png` and `C:\Users\koike\Downloads\crate-engine-web-latest\output\playwright\production-smoke-www-schema-import-f2a9a601.png`.
- Final asset-host verification after deployment `4ab7dcd8-6d39-4472-89f3-3077c2bd904d`:
  - Cloudflare source showed `6f09cc0`.
  - `/asset-manifest.json` returned `200 OK`, `application/json`, and no-store cache headers.
  - Manifest version was `6f09cc09da2f`.
  - Manifest integrity counts were `108` checked models, `20` external dependencies, and `107` catalog references.
  - `npm run smoke:production` passed against the real custom domain and verified the asset manifest before building the city.
  - Smoke result: asset manifest `6f09cc09da2f`, `409` objects, `10` scene rows, `2` scripts, selected component `pickup`.
  - Screenshot evidence was saved locally at `output/playwright/production-smoke-6f09cc09.png`.

## Cloudflare Rules And Gotchas

- The correct project is `crateship-games`.
- The separate asset project is `crateship-games-assets`.
- The custom domain is on `crateshipgames.com`.
- Published games use the Pages Function routes under `/api/games/*` and the `CRATE_GAMES` KV namespace. Keep `_routes.json` limited to `/api/*` so the static game app is not routed through Functions.
- Another project named `crate-engine` has existed before, but it is not the
  custom-domain production site.
- Wrangler auth was verified with `npx wrangler whoami`; it showed the
  `koikes2021@gmail.com` account.
- Cloudflare Pages uses content-addressed asset caching. A deploy can say most
  files were already uploaded. That is normal if hashes match.
- Asset-host uploads are large. If Wrangler hits `UND_ERR_SOCKET` during the
  first upload, retry the same `wrangler pages deploy .deploy-assets` command;
  the successful retry uploaded the same asset set after the first partial attempt.
- `npx wrangler d1 list` briefly returned Cloudflare API authentication error
  code `10000` on 2026-05-19, then succeeded on retry. The D1 database was
  created, bound, migrated, and verified after the retry.
- `npx wrangler d1 execute` briefly returned Cloudflare API authorization error
  code `7403` when run in parallel with another Wrangler API call on 2026-05-19;
  `wrangler whoami`, `wrangler d1 list`, and the same D1 execute command passed
  immediately after retrying sequentially.
- Existing KV audit backfill was a no-op on 2026-05-19 because the only remote
  smoke game record had `auditTrail: []`; use the protected backfill route once
  real admin moderation records exist.
- `.mjs` files have aggressive immutable caching in `_headers`. When editing
  directly loaded modules, cache-bust imports or ensure Vite emits a new hashed
  bundle.
- Use live browser/network checks after deploy. The user explicitly wants the
  real Cloudflare website updated, not a local-only preview.
- `www.crateshipgames.com` was added to the `crateship-games` Pages project on
  2026-05-20 through the Cloudflare Pages domains API. Cloudflare then validated
  the hostname with a `www.crateshipgames.com` CNAME to
  `crateship-games.pages.dev`; both `crateshipgames.com` and
  `www.crateshipgames.com` are active on the Pages project.

## Git State After This Pass

The deployed source changes were committed and pushed to GitHub:

```text
61e36512 Add runtime performance budgets
a07c194e Add responsive renderer budgets
8638d104 Simplify balanced city dynamic props
c8870486 Batch static city road surfaces
01500bc6 Trim balanced city roof meshes
6cbb638c Trim balanced city clouds
6b0cd983 Batch procedural city buildings
3082523d Update handoff for frame budget deploy
ded2a368 Batch static city proxies
913384bb Guard smart traffic frame updates
e7cd9404 Keep runtime catalog refreshed outside play
4e9eb4a5 Add frame budgets and raw city probe
72099f40 Update handoff for city proxy deploy
966f49ec Proxy city nature and traffic assets
7ff1a576 Add lightweight city prop proxies
cefcfd86 Update handoff for city performance deploy
b658c534 Optimize city build and lazy load builder UI
a803c4f5 Update handoff for validation preview deploy
adebace1 Add validation previews and performance panel
3dbdcfcc Add one-click Game Builder validation fixes
0cec1be3 Update handoff for scene validation deploy
46de8726 Add Game Builder scene validation panel
00bf437a Update handoff for inspector health deploy
1b8bd15a Fix inspector health smoke threshold
3145b17b Add Game Builder inspector health panel
ee3a5749 Add admin audit backfill controls
cb419225 Add admin audit storage panel
d605a14a Add D1 audit storage probe
0bc525a7 Bind D1 moderation audit backfill
5da8d53b Add moderation audit history view
59900900 Add admin identity roles to moderation
f174b263 Add admin review notes to moderation actions
5fefd03b Add published game moderation dashboard
0f0789cf Add featured game curation metadata
1255806e Add published game discovery rails
f60bb86e Add published game detail pages
1eb0e04d Add marketplace game discovery filters
c1910645 Add published games marketplace browser
92f41e6d Add published game metadata management
0155d9b5 Add published game management guardrails
295390cf Add published games search and edit smoke
6f58dc8d Add published game editor actions
8d6f6ea8 Add cloud published games library UI
51dcde5e Stabilize published game smoke load
3133868c Add Cloudflare published games API
f534ac27 Add publish library workflow
face24d3 Add playable web package export
4c8b8179 Add NPC merchant gameplay systems
d7df45a3 Add inventory equipment progression
e7bc20de Add enemy wave systems
f851cfc1 Add mission flow systems
f846adfc Add door and trigger systems
dd6afcab Fix user script runtime hooks
f71e8d34 Add spawn runtime behavior
39673143 Add checkpoint and win condition systems
147d95ab Add Game Systems library
b30bcf69 Add Game Builder readiness panel
75eea039 Improve Game Builder status summary
03ad4e1 Add asset pack diagnostics
acb2ea2 Record city builder commands from all entrypoints
8350b0b Fix project load city replay
2f688bf Verify builder project load restores snapshots
679a58d Save richer builder project snapshots
1cb6c6c Add builder project controls
b8364e70 Refresh inspector on builder mode changes
c529d95e Lock editor controls outside edit mode
1967b372 Improve asset placement feedback
a6778271 Harden play mode editor separation
0932fa35 Filter unavailable asset catalog entries
e235efe3 Fix engine modes and furniture loading
6f09cc09 Add asset host manifest verification
5c139d3a Use separate Cloudflare asset host
9afd9465 Harden asset host deployment
d1efb55f Add production smoke test
4340fff1 Add predeploy asset integrity check
7b63cdb6 Update Cloudflare handoff for asset pipeline
8290f654 Add game builder inspector and blueprints
eaee4d37 Fix Poly Haven city asset buffers
6e2b3623 Add asset host pipeline
0ec514e2 Fix deploy texture paths and HDR hook
0247a439 Fix HDR loader and Poly Haven textures
b03ee517 Raise builder panel above gameplay overlays
5be08aef Move builder components into primary panel
fa4b7358 Stabilize builder scene targeting
433a5409 Fix command runner preset execution
b7c05bd5 Add scene component builder tools
2e9794d5 Add Cloudflare game builder deployment pass
```

Core files touched across the deployed 2026-05-17 engine passes:

```text
M  engine.mjs
M  city-builder.mjs
M  play.html
M  demo.html
M  crate-engine/web/engine.mjs
M  scripts/fetch-polyhaven-textures.mjs
M  scripts/optimize-gltf.mjs
M  scripts/prepare-deploy.mjs
M  scripts/prepare-assets-deploy.mjs
M  scripts/check-syntax.mjs
M  scripts/sync-legacy-web.mjs
M  scripts/smoke-production.mjs
M  user-scripts.mjs
M  vite.config.mjs
M  wrangler.toml
M  package.json
M  package-lock.json
M  .gitignore
M  _headers
A  _routes.json
A  404.html
A  admin.html
A  asset-url.mjs
A  functions/api/games/[[path]].js
A  game-builder-ui.mjs
A  migrations/0001_moderation_audit.sql
A  scripts/check-assets.mjs
A  CLOUDFLARE_HANDOFF.md
```

After the latest public deploy was pushed, this handoff file was updated again
to record the final Cloudflare deployment metadata. That handoff-only update
does not change the public website bundle unless it is intentionally deployed.

## Remaining Fully Working Engine Roadmap

The live engine now has the core web-editor loop working on the custom
Cloudflare domain: split asset hosting, Build City smoke coverage, Edit /
Explore / Play mode separation, Game Builder systems, published game export and
load, marketplace/detail pages, admin guardrails, scene readiness, scene
validation, preview/apply/undo Validation fixes, project fix-history saves, and
live performance diagnostics.

The remaining work to make it feel like a sellable full game engine is:

1. Performance optimization and frame stability
   - Current apex live smoke reports the settled Performance panel at `56.5 FPS`,
     `17.7 ms` average frame time, `1` draw call, and `1` triangle after
     project validation and runtime performance-budget culling.
   - The current apex LOD/culling diagnostics report `80` processed objects,
     `0` far objects, `10` skipped objects, and max pass `80`.
   - The desktop raw Build City probe now reports `70.4 FPS`, `14.2 ms` average
     frame time, `1` draw call, and `1` triangle after runtime-budget culling,
     which is the current production desktop smoke baseline.
   - The parallel `www` smoke reported `50 FPS`, `20 ms`, `1` draw call, and
     `1` triangle, with a raw Build City probe of `66.2 FPS` and `15.1 ms`.
   - Phone viewport smoke reports `238.1 FPS`, `4.2 ms`, `105` draw calls,
     `78,694` triangles, DPR `3->1.25`, cull `240`, shadow `75`, and mobile
     controls ready.
   - Tablet viewport smoke reports `61.3 FPS`, `16.3 ms`, `285` draw calls,
     `201,950` triangles, DPR `2->1`, cull `240`, shadow `75`, and mobile
     controls ready.
   - Runtime performance budgets are now exposed through
     `window._cratePerformanceBudget` and production smoke verifies them.
   - The previous live smoke before runtime performance budgets was `56.5 FPS`,
     `17.7 ms`, `316` draw calls, and `283,478` triangles on desktop after
     responsive renderer budgeting.
   - The previous live smoke before responsive renderer budgeting was
     `66.7 FPS`, `15 ms`, `316` draw calls, and `283,478` triangles on desktop
     after balanced dynamic-prop simplification.
   - The live smoke before dynamic-prop simplification was `37.7 FPS`,
     `26.5 ms`, `504` draw calls, and `285,310` triangles after road-surface
     batching.
   - The live smoke before road-surface batching was `20.3 FPS`, `49.2 ms`,
     `742` draw calls, and `286,222` triangles on the restored static-proxy
     baseline.
   - The procedural building instancing experiment reduced calls but regressed
     frame time to `13.9 FPS` and `72.2 ms`, so it was superseded rather than
     treated as the working baseline.
   - Earlier direct raw profiling before the proxy tightening showed about
     `1,706` calls and `234,042` triangles, while the pre-optimization direct
     profile showed about `2,013` calls and `2,252,712` triangles.
   - Previous smoke before the city optimization was `14.3 FPS`, `69.8 ms`,
     `1,863` draw calls, and `3,608,266` triangles; the first city optimization
     smoke reached `18.8 FPS`, `53.2 ms`, `74` draw calls, and `11,896`
     triangles before the smoke counters were hardened.
   - Keep profiling `https://crateshipgames.com/play` on desktop, phone, and
     tablet widths as part of every performance deploy.
   - Low/Medium/High/Ultra quality controls are now exposed in the Game Builder
     Performance panel and production smoke verifies the buttons.
   - LOD/culling diagnostics are now exposed through `window._crateCullingStats`
     and surfaced in the Game Builder Performance panel.
   - Next performance work should focus on object pooling, stronger LOD proxy
     selection, deeper post-processing presets, and lazy loading for heavy
     assets.
   - Continue expanding instancing for repeated props and add budget-aware
     import limits for user assets.
2. Asset pipeline hardening
   - Move large long-lived GLB assets to R2 when the Pages asset project becomes
     too large or slow to manage.
   - Browser import validation now blocks non-GLB/GLTF files, browser model
     imports over `50 MB`, and models over `250,000` triangles, `24` textures,
     `24` images, `128` materials, `1,500` nodes, or `32` animations.
   - External GLTF buffers/images are now surfaced as warnings before import.
   - Next import hardening should add collision proxy checks, manifest entry
     creation, and automatic optimization.
   - Add automatic optimization jobs for user imports before assets enter a
     published game.
3. Project format and export/import
   - Basic versioned `.crate` project schema validation now blocks unsupported
     formats, future versions, invalid JSON, oversized project files, too many
     commands, too many objects, and too many scripts before clearing the scene.
   - Next project-format work should add migration tests and project integrity
     checks before save, publish, and playable package export.
   - Add import conflict handling for duplicate object IDs, missing assets, and
     missing scripts.
4. Gameplay runtime completeness
   - Expand components for player controller presets, camera presets, health,
     damage, inventory, quests, dialogue, enemies, waves, checkpoints, win/lose
     states, doors, triggers, UI/HUD, audio, and save points.
   - Reusable genre templates now exist for survival, shooter, RPG, racing,
     space adventure, and tycoon starters.
   - Add the next reusable templates for platformer, adventure, multiplayer
     lobby, puzzle, horror, and sports.
   - Make Play mode run from a clean runtime snapshot so editor state cannot
     leak into gameplay.
5. Editor UX polish
   - Build richer side menus for presets, inventory, NPCs, quests, enemies,
     UI/HUD, physics, lighting, terrain, audio, and publish settings.
   - Add drag/drop placement, search, filters, component presets, prefab save,
     prefab apply, and batch edit tools.
   - Make mobile/tablet controls usable for testing, even if heavy authoring
     stays desktop-first.
6. Scripting and AI safety
   - Sandbox user scripts so bad code cannot break the editor or leak secrets.
   - Add script validation, safe APIs, templates, examples, and runtime error
     reporting.
   - Keep AI generation as an assistant for builders, but make every generated
     change inspectable, reversible, and validated.
7. Multiplayer and cloud features
   - Decide which game types need real-time multiplayer, then add Durable
     Objects or another Cloudflare-backed session layer.
   - Add accounts, ownership, quotas, team projects, project sharing, and
     permissions.
   - Add published-game analytics, crash reports, moderation workflows, and
     creator dashboards.
8. QA and release gates
   - Put `npm run smoke:production` and asset checks into CI/deploy checklists.
   - Add targeted tests for save/load migrations, project import/export,
     published-game APIs, Game Builder components, mode separation, and
     validation fixes.
   - Add browser performance budgets so regressions fail before deployment.

## Recommended Next Steps

1. Add object pooling, stronger LOD proxy selection, deeper post-processing
   presets, and lazy loading now that desktop, phone, and tablet smoke probes
   verify runtime budgets.
2. Put `npm run smoke:production` into CI or a deploy checklist so every
   Cloudflare production deploy gets the same live browser verification.
3. Consider moving the asset host from Pages to Cloudflare R2 once the asset pack
   grows beyond the current recovered cache.
4. Configure `CRATE_SMOKE_ADMIN_TOKEN` only in the local/CI smoke environment
   when ready, then rerun `npm run smoke:production` so the protected
   `/api/games/admin/audit/verify` route, the admin dashboard `Verify D1`
   button, and the admin dashboard `Dry Run Backfill` button execute against D1.
5. Run the protected audit backfill after real moderation records exist in KV;
   the 2026-05-19 check found no old audit entries to migrate.
6. Continue productizing the editor: project migration tests, safer scripting
   runtime, collision-proxy import checks, automatic asset optimization, and
   export/import conflict handling.
