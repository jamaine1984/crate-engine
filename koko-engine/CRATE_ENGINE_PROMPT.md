# Crate Engine — Full Build Prompt

You are building a **browser-based 3D game engine** called **Crate Engine** (by Crateship Games). The entire engine runs in a single-page web app using **Three.js** (latest stable via CDN importmap). There is **NO command text box** — the ONLY interface is an **AI agent chat bubble** in the bottom-right corner where users describe what they want in natural language, and the engine builds it.

---

## Architecture

### Files
- `index.html` — single page, full-viewport 3D canvas, importmap for Three.js + addons, fixed AI chat bubble UI
- `engine.mjs` — core engine: scene, renderer, camera, lighting, all object/world systems, animation loop, AI agent integration
- `character.mjs` — player controller, NPC system, combat, RPG systems (levels, crafting, quests, dialogue), town builder
- `ai-agent.mjs` — AI chat agent that receives ALL user input, interprets intent, and executes engine commands OR generates custom code
- `multiplayer.mjs` — WebSocket server for rooms, matchmaking, chat, scene sync

### Tech Stack
- Three.js (latest) via CDN importmap — no build tools, no bundler
- Vanilla ES modules (import/export)
- All state in memory + localStorage for persistence
- Deploy to Cloudflare Pages (static files only)
- Multiplayer server on Fly.io (Node.js)

---

## The AI Agent (This Is The Entire UI)

### Chat Bubble
- Fixed bottom-right corner, collapsible
- Clean dark glass-morphism design, rounded corners
- Message history with user/agent bubbles
- Text input + send button + 🎤 voice button (Web Speech API)
- Typing indicator while agent processes
- Agent avatar/icon at top

### How It Works
1. User types or speaks naturally: "add a castle on the hill" / "make it rain" / "I want a racing game" / "change the sky to sunset"
2. Agent receives message in `handleMessage()`
3. Agent first tries to match against **built-in engine capabilities** (object spawning, terrain, weather, lighting, vehicles, NPCs, etc.)
4. If built-in commands handle it → execute immediately, respond with confirmation
5. If NOT handleable by built-in commands → agent calls user's configured AI provider (OpenAI/Claude/Gemini/Groq/DeepSeek/Ollama) to **generate custom JavaScript code**
6. Generated code runs in a **sandboxed environment** with access to: `scene`, `camera`, `THREE`, `getPlayer()`, `getNPCs()`, `getObjects()`, `showToast()`, `state`, and callbacks (`onUpdate`, `onKeyPress`, `onCollision`)
7. Agent responds conversationally: "Done! I added a castle at position (15, 0, 20). Want me to add some knights to guard it?"

### Agent Personality
- Helpful, concise, slightly enthusiastic about game dev
- Proactively suggests next steps ("Want me to add NPCs?" / "Should I make it nighttime for mood?")
- Shows what it did ("✓ Added 3 pine trees, 2 rocks, and a campfire")
- Admits when something fails and offers alternatives

### Settings (Gear Icon in Chat Header)
- AI Provider selector: OpenAI / Claude / Gemini / Groq / Mistral / DeepSeek / Ollama (local)
- API key input per provider
- Test connection button
- Model selection per provider
- localStorage persistence

---

## Engine Capabilities (What the Agent Can Do Built-In)

### Object System
- Spawn ANY object from a GLB model library (60+ models): characters, vehicles, buildings, trees, rocks, furniture, weapons, fantasy/sci-fi props
- Procedural primitives: cubes, spheres, cylinders, cones, planes, toruses
- Procedural trees (oak, pine, palm, cherry blossom)
- Procedural buildings (houses, towers, skyscrapers)
- Every object gets: `userData.name`, shadow casting, proper scale by category (vehicle 4.5m, building 8m, tree 5m, prop 0.8m, character 1.8m)
- Remove by name: "remove the castle"
- Color any object: 15+ named colors + hex codes
- Resize: "make the castle bigger" / "scale it 3x" / "make it tiny"
- Rotate: "rotate the castle 90 degrees"
- Move: "move the car to 15 15"
- List: "what objects are in the scene?"
- Teleport player: "teleport to the castle"

### Terrain System
- 10 terrain types: mountains, hills, valley, canyon, volcano, island, dunes, plateau, cliffs, flat
- 500×500 ground, 256×256 vertex resolution
- Ridge noise heightmap, height-based vertex coloring (grass → rock → snow)
- Procedural normal maps per terrain type
- Default ground is FLAT (user opts-in to terrain)
- Objects auto-raycast to terrain surface for Y positioning
- Expand world: add 300×300 ground platforms in any direction

### Water System
- Animated water with vertex displacement waves
- PlaneGeometry for lakes/ponds — multi-frequency sine waves
- TubeGeometry for rivers — flowing wave effect
- Material: color 0x1a6baa, roughness 0.05, metalness 0.6, transparent, opacity 0.75
- Water is SOLID (walkable)
- Higher-res geometry (up to 128 segments)
- `updateWaterAnimation()` called every frame

