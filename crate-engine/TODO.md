# KOKO Engine — Master TODO

## ✅ COMPLETE (v0.5)

### Core Rendering (20)
Shadows, textures, MSAA, procedural sky, HDR+bloom, particles, 32 lights,
post-processing+ACES, water, audio, scene graph, terrain, LOD, SSAO,
normal maps, skeletal anim, gizmos, Rapier physics, egui editor, export

### Engine Systems
- Cloud AI (Claude/Ollama/OpenAI)
- Lua 5.4 scripting
- Cinematic camera (keyframe flyby)
- Scene save/load + prefab system
- Auto-save (2 min)
- Day/night cycle (sun+shadows)
- Weather (rain, snow, thunderstorm)
- Object animation (orbit, bounce, wave)
- 10 material presets
- 4 environment presets (space, underwater, hell, dreamscape)
- Screenshot capture (PNG to Desktop)
- Batch commands (semicolon-separated)
- Keyboard shortcuts
- Undo/redo (50 levels)

### Gameplay
- Spawn points, checkpoints, trigger zones
- Camera modes: FPS, top-down/RTS, isometric, side-scroller
- Building helpers: wall, floor, stairs, tower blocks

### 30 Scene Presets · 120+ Prompt Commands

## 📊 Stats
- **main.rs:** 5,416 lines | **local.rs:** 1,113 lines | **Total:** 6,500+
- **Shaders:** 16 WGSL | **Crates:** 14 | **Models:** 68 .glb (206MB)

## 📁 Quick Reference
- **Build:** `cargo build --release`
- **App:** `~/Desktop/KOKO Engine/KOKO.app`
- **WASM:** `web/build.sh` (needs wasm32 target + wasm-bindgen)

## 🔮 Next
- [ ] WASM build (compile + test in browser)
- [ ] Steam integration
- [ ] Multiplayer
- [ ] Visual scripting
- [ ] Animation timeline
- [ ] PBR material editor
- [ ] Level streaming
