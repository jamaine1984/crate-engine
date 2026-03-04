# Crate Engine — Roadmap to Public Launch

## Priority 1: Core Quality (DO FIRST)
- [x] Pool redesign — above-ground, visible water, inside + outside ladder
- [x] Walking animation — filter position tracks, procedural override
- [x] Camera shake — shadow cascade throttle, smoother lerp
- [x] HDRI cloud sky restored
- [ ] **Walk/run animation quality** — still messy, NPC spaghetti legs, folded NPCs
  - Need proper Mixamo animations (FBX → GLB conversion)
  - Or buy Synty POLYGON characters with proper rigging
  - Different NPC models fold up because bone names don't match
- [ ] **Model textures missing** — Kenney colormap, Poly Haven texture paths broken
  - Cars: need `Textures/colormap.png` for Kenney vehicles
  - HD models: some Poly Haven GLBs have broken texture paths
- [ ] **Real-looking trees** — current ones are low-poly KayKit
  - Source options: Poly Haven trees, SpeedTree exports, paid packs
- [ ] **HD cars** — Sketchfab cars we downloaded aren't loading
  - Audit `web/models/` for hd_ferrari and other HD vehicles
  - Fix GLB_MODELS alias map to reference them

## Priority 2: Model Library Overhaul
- [ ] Audit all 3,400+ models — remove broken/untextured ones
- [ ] Fix category assignments (items in wrong categories)
- [ ] Prioritize HD models over KayKit low-poly for default commands
- [ ] Source more realistic models:
  - Poly Haven (free, CC0) — furniture, nature, props
  - Sketchfab (CC licensed) — vehicles, characters
  - Synty POLYGON (~$300) — 20K+ consistent models
  - Quaternius (free) — characters with animations

## Priority 3: Beach World (FIRST WORLD TO BUILD)
- [ ] Sand terrain (flat, no hills)
- [ ] Real-looking water (Gerstner wave shader already exists)
- [ ] Lake/ocean with swim zone
- [ ] NPCs walk into water and swim
- [ ] Palm trees, beach props (umbrella, towel, chairs)
- [ ] Beach-specific HDRI sky

## Priority 4: World System Improvements (LAST)
- [ ] Scene clearing when loading new world (no stacking)
- [ ] Better world templates (less random, more curated)
- [ ] World-specific terrain (sand, snow, grass, stone)
- [ ] Proper lighting per world theme
- [ ] Clean transitions between worlds

## Known Bugs
- [ ] "Press F to enter bush" — bushes detected as vehicles
- [ ] `Textures/colormap.png` 404 for Kenney assets
- [ ] `runtime/engine-bridge.mjs` and `runtime/grass-system.mjs` 404
- [ ] Some NPC character types fold up / break when walking
- [ ] World stacking (objects accumulate across world loads)
