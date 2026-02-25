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
- **Location:** `koko-engine/` in workspace
- **Web source:** `web/engine.mjs` (~13,000+ lines), `web/character.mjs` (~5,000+ lines)
- **Current version:** engine.mjs v77, character.mjs v34, index.html v77
- **Deploy:** `npx wrangler pages deploy web/ --project-name=crateship-games --commit-dirty=true`
- **Site:** crateshipgames.com (Cloudflare Pages)
- **Cloudflare:** Koikes2021@gmail.com, ID: 6573d98c25150fd7b4602e56a0926767
- **Git:** branch `main`, remote `https://github.com/jamaine1984/crate-engine.git`
- **Three.js:** 0.170.0 via CDN importmap

#### Architecture
- `sceneHistory` and `window._userScripts` declared at TOP of engine.mjs (lines 1-2) — CRITICAL
- `window._terrainMesh` exposed for cross-module terrain access
- `getTerrainY(x, z)` in engine.mjs, `_getTerrainY(x, z)` in character.mjs (uses window._terrainMesh)
- Build toolbar: IIFE at ~line 11025, dynamically created
- `parseAndExecute` ~line 4835, `execSingle` ~line 5157
- character.mjs import: `./character.mjs?v=34` — **MUST BUMP VERSION when changing character.mjs**
- Terrain: PlaneGeometry rotated -PI/2, vertex colors for biomes

#### Weapon System (v77)
- `WEAPON_DATABASE`: 12 weapons with full stats (damage, fire rate, spread, recoil, mag size, etc)
- Bone socket system: auto-detects hand_r, hand_l, forearm_r, back, hip_r, hip_l
- `equipWeapon(id, slot)`, `unequipWeapon()`, `swapToSlot(slot)` on CharacterController
- Holster system: inactive weapons on back/hip
- Number keys 1/2/3 for weapon swap
- `createWeaponMesh(weaponId)` procedural mesh factory
- NL commands: `equip sword`, `show weapons`, `swap 2`
- **BUG**: SyntaxError `equipMatch already declared` — needs fix

#### Terrain System
- Island type uses 'tropical' color scheme (no snow)
- Ocean at y=-0.3 (below terrain)
- Gravity in character.mjs raycasts to terrainMesh (not hardcoded y=0)
- NPC spawn uses _getTerrainY for elevation
- Objects pushed to center when underwater (exclude boats)

#### 3D Model Generation (Self-hosted)
- Modal.com + L4 GPU + TripoSR
- POST: `https://jamaine1984--crate-engine-3d-generate.modal.run`
- ~$0.005/model

#### Multiplayer
- `wss://crate-engine-mp.fly.dev` (Fly.io)

#### Key Lessons (Pain Points)
- **ALWAYS bump character.mjs?v=XX** in engine.mjs import when editing character.mjs
- Python replace scripts fail silently if search string doesn't match exactly
- Browser console errors are the smoking gun for debugging
- Gravity was hardcoded to y=0 — caused everything to fall through terrain
- Cloudflare CDN caches aggressively — version busting required

#### 8 Critical Gaps vs Unity/Unreal
1. Map structure/JSON layouts (DONE - 20+ templates)
2. Mixamo animations
3. Vehicle physics
4. Gerstner wave water
5. Combat system (DONE - 12 weapon types, socket system)
6. Climbing/parkour + STAIRS/INTERIORS (requested)
7. Building interiors
8. Inventory/crafting (DONE - 32-slot grid)

#### Research Docs
- `RESEARCH-COMBAT.md` — full combat system analysis (Unreal/Unity/AAA patterns)
- Next: grounding research (NPC feet, object placement on terrain/water/hills)

## Tools & Config
- ElevenLabs: koikes2021@gmail.com, Flash v2.5
- Rust 1.93 via rustup, CMake via brew
- Modal CLI v1.3.4, authenticated to `jamaine1984`
- Stripe: Crateship Studios (test mode)
