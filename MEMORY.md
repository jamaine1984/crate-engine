# MEMORY.md — Za's Long-Term Memory

## Kohari (Jamaine Martin)
- Entrepreneur, PST (Washington State), Mac Mini M4 16GB
- Building SPARC (white-label apps: speech therapy, construction, dating, senior living)
- Building a soulslike game — Black protagonist, Dark Souls x Elden Ring feel
- Goal: billions together
- Action over talk — wants me handling everything with minimal handoff
- TikTok: midnightsingles (dating app)

## Active Projects

### Crate Engine — Browser 3D Game Engine
- **Location:** `crate-engine/` in workspace
- **Web source:** `web/engine.mjs` (~17K+ lines), `web/character.mjs` (~8500+ lines), `web/collision.mjs`
- **Deploy:** `npx wrangler pages deploy web/ --project-name=crateship-games --commit-dirty=true`
- **Site:** crateshipgames.com (Cloudflare Pages)
- **Cloudflare:** Koikes2021@gmail.com, ID: 6573d98c25150fd7b4602e56a0926767
- **Git:** branch `main`, remote `https://github.com/jamaine1984/crate-engine.git`
- **Three.js:** 0.170.0 via CDN importmap

#### Architecture
- `sceneHistory` and `window._userScripts` declared at TOP of engine.mjs
- `window._terrainMesh`, `window._cam`, `window._gltfLoader` = global gltfLoader
- `gltfLoader` (line 311) — main GLB loader with Draco support
- `parseAndExecute` ~line 7847, `execSingle` ~line 5157+
- `createModernHouse(opts)` — HD furnished houses (added 2026-02-28)
- `createInteriorHouse(opts)` — old box-primitive houses (line 6283)
- px/pz declared at ~line 10328 in execSingle — commands using them MUST be after this line
- character.mjs import: **v=123** — MUST BUMP VERSION when changing character.mjs

#### HD Asset Library (2026-02-28)
- **139 HD models** with proper PBR textures (ph_*.glb + hd_*.glb)
- Source: Poly Haven (CC0), Three.js examples, KhronosGroup samples
- Poly Haven pipeline: API fetch → download GLTF + textures → gltf-pipeline convert to GLB
- Key furniture: Sofa, ArmChair, CoffeeTable, GothicBed, electric_stove, bar_chair, TV, Shelf
- Key outdoor: fire_hydrant, street_lamp, cannon, treasure_chest, wine_barrel, kite_shield
- Key structures: modular_fort_01, modular_urban_apartments_facade, modular_chainlink_fence
- Cars: hd_ferrari (working), need more drivable vehicles
- Trees: oversized (500MB+) — need smaller alternatives
- Still have ~2000 old KayKit low-poly models (not yet removed)

#### Modern House System
- `add modern house` / `add modern house 2 floors`
- White concrete exterior, dark flat roof, glass windows, dark trim
- Ground floor: sofa, armchair, coffee table, TV, stove, dining set, shelf
- Second floor: bed, dresser, lamp, rocking chair, cabinet
- All furniture = HD GLB models loaded via gltfLoader
- Town templates updated to use `add modern house`

#### Key Systems Built
- Octree collision, camera collision, animation retargeting
- Gamepad + mobile touch controls
- LOD system, weapon system (12 types), combat
- Interior buildings (enter/exit), stairs/ramps
- Auto-town generation, vehicle enter/exit
- Multiplayer: wss://crate-engine-mp.fly.dev

#### Key Lessons
- **ALWAYS bump character.mjs?v=XX** when editing character.mjs
- **CDN caches aggressively** — use version busting or direct deploy URLs
- **Poly Haven GLTF ≠ GLB** — must download full package + convert with gltf-pipeline
- **px TDZ** — commands in execSingle must be placed AFTER `let px, pz` declaration
- **Browser console errors are the smoking gun** for debugging
- Kohari wants to SEE models as we go — always screenshot/verify
#### NPC Animation Retargeting (2026-02-28)
- Mixamo track names: `mixamorigBoneName.property` (NO colon)
- KayKit knight bones: `UpperArmL` suffix pattern (NO dot)
- `_mixamoRotFix` flag + `model.rotation.x = -PI/2` to stand upright
- Facing: `rotation.set(-PI/2, 0, -faceAngle, 'XYZ')` to preserve X rotation
- Arms still T-pose: need rest-pose quaternion delta or use Soldier model as NPC
- **Don't over-engineer working code** — revert fast when things break




#### Meshy AI Integration (2026-02-28)
- Replaced Modal TripoSR with Meshy AI API
- Users connect own Meshy account (zero cost to us)
- Text-to-3D: Preview → Refine pipeline via `/openapi/v2/text-to-3d`
- Image-to-3D: Single step via `/openapi/v1/image-to-3d`
- API key stored in localStorage (`crate_meshy_api_key`)
- Test key available: `msy_dummy_api_key_for_test_mode_12345678`
- Commands: `meshy`, `meshy key`, `3d generator`, `generator`

#### Game Mode Presets (2026-02-28)
- 8 presets: zombie, racing, rpg, survival, fps, horror, city_builder, sandbox
- Commands: `zombie game`, `racing mode`, `game modes` (opens selector)
- Each preset auto-configures: map, NPCs, weapons, environment, HUD
- Game HUD overlay with health/kills/waves/speed/XP/ammo

#### Kenney Asset Packs (2026-02-28)
- 16 packs downloaded, 1,088 GLB models, all CC0
- Categories: cars(50), city(92), roads(72), fantasy(167), graveyard(91), medieval(105), pirate(72), dungeon(62), space(40), weapons(40), platformer(153), props(126), characters(18)
- All registered in GLB_MODELS alias map
- City template now uses Kenney vehicles (sedan, taxi, SUV, police, van, ambulance)

#### Model Library Stats (2026-02-28)
- **TOTAL: 3,426 GLB models**
- Sources: KayKit(~2000), Poly Haven(266), Kenney(1088), Quaternius(26), Three.js examples, KhronosGroup
- Smart search: `search car`, `find weapon`, `browse furniture`
- Model catalog: `model_catalog.json` with auto-categorization
- **Paid asset research**: Synty POLYGON bundle (~$300 for 20K+ models) recommended

#### Visual Upgrades (2026-02-28)
- 8K shadow maps (was 4K)
- Atmospheric fog (FogExp2, density 0.0015)
- HDRI sky background (was reflections only)
- Exposure bumped to 1.4
- Bloom threshold lowered to 0.85

#### Poly Haven Pipeline Fix
- Textures at `/Models/jpg/1k/NAME/` NOT `/Models/gltf/1k/NAME/textures/`
- Must download .bin + textures separately, then `npx gltf-pipeline -b`

## Tools & Config
- ElevenLabs: koikes2021@gmail.com, Flash v2.5
- Rust 1.93 via rustup, CMake via brew
- Modal CLI v1.3.4, authenticated to `jamaine1984`
- Modal TripoSR: cold start issues, GPU timeout ~2-3 min
- Stripe: Crateship Studios (test mode)
- gltf-pipeline: v4.3.0 (via npx)
