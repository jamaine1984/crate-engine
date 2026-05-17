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
- Current deployed source commit for the public engine code: `0ec514e2`

Do not treat `http://127.0.0.1:*` as proof that the real site is fixed. Local
preview can be misleading because the repo's `models` entry is a Mac-path stub
on this Windows machine. The real production behavior must be checked on
`crateshipgames.com`.

## Current Production Deployment

- Latest production deployment ID: `c7f5a390-c203-426a-8e21-232437a25f0e`
- Latest production deployment URL: `https://c7f5a390.crateship-games.pages.dev`
- Production branch: `main`
- Source shown by Cloudflare: `0ec514e`
- Main live page bundle after the deploy: `/assets/play-C18sl_xm.js`

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

## Deploy Workflow

Run these from the repo:

```powershell
cd C:\Users\koike\Downloads\crate-engine-web-latest
npm run check
npm run build
```

Prepare the Cloudflare upload directory with a real model source:

```powershell
$env:CRATE_MODELS_DIR='C:\Users\koike\Documents\Codex\2026-05-16\okay-so-let-s-find-my\models-live-cache\models'
npm run prepare:deploy
```

Deploy to the real Cloudflare Pages project:

```powershell
npx wrangler pages deploy .deploy `
  --project-name=crateship-games `
  --branch=main `
  --commit-hash=0ec514e286617ff6218df9fd6f524b1584241854 `
  --commit-message="Fix deploy texture paths and HDR hook" `
  --commit-dirty=false
```

Important: do not deploy only `dist` unless you are intentionally changing the
asset-hosting strategy. The city builder needs `/models/*` assets.

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

Critical city assets verified after deploy:

```text
https://crateshipgames.com/models/kenney_cars/sedan.glb
https://crateshipgames.com/models/buildings_pack_3_6story_stack_mat.glb
https://crateshipgames.com/models/fab/street_props_streeprops.glb
https://crateshipgames.com/models/ph_modular_street_seating.glb
https://crateshipgames.com/textures/modular_street_seating_armrests_diff_1k.jpg
https://crateshipgames.com/textures/modular_street_seating_supports_nor_gl_1k.jpg
https://crateshipgames.com/textures/modular_electricity_poles_nor_gl_1k.jpg
https://crateshipgames.com/textures/modular_electricity_poles_pieces_arm_1k.jpg
```

The `.glb` assets returned `Content-Type: model/gltf-binary` on production.
The modular texture dependencies returned `200 OK` with `Content-Type: image/jpeg`.

## Post-Deploy Verification

Always verify the real site:

```powershell
curl.exe -L --silent https://crateshipgames.com/play | Select-String -Pattern "assets/play"
curl.exe -I -L https://crateshipgames.com/models/kenney_cars/sedan.glb
curl.exe -I -L https://crateshipgames.com/models/fab/street_props_streeprops.glb
curl.exe -I -L https://crateshipgames.com/textures/modular_street_seating_armrests_diff_1k.jpg
curl.exe -I -L https://crateshipgames.com/textures/modular_electricity_poles_nor_gl_1k.jpg
curl.exe -I -L https://crateshipgames.com/models/__definitely_missing__.glb
```

Expected current results:

- `/play` references `/assets/play-C18sl_xm.js`.
- Existing `.glb` models return `200 OK` and `model/gltf-binary`.
- Modular texture dependencies return `200 OK` and `image/jpeg` from `/textures/*`.
- The served play bundle contains `HDRLoader` and no `RGBELoader` references.
- Missing model paths return `404 Not Found`, not `200 text/html`.

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

## Cloudflare Rules And Gotchas

- The correct project is `crateship-games`.
- The custom domain is on `crateshipgames.com`.
- Another project named `crate-engine` has existed before, but it is not the
  custom-domain production site.
- Wrangler auth was verified with `npx wrangler whoami`; it showed the
  `koikes2021@gmail.com` account.
- Cloudflare Pages uses content-addressed asset caching. A deploy can say most
  files were already uploaded. That is normal if hashes match.
- `.mjs` files have aggressive immutable caching in `_headers`. When editing
  directly loaded modules, cache-bust imports or ensure Vite emits a new hashed
  bundle.
- Use live browser/network checks after deploy. The user explicitly wants the
  real Cloudflare website updated, not a local-only preview.

## Git State After This Pass

The deployed source changes were committed and pushed to GitHub:

```text
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
M  crate-engine/web/engine.mjs
M  scripts/fetch-polyhaven-textures.mjs
M  scripts/optimize-gltf.mjs
M  scripts/prepare-deploy.mjs
M  scripts/sync-legacy-web.mjs
M  user-scripts.mjs
M  vite.config.mjs
A  404.html
A  game-builder-ui.mjs
A  CLOUDFLARE_HANDOFF.md
```

After the latest public deploy was pushed, this handoff file was updated again
to record the final Cloudflare deployment metadata. That handoff-only update
does not change the public website bundle unless it is intentionally deployed.

## Recommended Next Steps

1. Move model assets to a durable source of truth such as Cloudflare R2 or a
   versioned artifact bucket.
2. Add a repeatable asset manifest check so missing GLB dependencies fail before
   deploy.
3. Add a live smoke script for boot, Game Builder panel, Inventory preset,
   `build city`, and missing-model 404 behavior.
4. Continue productizing the editor: a richer component inspector, project
   format, safe scripting runtime, and publish/export flow.