### Weather & Environment
- Rain (5,000 point particles), Snow (6,000 particles), Fog
- 10 HDR environment maps from Poly Haven (default/sunset/night/forest/desert/space/etc.)
- Auto-switch environment with time-of-day commands
- Wet/dry ground overlay with dynamic puddles
- 9 ambient particle types: dust, fireflies, embers, snow, ash, spores, bubbles, leaves, petals
- Auto-biome particle matching
- Time of day: day, night, sunset, sunrise, midnight

### Lighting & Shadows
- Cascaded shadow maps: near light (2K resolution) + far light (4K resolution), both follow camera
- PCFSoftShadowMap
- Point lights, spot lights, colored lights
- Ambient + directional + hemisphere lighting

### Post-Processing
- Lazy-loaded EffectComposer (dynamic imports with error catching)
- SSAO (off by default for performance)
- UnrealBloomPass (subtle)
- Custom color grading shader: vignette, chromatic aberration, film grain
- SMAA antialiasing
- Graphics presets: low / medium / high / ultra

### Character Controller
- WASD + arrow keys movement
- Smooth lerp-based animations: idle, walk, run, jump, roll, attack
- Arms at sides (NO T-pose)
- Gravity + ground collision
- Sprint (Shift), Jump (Space), Roll (Ctrl), Attack (left click)
- Third-person camera following player

### Vehicle System
- 30+ vehicle types: car, truck, SUV, van, bus, taxi, police car, ambulance, fire truck, tank, ATV, motorcycle, bicycle, golf cart, tractor, forklift, etc.
- 13 boat types: boat, sailboat, yacht, canoe, kayak, speedboat, fishing boat, pontoon, houseboat, ferry, pirate ship, rowboat, gondola
- 16 aircraft types: helicopter, plane, jet, biplane, glider, blimp, hot air balloon, drone, UFO, spaceship, rocket, fighter jet, cargo plane, seaplane, stealth bomber, paraglider
- F key to enter/exit (proximity-based)
- Entering vehicle auto-enables play mode
- WASD to drive, proper vehicle physics feel
- Boats auto-float at water level

