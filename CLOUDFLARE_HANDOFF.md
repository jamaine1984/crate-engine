# CrateShip Games Cloudflare Handoff

Last updated: 2026-05-18

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
- Current deployed source commit for the public engine code: `face24d3`
- Cloudflare Pages asset project: `crateship-games-assets`
- Current asset host: `https://crateship-games-assets.pages.dev`

Do not treat `http://127.0.0.1:*` as proof that the real site is fixed. Local
preview can be misleading because the repo's `models` entry is a Mac-path stub
on this Windows machine. The real production behavior must be checked on
`crateshipgames.com`.

## Current Production Deployment

- Latest production deployment ID: `adbf2876-0a00-4da6-9948-4f2d53091739`
- Latest production deployment URL: `https://adbf2876.crateship-games.pages.dev`
- Production branch: `main`
- Source shown by Cloudflare: `face24d`
- Main live page bundle after the deploy: `/assets/play-V6Rd-gpY.js`
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

## Deploy Workflow

Run these from the repo:

```powershell
cd C:\Users\koike\Downloads\crate-engine-web-latest
npm run check
npm run check:assets
npm run build
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
- `/play` references `/assets/play-DGlRyrjF.js`.
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
- The Game Builder stats summary reads with clear separators, for example `411 objects, 9 components, 2 scripts, Edit mode`.
- The served play bundle contains `gb-readiness`, `window._gameBuilderReadiness`, and readiness smoke output like `Ready to test, 411 objects, 2 scripts, 9 components, Edit mode`.
- The served play bundle contains `gb-systems`, `window._gameBuilderSystems`, and systems smoke output with Inventory installed, Runtime installed, Pickup tagged, Mission tagged, Reward tagged, Gate tagged, Checkpoint tagged, Win Condition tagged, Door tagged, Trigger tagged, and Spawn Point tagged.
- The served play bundle contains `checkpoint`, `winCondition`, `spawnPoint`, `door`, `triggerZone`, `missionStep`, `missionReward`, `missionGate`, and Component Runtime support for active checkpoints, active player spawns, respawns, door opening, trigger zones, mission steps, reward claims, mission gates, and game-complete/game-over states.
- Installed scripts expose active runtime hooks through `onUpdate`, so the Component Runtime actually ticks in Play mode.
- The production smoke forces runtime health to `0` in Play mode and expects the Spawn/Checkpoint runtime to respawn back to `100` HP.
- The production smoke verifies Trigger opens Door in Play mode and prints `Door trigger runtime: Group trigger opened Group door`.
- The production smoke verifies Mission Step grants Reward and opens Mission Gate in Play mode and prints `Mission runtime: Smoke mission step -> Smoke reward -> Smoke gate (75 score)`.
- The Project section can save a named project, open Import, open Export, and keeps Import disabled in Explore while Export stays enabled.
- Saved projects use `version: 3` and include object snapshots, asset paths, builder components, and installed user scripts.
- The served app-assets bundle contains the asset resolver exports and `_crateAssetUrl` support.
- Missing asset-host model paths return `404 Not Found`, not `200 text/html`.

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
