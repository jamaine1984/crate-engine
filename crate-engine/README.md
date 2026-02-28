# ⚡ Crate Engine

**The AI-Powered 3D Game Engine** — Build entire game worlds with voice or text commands.

🔗 **[Try it live → crateshipgames.com](https://crateshipgames.com)**

## Features

### 🎤 77,000+ Voice & Text Commands
Speak or type natural language to build worlds in real time:
- *"Build a medieval village"* — Instant full scene with buildings, NPCs, props
- *"Make it rain"* — Dynamic weather system
- *"Add 20 trees"* — Batch object placement
- *"Make the castle bigger"* — Real-time transforms

### 🎮 Full Game Engine
- **Play Mode** — WASD movement, combat, exploration
- **Combat System** — Combo attacks, heavy strikes, dodge rolls, stamina
- **NPC Dialogue** — 100+ contextual AI lines, 7 NPC types
- **Climbing** — Ladders, vines, wall vaulting
- **Building Entry** — Walk into doors, fully furnished interiors
- **Crafting** — Forge weapons, brew potions
- **Quest System** — Dynamic quests from NPCs

### 🌍 World Building
- 30+ biome presets (medieval, cyberpunk, space, horror, volcanic...)
- 10 terrain types with height-based vertex coloring
- Dynamic weather (rain, snow, fog)
- Day/night cycle
- Procedural forests, villages, cities, dungeons

### 🏪 3D Asset Marketplace
- **37 AI-Generated Premium Models** (Meshy AI)
- **120 Free Procedural Models** (Blender-generated, PBR materials)
- **Creator Marketplace** — Upload & sell your models (70/30 rev share)
- Drag & drop GLB import into any scene

### 🎮 Multiplayer (Beta)
- WebSocket real-time co-op
- Shared scene building
- Player avatars with smooth interpolation
- In-game chat

### 📱 Mobile Ready
- Virtual joystick
- Touch attack/dodge/jump buttons
- Responsive UI

## Tech Stack
- **Three.js** — 3D rendering
- **Web Speech API** — Voice commands
- **Draco** — Model compression
- **WebSocket** — Multiplayer
- **Cloudflare Pages** — Hosting
- **Blender** — Procedural model generation
- **Meshy AI** — AI 3D model generation

## Getting Started
```bash
# Clone
git clone https://github.com/crateshipgames/crate-engine.git
cd crate-engine

# Serve locally
npx serve web/

# Open http://localhost:3000
```

## Commands Cheat Sheet
| Command | What it does |
|---------|-------------|
| `add tree` | Places a tree |
| `build a village` | Generates full medieval village |
| `terrain mountains` | Creates mountain terrain |
| `play` | Enter play mode (WASD) |
| `time night` | Sets nighttime |
| `make it rain` | Weather: rain |
| `spawn 5 enemies` | Combat encounters |
| `craft fire sword` | Crafting system |

## Built by
**Crateship Studios** — [crateshipgames.com](https://crateshipgames.com)

## License
MIT
