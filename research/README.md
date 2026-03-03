# Crate Engine — Deep Research Sprint (20 Documents)

Complete technical research for building a professional-grade browser game engine in Three.js.

## Documents

| # | File | Topic | Priority |
|---|------|-------|----------|
| 01 | character-controller.md | Movement, stairs, slopes, climbing, swimming, state machine | 🔴 Critical |
| 02 | building-interiors.md | Rooms, stairs, doors, multi-floor, furniture placement | 🔴 Critical |
| 03 | vehicle-physics.md | Cars, planes, helicopters, boats, enter/exit | 🟡 High |
| 04 | water-system.md | Gerstner waves, foam, buoyancy, underwater FX | 🟡 High |
| 05 | city-generation.md | Roads, buildings, zoning, LOD, street details | 🟡 High |
| 06 | combat-system.md | Hitboxes, combos, lock-on, soulslike, projectiles | 🔴 Critical |
| 07 | camera-system.md | 3rd/1st person, collision, smooth transitions | 🔴 Critical |
| 08 | collision-physics.md | Octree, Rapier.js, NavMesh, solid world | 🔴 Critical |
| 09 | animation-system.md | State machines, Mixamo, blend trees, root motion | 🔴 Critical |
| 10 | polish-and-feel.md | Particles, sound, screen shake, HUD, day/night | 🟡 High |
| 11 | npc-ai-system.md | Behavior trees, perception, squads, dialogue | 🟡 High |
| 12 | save-load-system.md | Serialization, undo/redo, export/share URLs | 🟡 High |
| 13 | terrain-advanced.md | Chunks, caves, biomes, vegetation scattering | 🟢 Medium |
| 14 | optimization.md | Instancing, pooling, LOD, workers, spatial hash | 🟡 High |
| 15 | input-system.md | Gamepad, touch/mobile, rebinding | 🟢 Medium |
| 16 | lighting-shadows.md | CSM, HDRI, SSAO, fog, emissive | 🟡 High |
| 17 | weather-system.md | Rain, snow, storms, lightning | 🟢 Medium |
| 18 | quest-progression.md | Quests, XP, leveling, rewards | 🟢 Medium |
| 19 | networking-multiplayer.md | Prediction, interpolation, rooms, binary protocol | 🟢 Medium |
| 20 | accessibility-and-settings.md | Settings menu, colorblind, subtitles, pause | 🟡 High |

## Key Recommendations

1. **Rapier.js** — #1 upgrade. Physics engine (WASM) that solves collision, stairs, vehicles, ragdolls
2. **Three.js Octree** — Quick win for character collision before Rapier migration
3. **GPU Instancing** — Critical for cities (thousands of objects → few draw calls)
4. **Behavior Trees** — Standard NPC AI pattern, modular and scalable
5. **Gerstner Waves** — Industry standard water shader
6. **Input abstraction** — Support keyboard + gamepad + touch from day 1

## Build Order (Suggested)

1. Collision system (Octree → Rapier)
2. Character controller rewrite (capsule + state machine)
3. Camera system (3rd/1st person with collision)
4. Animation state machine
5. Combat (hitboxes, combos)
6. Building interiors (rooms, stairs, doors)
7. Vehicles
8. Water + weather
9. City generation improvements
10. NPC AI
11. Save/load + undo
12. Settings + menus + polish

Every document has **Three.js code patterns** ready to adapt and an **implementation plan** specific to Crate Engine.
