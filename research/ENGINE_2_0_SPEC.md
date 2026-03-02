# Crate Engine 2.0 — Architecture Specification

> **Single source of truth.** Every module, every crate, every new file references this document.
> Updated: 2026-03-01

---

## 1. The 7 Laws

These rules are non-negotiable. Every contributor (human or AI) must follow them.

1. **No edits inside giant files except bridging calls + small adapters.**
   `engine.mjs` (23K lines) and `character.mjs` (8K lines) are frozen for feature work.
   Only add thin bridge calls that route into new modules.

2. **All new systems go into new modules/crates.**
   New JS code → `web/runtime/*`
   New Rust code → `crates/koko-*`
   Never append functionality into legacy files.

3. **One direction of dependency.**
   `web/*` can call `crates/*` through Tauri IPC (desktop) or API (web).
   `crates/*` NEVER depends on `web/*`.

4. **Every module has:**
   - `README.md` with purpose and public API summary
   - A strict public API file (`mod.rs` or `index.mjs`)
   - Tests (Rust: `#[cfg(test)]` module, JS: exported test runner or separate test file)

5. **Feature changes require updating this spec.**
   If you add a new command type, system, or module — update this document first.

6. **Refactors use parallel modules.**
   Create `engine_v2/*` or `system_v2.mjs` and migrate gradually.
   Never rewrite in place.

7. **Stable command schema between AI → engine.**
   All commands are versioned JSON. See `COMMAND_SCHEMA.md`.
   The command bus is the ONLY way to execute engine actions.

---

## 2. System Architecture (3 Layers)

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: UX / AI Interface (JavaScript)                     │
│                                                             │
│  ai-agent.mjs ──→ interpreter.mjs ──→ COMMAND BUS          │
│  voice-commands.mjs ──────────────────→ COMMAND BUS         │
│  editor (click/drag) ─────────────────→ COMMAND BUS         │
│  multiplayer-client.mjs ──────────────→ COMMAND BUS         │
│                                                             │
│  Output: Versioned JSON commands                            │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2: World Compiler + Simulation (Rust)                 │
│                                                             │
│  koko-commands  — schema, validation, versioning            │
│  koko-assets    — tags, snap points, footprints, LOD        │
│  koko-world     — deterministic world compiler              │
│  koko-nav       — navmesh + lane graphs                     │
│  koko-sim       — schedules, spawn rules, traffic           │
│                                                             │
│  Input: Command JSON                                        │
│  Output: World Build Manifest JSON                          │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3: Rendering (dual backend)                           │
│                                                             │
│  Web:     Three.js (now) → WebGPU (later)                   │
│  Desktop: koko-render (wgpu)                                │
│                                                             │
│  Input: World Build Manifest + real-time commands            │
│  Output: Pixels on screen                                   │
└─────────────────────────────────────────────────────────────┘
```

### Communication Paths

| From | To | Method | When |
|------|------|--------|------|
| JS (web) | Rust (world compiler) | HTTP API (Cloudflare Worker) | Web deployment |
| JS (desktop) | Rust (world compiler) | Tauri IPC | Desktop/Steam |
| JS (future) | Rust (WASM) | Direct call | WASM unification (deferred) |

---

## 3. File Structure

### New files (Phase 1)

```
research/
  ENGINE_2_0_SPEC.md            ← this file
  COMMAND_SCHEMA.md             ← all commands & JSON format

web/
  runtime/
    README.md                   ← module overview
    command-bus.mjs             ← central dispatcher (the heart)
    command-schema.mjs          ← JS-side schema + validator

crates/
  koko-commands/
    Cargo.toml
    README.md
    src/
      lib.rs                    ← public API
      schema.rs                 ← command type definitions
      validate.rs               ← validation logic
      version.rs                ← schema versioning
