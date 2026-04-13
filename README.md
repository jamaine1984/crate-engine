# Crate Engine Status

Status snapshot: 2026-04-13

## Current Baseline

- Canonical app/build path is the repo root.
- Build toolchain is `vite` with `dist/` output.
- Deployment config is rooted in the repo-level `wrangler.toml`.
- Key runtime packages are pinned in `package.json`.
- `three` is pinned at `0.180.0`.
- `@dimforge/rapier3d-compat` is pinned at `0.19.0`.
- Local build artifacts are not kept in the workspace after validation.

## What Is Complete

- Root runtime is the source of truth instead of the old mixed `web/` deployment path.
- Package-managed build/dev flow is in place with `package.json`, `package-lock.json`, `vite.config.mjs`, and root `wrangler.toml`.
- Three/WebGPU import skew was cleaned up and the renderer path was stabilized.
- The duplicate frame-timing bug was fixed.
- NPCs are no longer updated twice per frame.
- Local Ollama-friendly AI defaults were wired in.
- Auth tokens moved from legacy `localStorage` use to `sessionStorage` in `auth.mjs`.
- API keys for AI/Meshy were moved to session-only storage in the main config flow.
- Dead files and local junk were removed:
- `multiplayer-client.mjs`
- `self-smarter.mjs`
- stale `.DS_Store` files
- stale local junk files and empty folders found during cleanup
- Git/LFS local storage was pruned and compacted, reclaiming about 121 MB from repo metadata.
- Startup preloads were reduced so `play.html` now only preloads:
- `modulepreload-polyfill`
- `app-physics`
- `engine`
- The model registry now loads from static JSON and no longer force-loads on every command.

## Lazy-Loaded Modules Added

- `world-presets.mjs`
- `character-gallery.mjs`
- `utility-ui.mjs`
- `ai-settings-ui.mjs`
- `generator-ui.mjs`
- `project-tools.mjs`
- `user-scripts.mjs`
- `legacy-multiplayer.mjs`
- `editor-tools-ui.mjs`
- `asset-browser-ui.mjs`
- `audio-tools.mjs`
- `navmesh.mjs`
- `local-ai-tools.mjs`
- `speech-tts.mjs`
- `debug-tools.mjs`
- `multiplayer-colyseus.mjs`

## Current Build Snapshot

Latest validated production build:

- `engine`: `427.23 kB`
- `app-assets`: `1.96 kB`
- `app-gameplay`: `233.39 kB`
- `app-builder`: `91.82 kB`
- `voice-commands`: `82.63 kB`
- `ai-agent`: `51.27 kB`
- `world-presets`: `31.67 kB`
- `generator-ui`: `22.82 kB`
- `project-tools`: `18.01 kB`
- `editor-tools-ui`: `19.24 kB`
- `app-worldfx`: `15.76 kB`
- `character-gallery`: `13.02 kB`
- `asset-browser-ui`: `9.42 kB`
- `audio-tools`: `2.69 kB`

Main result so far:

- `engine` dropped from about `686 kB` earlier in the upgrade cycle to `427.23 kB`.
- `app-assets` dropped from `390.96 kB` to `1.96 kB` by moving the model alias registry into static JSON.
- Heavy editor/UI paths are now mostly demand-loaded.
- The startup preload graph stayed minimal while those features moved out.

## What Is Still Left

### 1. Remaining Bundle Work

- The main `engine` chunk is still the biggest startup target.
- `app-gameplay` is still large and can be deferred more aggressively.
- `model-aliases.json` is now a large static data file at about `417 kB`, so asset data segmentation or compression is still worth doing later.
- The remaining inline editor controls in `engine.mjs` should keep shrinking.

### 2. Security / Architecture Debt

- `worker/index.js` still calls OpenRouter and still uses `google/gemini-2.0-flash-exp:free`.
- `code-editor.mjs` still executes generated code with `new Function(...)`.
- The app still uses `localStorage` heavily for non-secret persistence across the engine.
- Remote model/provider access is not fully proxy-only yet.
- The legacy compatibility mirror under `crate-engine/web/` still exists and still needs to be maintained until it is intentionally retired.

### 3. Testing / Reliability

- There is still no real automated regression suite.
- There is still no smoke test coverage for:
- boot
- play mode entry
- asset gallery
- GLB import
- multiplayer connect
- world generation
- model/character selection

### 4. Asset / Content Pipeline

- Large runtime asset catalogs still need a formal optimization pass.
- `model-aliases.json` is now the canonical friendly-name registry and should eventually be segmented by domain or compressed further.
- User/imported asset indexing is working, but asset-browser code should eventually share one canonical module instead of keeping duplicated legacy implementations around.
- GLB optimization tooling exists in scripts, but the full asset estate has not been systematically processed.

## Recommended Next Order

1. Reduce `app-gameplay` by pushing more systems behind actual play-mode entry.
2. Keep shrinking `engine.mjs`, especially the remaining inline editor/control paths.
3. Replace the OpenRouter/Gemini worker path with the intended local/proxy-safe AI path.
4. Remove or harden `new Function(...)` in `code-editor.mjs`.
5. Add a small regression harness for boot, play mode, galleries, imports, and multiplayer.
6. Decide whether the legacy `crate-engine/web/` mirror is still needed; remove it once deployment no longer depends on it.

## Planned After Reductions And Fixes

These are the next higher-level additions to push after the current reduction, hardening, and cleanup work is finished.

- Pathfinding and NPC navigation: [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) for navmesh generation, pathfinding, crowd simulation, and `three.js` integration.
- Asset pipeline: [glTF Transform](https://github.com/donmccurdy/glTF-Transform) for GLB compression, pruning, re-texturing, and normalization.
- Multiplayer: [Colyseus](https://github.com/colyseus/colyseus) for authoritative rooms and shared state beyond simple positional sync.
- Local and browser AI: [Transformers.js](https://github.com/huggingface/transformers.js) for browser-side speech, embeddings, tagging, moderation, and assistant features without exposing cloud keys.
- NPC voice and lip sync: [HeadTTS](https://github.com/met4citizen/HeadTTS) for local or browser TTS with viseme output.
- 3D asset generation: [Hunyuan3D 2.1](https://huggingface.co/tencent/Hunyuan3D-2.1) and [TRELLIS.2-4B](https://huggingface.co/microsoft/TRELLIS.2-4B) for image-to-3D and textured asset workflows.
- World generation and reconstruction: [HunyuanWorld 1.0](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0) and [MapAnything](https://github.com/facebookresearch/map-anything) for larger scene blockouts, explorable worlds, and real-space import workflows.
- Render debugging: [Spector.js](https://github.com/BabylonJS/Spector.js) for GPU and post-processing debugging.
- Cloudflare-side platform additions if deployment stays there: [WebGPURenderer docs](https://threejs.org/docs/pages/WebGPURenderer.html), [Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-rendering/faq/), and [Workers AI](https://developers.cloudflare.com/workers-ai/) for QA, screenshot testing, and speech/AI services.

## Priority Additions

When the reduction and hardening pass is done, the highest-priority additions should be:

1. `recast-navigation-js`
2. `glTF Transform`
3. `Transformers.js`
4. `HeadTTS`
5. One 3D generation pipeline from Hugging Face

## Validation Commands

- `npm run check`
- `npm run build`
- `npm run sync:legacy-web`

## Notes

- `dist/` is intentionally removed after validation to keep the workspace lean.
- This README is a project status file, not end-user docs.
