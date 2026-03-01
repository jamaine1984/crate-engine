# AI World Model Roadmap — Crate Engine

> Inspired by Solaris (NYU) — but better. They hallucinate pixels. We generate real geometry.

## The Vision

An AI that fills in the 3D world as players explore. Walk toward empty space → the AI places buildings, roads, trees, NPCs contextually. Everything is real geometry — saveable, editable, persistent. The engine gets smarter with every player session.

**Key difference from Solaris:**
- Solaris: Video diffusion model, ~15 sec of hallucinated pixels, nothing saveable
- Crate Engine: AI issues real scene commands → real 3D objects → fully saveable/exportable
- No GPU required for inference (model predicts commands, not pixels)
- Runs forever, no time limit, no drift

## Phase 1 — Replay Recording System ✅ (BUILD NOW)

Record every player session as structured data:

```json
{
  "timestamp": 1234567890,
  "frame": 3042,
  "player": {
    "position": [x, y, z],
    "rotation": [rx, ry, rz],
    "camera": [cx, cy, cz],
    "action": "walk_forward",
    "velocity": [vx, vy, vz]
  },
  "scene_state": {
    "nearby_objects": [...],
    "time_of_day": "afternoon",
    "biome": "urban"
  },
  "events": ["entered_building", "picked_up_weapon"]
}
```

**What we capture:**
- Player position, rotation, camera every frame (or every N frames)
- Player actions: movement, jumps, attacks, interactions
- Scene context: what objects are nearby, what the player is looking at
- Build actions: what objects the player places, moves, deletes
- Session metadata: duration, scene type, preset used

**Storage:** localStorage for now, exportable as JSON. Later → server upload.

**This is FREE training data from every user session.**

## Phase 2 — Train RL Agent (AFTER ENGINE COMPLETE)

Use Phase 1 data to train models:

### 2a. City Generation Agent
- Input: partial scene (roads, a few buildings)
- Output: next object to place + position + rotation
- Reward: similarity to human-built cities from replay data
- Result: `generate city` produces human-quality layouts

### 2b. NPC Behavior Agent
- Input: NPC state + nearby players + environment
- Output: NPC action (walk, interact, flee, attack)
- Reward: natural-looking behavior from replay observations
- Result: NPCs that feel alive, not scripted

### 2c. Build Copilot
- Input: what user has built so far + cursor position
- Output: suggested next object
- Reward: matches patterns from replay data
- Result: "AI assistant" that predicts what you want to build next

### Training Stack
- PyTorch or JAX (following Solaris patterns)
- Export to ONNX → run in browser via WebGPU/WASM
- Lightweight models — must run at 60fps alongside the engine
- Solaris reference: `src/models/` for transformer architecture, `src/runners/` for training loops

## Phase 3 — Infinite AI World (MOON SHOT)

As player explores, AI generates world ahead of them:

1. Player moves toward empty area
2. Engine detects "unexplored zone" within render distance
3. AI model predicts: what should be here? (based on surrounding context)
4. Model outputs scene commands: `add skyscraper at 200,0,340`, `add road from 180,0,300 to 220,0,380`
5. Engine executes commands → real 3D objects appear
6. Player can save, edit, destroy anything the AI placed
7. **World persists** — saved to scene file, loads back exactly

**How long does it run?** FOREVER. No time limit because:
- Not generating video (Solaris limit)
- Not running a diffusion model per frame
- Model is a lightweight command predictor (~5MB ONNX)
- Runs as a web worker, doesn't block main thread
- Only triggers when player approaches empty zones

**Can players save it?** YES, 100%:
- AI-generated objects are identical to hand-placed objects
- Save/load works the same way
- Export to GLB/GLTF works the same way
- Players can edit/delete AI-placed objects freely

## References

- [Solaris (NYU)](https://github.com/solaris-wm/solaris) — Video world model, JAX, Apache-2.0
- [Solaris Engine](https://github.com/solaris-wm/solaris-engine) — Minecraft data collection via Mineflayer
- [Solaris Model Weights](https://huggingface.co/nyu-visionx/solaris) — Pretrained checkpoints
- Key architecture: Transformer + Wan VAE + Action Module + Cross-player attention

## Status

- [x] Research complete (2026-02-28)
- [ ] Phase 1: Replay recording system
- [ ] Phase 2: RL training pipeline
- [ ] Phase 3: Infinite AI world generation