### NPC System
- 5 NPC model types: villager, soldier, knight, cyberpunk, woman
- Wander behavior: random waypoints, idle/walk animation transitions
- Aggro behavior: chase player, attack in range, damage dealing
- Procedural animation fallback for models without embedded animations
- Health bars (hidden until damaged, green → yellow → red)
- NPCs avoid solid objects (vehicles, buildings) via bounding box collision
- NPCs avoid water
- NPC separation (don't stack on each other)
- AI dialogue system: 100+ lines, 7 NPC types, typewriter text effect

### Combat & RPG
- Player attacks damage nearby aggro NPCs
- NPC health system with visual health bars
- Level system with XP
- Crafting system
- Quest system
- Dialogue system with contextual responses
- Loot drops

### Building Interiors
- Enter/exit buildings with F key
- Interior generation with furniture placement
- Transition between exterior and interior scenes

### Scene Presets
- Pre-built scene configurations triggered by natural language:
  - "medieval village", "cyberpunk city", "haunted graveyard", "pirate island"
  - "desert oasis", "space station", "zombie wasteland", "enchanted forest"
  - "samurai temple", "viking settlement", "underwater ruins"
  - 50+ scene keywords recognized
- Each preset spawns appropriate terrain, buildings, NPCs, props, lighting, weather

### Save/Load
- `save <name>` → serializes all scene objects to localStorage
- `load <name>` → deserializes and rebuilds scene
- `saves` → lists all saved worlds

### Roads & Infrastructure
- Procedural curved roads (asphalt material, yellow center line)
- Procedural curved rivers

---

## AI Code Sandbox (For Anything Not Built-In)

When the agent can't handle a request with built-in commands, it generates JavaScript:

```javascript
// Sandbox API available to generated scripts:
{
  scene,           // THREE.Scene
  camera,          // THREE.Camera  
  THREE,           // Full Three.js library
  getPlayer(),     // Returns player mesh + position
  getNPCs(),       // Returns array of NPC objects
  getObjects(),    // Returns array of all scene objects
  showToast(msg),  // Show notification to user
  state: {},       // Persistent state object per script
  
  // Callbacks (register these):
  onUpdate(dt, time) {},    // Called every frame
  onKeyPress(key) {},       // Called on keydown
  onCollision(a, b) {},     // Called on object collision
}
```

- Scripts stored in `window._userScripts` array (initialize as `[]` at top of engine.mjs!)
- Each script: `{ id, name, description, code, enabled, _running, _onUpdate, _onKeyPress, _onCollision }`
- Execute via `new Function()` with named parameters for the sandbox API
- `updateUserScripts(dt)` called in animate loop
- Scripts persist to localStorage key `crate-user-scripts`
- Script manager UI (list, toggle, edit, delete scripts)

---

## Performance

### Targets
- 60 FPS with 25 objects + 10 NPCs
- 45+ FPS with 100+ objects + weather

### Optimizations
- GPU instancing (InstancedMesh) for 20+ scattered identical objects
- LOD system: 3 detail levels + billboard sprites at distance
- Auto-quality scaling: FPS monitor → auto-reduce pixel ratio and particles if <30 FPS
- Pixel ratio capped at 1.25
- Lazy post-processing imports (dynamic import with .catch(() => null))
- SSAO disabled by default
- Bloom subtle defaults
- Particle counts capped

---

## Multiplayer

### Server (Node.js WebSocket)
- Room creation and joining
- Quick match / matchmaking
- Lobby with room browser
- In-game chat
- Emote system
- Scene state synchronization
- Deploy to Fly.io free tier

### Client UI
- Lobby modal: Quick Match button, Create Room, room list with player counts
- In-game player list
- Chat overlay

---

## Monetization

### Stripe Integration
- Pro tier: $12/month
- Payment via Stripe Payment Links
- Success redirect sets localStorage pro flag
- Free tier: basic primitives + watermark on export
- Pro tier: full GLB model library, no watermark, priority features
- `isProUser()` gate check
- Pricing section on page, upgrade modal, pro badge

---

## UI Layout

### Viewport
- Full-screen 3D canvas (100vw × 100vh)
- No landing page above the viewport — engine is FIRST thing visible

### Fixed Overlays (all position: fixed, high z-index)
- **AI Chat Bubble** — bottom-right, collapsible, glass-morphism
- **Build Toolbar** — bottom-center, icon buttons for common actions (but everything routes through agent)
- **Minimap** — top-right corner
- **Game HUD** — health, XP, level (visible in play mode)
- **FPS Counter** — top-left (debug, toggleable)

### Navigation
- Fixed transparent nav bar at top with logo + links
- Links to: Docs, Marketplace, Multiplayer, Settings
- Pro badge if subscribed
- Landing/marketing content scrolls BELOW the viewport

---

## Documentation Page (`/docs/`)
- Command reference (all capabilities listed)
- Getting started tutorial
- Keyboard shortcuts
- API reference for custom scripts
- Scene preset gallery

---

## Marketplace Page (`/marketplace/`)
- Grid of 3D model cards
- Three.js 3D preview viewer per model (orbit controls)
- Search bar + category filters
- Model metadata: name, poly count, file size
- Download/add-to-scene buttons (Pro-gated for premium models)

---

## Critical Implementation Rules

1. **`window._userScripts = []` MUST be initialized at the TOP of engine.mjs** (line 3-4, right after THREE import) — NOT later in the file. The animate loop calls `updateUserScripts()` before the initialization line otherwise.

2. **All post-processing imports MUST be lazy** (`Promise.all` with dynamic `import()` and `.catch(() => null)`) — static imports crash the engine on boot.

3. **NL bypass list**: Commands that should NOT be rewritten by the natural language matcher must be caught early and routed directly. This includes: add/create/build/spawn, remove/delete, color/paint, resize/scale, rotate, save/load/saves, expand, wet/dry, particles, terrain, fog/rain/snow, graphics, time, teleport, drive/enter/exit vehicle, scene presets, scripts.

4. **Object generator guards**: All `if (lower.includes('X'))` object creation checks must be guarded with `!/^(remove|delete|color|paint|recolor|tint|resize|scale|rotate|spin)\b/.test(lower)` to prevent "remove rock" from spawning a rock.

5. **Pre-declare variables** before any code that might reference them in the same scope (avoid TDZ errors).

6. **Default ground is FLAT** — no procedural hills on startup.

7. **Objects raycast to terrain** for proper Y positioning.

8. **NPC update runs OUTSIDE the playMode block** in the animate loop — NPCs should wander in editor mode too.

9. **Single unified F key handler** — no duplicate keydown listeners. Priority: exit vehicle → exit building → enter building → enter vehicle.

10. **Water is walkable** (`userData.isSolid = true`) but NPCs avoid it via collision check.

11. **Cache bust all module imports** with `?v=N` query params. Increment on every deploy.

12. **No build tools** — everything serves as static files from a `web/` directory.

---

## Deploy
```bash
npx wrangler pages deploy web/ --project-name=crateship-games --commit-dirty=true
```

## File Size Targets
- engine.mjs: ~10,000-12,000 lines
- character.mjs: ~5,000 lines
- ai-agent.mjs: ~1,200 lines
- voice-commands.mjs: replaced by ai-agent.mjs (agent IS the NL layer now)

---

Build this engine. The AI agent chat bubble is the ONLY way users interact. No command text box. No menus for adding objects. Everything goes through the agent. Make it feel like talking to a game dev assistant who builds your world in real-time.
