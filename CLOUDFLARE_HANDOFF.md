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
- Current source commit used for the latest deploy: `0909003e2cb68422e56ebca136056dc7c7df1cc8`

Do not treat `http://127.0.0.1:*` as proof that the real site is fixed. Local
preview can be misleading because the repo's `models` entry is a Mac-path stub
on this Windows machine. The real production behavior must be checked on
`crateshipgames.com`.

## Current Production Deployment

- Latest production deployment ID: `918c4aad-9159-4033-9d5a-b0dda028035e`
- Latest production deployment URL: `https://918c4aad.crateship-games.pages.dev`
- Production branch: `main`
- Source shown by Cloudflare: `0909003`
- Main live page bundle after the deploy: `/assets/play-CdQnR1E6.js`

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
  --commit-hash=0909003e2cb68422e56ebca136056dc7c7df1cc8 `
  --commit-message="Add Game Builder panel and script presets" `
  --commit-dirty=true
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
- Final Pages upload skipped `4,193` already-uploaded files and uploaded `55` changed files.

Critical city assets verified after deploy:

```text
https://crateshipgames.com/models/kenney_cars/sedan.glb
https://crateshipgames.com/models/buildings_pack_3_6story_stack_mat.glb
https://crateshipgames.com/models/fab/street_props_streeprops.glb
https://crateshipgames.com/models/ph_modular_street_seating.glb
```

These returned `Content-Type: model/gltf-binary` on production after the deploy.

## Post-Deploy Verification

Always verify the real site:

```powershell
curl.exe -L --silent https://crateshipgames.com/play | Select-String -Pattern "assets/play"
curl.exe -I -L https://crateshipgames.com/models/kenney_cars/sedan.glb
curl.exe -I -L https://crateshipgames.com/models/fab/street_props_streeprops.glb
curl.exe -I -L https://crateshipgames.com/models/__definitely_missing__.glb
```

Expected current results:

- `/play` references `/assets/play-CdQnR1E6.js`.
- Existing `.glb` models return `200 OK` and `model/gltf-binary`.
- Missing model paths return `404 Not Found`, not `200 text/html`.

Browser verification from the 2026-05-17 deploy:

- `Game Builder` panel visible on `https://crateshipgames.com/play`.
- Panel state: `data-open="true"`.
- Preset button count: `26`.
- Clicking `Inventory` installed one user script.
- Typing `build city` on the real site built a city:
  - Engine objects: `408`
  - Scene children: `414`
  - Bundle: `/assets/play-CdQnR1E6.js`

Known non-blocking warning still present:

```text
RGBELoader has been deprecated. Please use HDRLoader instead.
```

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

## Current Working Tree After This Pass

Files changed or added locally:

```text
M  engine.mjs
M  play.html
M  scripts/optimize-gltf.mjs
M  scripts/prepare-deploy.mjs
M  user-scripts.mjs
M  vite.config.mjs
A  404.html
A  game-builder-ui.mjs
A  CLOUDFLARE_HANDOFF.md
```

No Git commit or push was made during this pass. The code was deployed to
Cloudflare Pages by direct Wrangler upload.

## Recommended Next Steps

1. Commit the deployed source changes to GitHub so the repo matches production.
2. Move model assets to a durable source of truth such as Cloudflare R2 or a
   versioned artifact bucket.
3. Add a repeatable asset manifest check so missing GLB dependencies fail before
   deploy.
4. Add a live smoke script for boot, Game Builder panel, Inventory preset,
   `build city`, and missing-model 404 behavior.
5. Continue productizing the editor: scene hierarchy, component inspector,
   project format, safe scripting runtime, and publish/export flow.
