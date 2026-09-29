# CrateShip Games Arcade: Session Handoff (Sept 29, 2026, engine upgrades)

Read this first. It replaces "SESSION HANDOFF 2026-09-29 (early).md" for engine work; that file is still valid for deploy steps, the fishing scene and parked owner items. Do the work directly, **no sub-agents**.

## Where things are
- Repo: `C:\Users\koike\Documents\Codex\2026-09-27\and-look-this-is-what-i\outputs\crate-engine`, branch `codex/platform-rebuild`, pushed.
- **Live = commit `cef9de6`** (Pages deployment `c4b57f59`). No new migrations (still 0001–0013).
- Tests: 631 total, 630 pass, 1 skip (`npm run test:platform`).
- `EDITOR_PROTOCOL = 5` (old editor tabs are told to refresh).
- `npm run smoke:production` is STALE: it still checks `asset-manifest.json` from the deleted catalog, so it fails. The failure has nothing to do with this work. Fix or trim it next time.
- Dev only: `globalThis.__crateView` / `__crateEditor` exist under `vite` dev for debugging, and are stripped from production builds.

## Research done (GitHub / Hugging Face)
- Used: three.js built-ins (Sky with clouds, AgX/Neutral tone mapping, UnrealBloom, Bokeh, GTAO), meshoptimizer simplifier (already a dependency), Poly Haven CC0 textures.
- Later candidates: pmndrs/postprocessing (merged passes, faster on phones), N8AO, takram three-geospatial (physical atmosphere + volumetric clouds), ez-tree (procedural trees with LOD).
- Owner decision: **no paid or hosted 3D generation** (TRELLIS.2 etc.). Users who want AI models bring their own API key.

## Shipped this session (all live)
1. **Look / lighting** (`engine/core/look.mjs`, `engine/runtime/atmosphere.mjs`)
   - Physical sky with time of day, clouds, night stars and overcast grey.
   - The environment lighting comes from the sky.
   - The sun's shadow box follows the camera (`shadowDistance`), snapped to texels.
   - Tone mapping choice: AgX, Neutral or ACES.
   - Presets: clear-day, golden-hour, sunset, overcast, night, cinematic.
   - Old projects keep the flat colour sky and ACES.
2. **Post-processing** (`engine/runtime/post.mjs`)
   - An MSAA HDR composer runs only when an effect is on.
   - Bloom threshold is in HDR (only the sun and glowing materials bloom).
   - Depth of field (high quality only) focuses on whatever is in the centre of the view.
   - Colour grade (saturation, contrast, warmth) and vignette.
3. **Performance** (`engine/runtime/instancing.mjs`)
   - 4 or more meshes sharing geometry and material become one InstancedMesh. The originals stay on hidden layer 1, so picking, physics and gizmos still work.
   - Heavy repeated meshes get a meshoptimizer far copy (LOD).
   - `check_scene` returns `performance` (draw calls, triangles, textures, instancing, budget ok/heavy + tips).
4. **Materials** (`engine/core/material.mjs`, `engine/runtime/materials.mjs`)
   - Physical material fields: surface, textureScale, emissive/emissiveIntensity, opacity, transmission/ior/thickness, clearcoat, sheen.
   - 14 CC0 Poly Haven surfaces live in `starter-library/surfaces/` (6 MB, `LICENSE.json`). Refetch with `scripts/fetch-surface-textures.mjs`, then recompress with `scripts/compress-surface-textures.mjs`.
   - Exported games bundle only the surfaces they use.
   - Box-projected UVs are in metres, so textures tile instead of stretching.
5. **Terrain** (`engine/core/terrain.mjs`, `engine/runtime/terrain.mjs`)
   - `components.terrain` on a plane: seeded noise hills plus up to 64 features (hill, valley, flatten, plateau).
   - Four texture layers blend by height and slope.
   - Trimesh collision: a static body is added automatically.
6. **Gameplay**
   - Buoyancy: dynamic bodies float in water planes.
   - `components.attach {to, bone}`: an item held on rightHand/leftHand/head/spine/hips (Mixamo and plain rigs), via `engine/runtime/character.mjs`.
   - `animation.moveClip` / `idleClip`: switches clips based on real movement.
   - `settings.ambience`: synthesized ocean/wind/forest/rain/fire/night sound during play and in exported games (`engine/runtime/ambience.mjs`).
7. **Inspector and AI**
   - The inspector has a Look section, extended material controls, and Terrain in the Add component menu.
   - The AI instructions (`platform/server/ai-connect.mjs`) and the model-connection prompt describe all of the above.

## Still to do (in order)
1. **Fishing scene rebuild** with the new tools:
   - Terrain island plus beach.
   - look `golden-hour`, ambience `ocean`.
   - Seller holds a rod via `attach`.
   - Lamps use emissive materials; the pier uses surface `wood`.
   - Boats and buoys float (dynamic rigidbody).
2. **Water**: depth-based colour and shore foam (needs a depth pre-pass), and a real reflection probe.
3. **Sandboxed scripting** (fishing, shops, quests): a Worker/iframe sandbox with a small event API. This is security-sensitive, so design it before building.
4. **Triggers / UI**: message boxes, interact prompts, shop UI.
5. **Editor workflow**: prefabs, multi-select, snapping, array duplicate, Poly Haven browser with licence tracking, shared recipe library.
6. **Performance polish**: KTX2 textures on import, pmndrs/postprocessing, N8AO.
7. **WebGPURenderer** behind a flag.

## Tricks learned
- `String.replace` treats `$'` in the replacement text as a special pattern. When a patch contains a regex like `...$'`, use slice/concat instead.
- three's Sky shader is about 1000× too bright near the sun for bloom. The engine caps it (`skyCap`) and uses a lower cap for the lighting environment (IBL).
- Heavy Poly Haven normal maps are about 1 MB each; mozjpeg q85 via sharp shrinks the set from 28 MB to 6 MB.