```

### New files (Phase 2+)

```
web/
  runtime/
    world-client.mjs            ← receives manifest, applies to scene
    entity-bridge.mjs           ← JS entities ↔ Rust entity IDs
    streaming.mjs               ← chunk streaming + LOD triggers
    render/
      three-adapter.mjs         ← thin wrapper around Three.js renderer
      postfx.mjs                ← post-processing stack
      lighting.mjs              ← lighting presets
      materials.mjs             ← PBR material settings
    gameplay/
      controller.mjs            ← extracted from character.mjs
      rpg.mjs                   ← XP/crafting/quests extracted
      npc-js.mjs                ← JS NPC logic (thin, calls Rust)
    ai/
      prompt-router.mjs         ← LLM routing, no engine logic
      safe-exec.mjs             ← sandbox rules for generated JS

crates/
  koko-assets/                  ← tag taxonomy, snap points, footprints
  koko-world/                   ← deterministic world compiler
  koko-nav/                     ← navmesh + lane graphs
  koko-sim/                     ← schedules, spawn rules, traffic
```

### Existing files (frozen for features, bridge edits only)

```
web/
  engine.mjs          ← legacy orchestration, becomes thin adapter
  character.mjs       ← legacy player/NPC, logic migrates to runtime/gameplay/*
  ai-agent.mjs        ← stays, but outputs JSON commands only
  interpreter.mjs     ← stays, but routes through command bus
  actions.mjs         ← stays, becomes command bus handler
  voice-commands.mjs  ← stays, routes through command bus
  godmode.mjs         ← stays, routes through command bus
```

---

## 4. The Command Bus

The command bus (`web/runtime/command-bus.mjs`) is the single point through which ALL engine actions flow.

### Responsibilities
- Validate every command against the schema
- Generate command IDs and timestamps
- Execute commands by routing to handlers
- Log every command (history for undo/redo/replay)
- Notify middleware (multiplayer sync, analytics, recording)
- Support batched commands (world builds)

### Flow
```
Source (chat/voice/editor/multiplayer/script)
  │
  ▼
command-bus.dispatch({ type: 'SPAWN_OBJECT', payload: { ... } })
  │
  ├── validate(command)     → reject if invalid
  ├── middleware.before()    → multiplayer sync, rate limiting
  ├── handler.execute()     → actual engine work
  ├── middleware.after()     → logging, analytics
  └── history.push()        → undo/redo stack
```

### All sources route here
- `ai-agent.mjs` → calls `commandBus.dispatch()` instead of `Actions.XXX()` directly
- `interpreter.mjs` → `interpret()` returns a command, caller dispatches it
- `voice-commands.mjs` → same
- `multiplayer-client.mjs` → incoming remote commands dispatched locally
- Editor (click/drag) → transform commands dispatched
- Scripts (sandbox) → commands dispatched through safe API

---

## 5. World Build Pipeline

### Phase 1 (current): JS-only
Commands execute directly in Three.js. No Rust involved.
The command bus dispatches to `actions.mjs` handlers which call `engine.mjs` functions.

### Phase 2: Rust world compiler
Complex world builds (CITY_MODERN, etc.) are compiled by `koko-world`:

```
Command JSON (WORLD_BUILD)
  │
  ▼
koko-world (Rust)
  │
  ├── Layout generator (zoning, road graph, lot subdivision)
  ├── Asset placer (queries koko-assets for tagged models)
  ├── NPC scheduler (koko-sim)
  ├── Nav builder (koko-nav)
  │
  ▼
World Build Manifest (JSON)
  │
  ▼
world-client.mjs (JS)
  │
  ├── Load assets from CDN by tag
  ├── Place with snap rules
  ├── Build nav/traffic runtime
  └── Stream chunks by distance
```

### World Build Manifest format
See `COMMAND_SCHEMA.md` section on WORLD_BUILD_MANIFEST.

---

## 6. World Templates (Phase 3+)

Six deterministic templates, implemented one at a time:

| Template | Priority | Key Systems |
|----------|----------|-------------|
| CITY_MODERN | 1 (first) | Zoning, roads, sidewalks, traffic, NPC schedules |
| MEDIEVAL | 2 | Organic roads, market square, castle, villager schedules |
| ZOMBIELAND | 3 | POIs, blocked roads, fog volumes, survivor stealth |
| SPACE_STATION | 4 | Modular grid, zones, roles, drones |
| TROPICAL_ISLAND | 5 | Coastline splines, resort, jungle gradient |
| DESERT_OUTPOST | 6 | Sparse town, highway, convoys, dust storms |

Each template is a configuration for the world compiler, NOT separate code.
The compiler is generic; templates provide parameters.

---

## 7. Rendering Roadmap

### Current (Three.js)
- Basic shadows (cascaded, PCF soft)
- Post-processing (bloom, SSAO, color grading, SMAA)
- Environment maps (HDR)
- GPU instancing, LOD, billboard sprites

### Target (Three.js ceiling push)
- PBR material system (roughness/metallic/normal/AO maps)
- HDR environment lighting (IBL)
- Screen-space reflections
- Improved shadow quality (VSM or PCSS)
- TAA (temporal anti-aliasing)
- Volumetric fog/god rays
- Better water (screen-space reflections, foam, caustics)

### Desktop (koko-render growth path)
- WGPU frame graph
- Clustered forward+ lighting
- Cascaded shadow maps
- TAA + GTAO
- Volumetrics
- This becomes the Steam/showcase renderer

---

## 8. Performance Targets

| Scenario | Target FPS | Measurement |
|----------|-----------|-------------|
| 25 objects + 10 NPCs | 60 FPS | Baseline |
| 100+ objects + weather | 45+ FPS | Stress test |
| CITY_MODERN full build | 30+ FPS | World template |
| World compile time | < 10 seconds | From command to first chunk visible |
| Command dispatch latency | < 1ms | Bus overhead only |

---

## 9. Monetization Architecture

| Feature | Free | Pro ($12/mo) |
|---------|------|-------------|
| Engine + all commands | Yes | Yes |
| Save/Load | Yes | Yes |
| Share/Remix | Yes | Yes |
| Export HTML | Branded + basic shapes | Unbranded + full GLB models |
| Premium models | 20 | 500+ |
| AI prompts/day | 50 | Unlimited |
| Publish to crateshipgames.com | No | Yes |

Stripe Payment Links for checkout. Pro status in localStorage (upgrade to Supabase auth later).

---

## 10. Migration Strategy

### Phase 1: Foundation (command bus)
- Create `web/runtime/command-bus.mjs` and `command-schema.mjs`
- Create `crates/koko-commands`
- Add bridge calls in `ai-agent.mjs` and `interpreter.mjs` to route through bus
- Existing `actions.mjs` becomes a handler registered with the bus
- Zero breaking changes to current functionality

### Phase 2: Asset tagging
- Extend `crates/koko-assets` with tag taxonomy
- Tag top 200 models (category, size, snap points, collision)
- Build queryable asset index

### Phase 3: World compiler (CITY_MODERN)
- Build `crates/koko-world` with city generation
- Build `web/runtime/world-client.mjs` to apply manifests
- First template: modern city with zoning, roads, sidewalks

### Phase 4: Simulation
- Build `crates/koko-nav` (navmesh + lane graphs)
- Build `crates/koko-sim` (NPC schedules, traffic, spawn rules)

### Phase 5: Rendering improvements
- Build `web/runtime/render/*` modules
- Push Three.js to ceiling
- Desktop koko-render improvements

### Phase 6: Remaining templates
- MEDIEVAL, ZOMBIELAND, SPACE_STATION, TROPICAL_ISLAND, DESERT_OUTPOST

### Phase 7: WASM unification (deferred)
- Compile Rust crates to WASM for browser
- Eliminate API round trip for web world compilation
- Unified runtime across web and desktop
