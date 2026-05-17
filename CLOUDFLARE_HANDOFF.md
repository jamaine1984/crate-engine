# CrateShip Games Cloudflare Handoff

Last updated: 2026-05-17

This file is the operational handoff for the real CrateShip Games web engine at
`https://crateshipgames.com/play`. Use it before changing or deploying the web
engine so future sessions do not get pointed at the wrong local preview.

## Source Of Truth

- Live site: `https://crateshipgames.com/play`
- Cloudflare Pages project: `crateship-games`
- Cloudflare account email: `koikes2021@gmail.com`
- Cloudflare account ID: `6573d98c25150fd7b4602e56a0926767`
- Custom domain: `crateshipgames.com`
- GitHub repo: `https://github.com/jamaine1984/crate-engine.git`
- Current local checkout used by Codex: `C:\Users\koike\Downloads\crate-engine-web-latest`
- Current deployed source commit for the public engine code: `0932fa35`
- Cloudflare Pages asset project: `crateship-games-assets`
- Current asset host: `https://crateship-games-assets.pages.dev`

Do not treat `http://127.0.0.1:*` as proof that the real site is fixed. Local
preview can be misleading because the repo's `models` entry is a Mac-path stub
on this Windows machine. The real production behavior must be checked on
`crateshipgames.com`.

## Current Production Deployment

- Latest production deployment ID: `239040e1-3f9c-48b8-a31e-0ea17d220dbe`
- Latest production deployment URL: `https://239040e1.crateship-games.pages.dev`
- Production branch: `main`
- Source shown by Cloudflare: `0932fa3`
- Main live page bundle after the deploy: `/assets/play-CYg0M6tJ.js`
- Latest asset-host deployment ID: `4ab7dcd8-6d39-4472-89f3-3077c2bd904d`
- Latest asset-host deployment URL: `https://4ab7dcd8.crateship-games-assets.pages.dev`
- Asset-host source shown by Cloudflare: `6f09cc0`
- Current asset manifest version: `6f09cc09da2f`

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

## Deploy Workflow

Run these from the repo:

```powershell
cd C:\Users\koike\Downloads\crate-engine-web-latest
npm run check
$env:CRATE_MODELS_DIR='C:\Users\koike\Documents\Codex\2026-05-16\okay-so-let-s-find-my\models-live-cache\models'
npm run check:assets
npm run build
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
$env:CRATE_MODELS_DIR='C:\Users\koike\Documents\Codex\2026-05-16\okay-so-let-s-find-my\models-live-cache\models'
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

- `npm run check:assets` passes with `108` required models, `20` external dependencies, and catalog references checked.
- `npm run smoke:production` passes against `https://crateshipgames.com/play` and reports `Asset base: https://crateship-games-assets.pages.dev` plus `Asset manifest: 6f09cc09da2f`.
- `/play` references `/assets/play-CYg0M6tJ.js`.
- `/play` includes `<meta name="crate-asset-base" content="https://crateship-games-assets.pages.dev">`.
- `/asset-manifest.json` returns `200 OK`, `application/json`, and `Cache-Control: no-store`.
- Existing `.glb` models return `200 OK` and `model/gltf-binary` on the asset host.
- The representative furniture asset `/models/house_interior_pack_chair_1.glb` returns `200 OK` and `model/gltf-binary` on the asset host.
- Modular texture dependencies return `200 OK` and `image/jpeg` from the asset host `/textures/*`.
- Modular Poly Haven buffer dependencies return `200 OK` from the asset host `/models/*`.
- The served play bundle contains `HDRLoader` and no `RGBELoader` references.
- The served play bundle contains `gb-inspector`, `gb-blueprints`, `Inspector`, and `Blueprints`.
- The served play bundle contains `data-gb-mode`, `Explore Mode`, the fixed `let score = 0` command matcher, and the asset catalog availability filter.
- The served app-assets bundle contains the asset resolver exports and `_crateAssetUrl` support.
- Missing asset-host model paths return `404 Not Found`, not `200 text/html`.

Browser verification from the 2026-05-17 deploy:

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
- Another project named `crate-engine` has existed before, but it is not the
  custom-domain production site.
- Wrangler auth was verified with `npx wrangler whoami`; it showed the
  `koikes2021@gmail.com` account.
- Cloudflare Pages uses content-addressed asset caching. A deploy can say most
  files were already uploaded. That is normal if hashes match.
- Asset-host uploads are large. If Wrangler hits `UND_ERR_SOCKET` during the
  first upload, retry the same `wrangler pages deploy .deploy-assets` command;
  the successful retry uploaded the same asset set after the first partial attempt.
- `.mjs` files have aggressive immutable caching in `_headers`. When editing
  directly loaded modules, cache-bust imports or ensure Vite emits a new hashed
  bundle.
- Use live browser/network checks after deploy. The user explicitly wants the
  real Cloudflare website updated, not a local-only preview.

## Git State After This Pass

The deployed source changes were committed and pushed to GitHub:

```text
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
M  package.json
M  package-lock.json
M  .gitignore
M  _headers
A  404.html
A  asset-url.mjs
A  game-builder-ui.mjs
A  scripts/check-assets.mjs
A  CLOUDFLARE_HANDOFF.md
```

After the latest public deploy was pushed, this handoff file was updated again
to record the final Cloudflare deployment metadata. That handoff-only update
does not change the public website bundle unless it is intentionally deployed.

## Recommended Next Steps

1. Put `npm run smoke:production` into CI or a deploy checklist so every
   Cloudflare production deploy gets the same live browser verification.
2. Surface the asset manifest version in a small diagnostics panel so builders
   can see which asset pack the live editor is using.
3. Consider moving the asset host from Pages to Cloudflare R2 once the asset pack
   grows beyond the current recovered cache.
4. Continue productizing the editor: a richer component inspector, project
   format, safe scripting runtime, and publish/export flow.
