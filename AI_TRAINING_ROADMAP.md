# AI Training Roadmap — Making Crate Engine Smarter

## Goal
Train/enhance the engine's AI by learning from Unreal Engine & Unity game videos,
GDC talks, and open-source game projects — so it generates better cities, NPC
behavior, physics, and world-building automatically.

## Status

## Current Status (Updated 2026-03-06)

### ✅ Phase 1 — COMPLETE
- [x] Video transcript mining: 177 transcripts processed, 943 knowledge chunks
- [x] RAG worker live: keyword search, 6-model free fallback chain + gpt-4o-mini paid last resort
- [x] Worker deployed: https://crate-engine-ai.koikes2021.workers.dev
- [x] Both typed command path AND AI agent button use RAG
- [ ] Vision model analysis — NOT YET DONE (frame extraction from game videos)
- [ ] Code extraction from GitHub — NOT YET DONE

### 🟡 Phase 2 (Tier 1 Remaining)
Priority when returning to AI training:
1. Vision model analysis — grab GTA/Watch Dogs/Cyberpunk clips, extract frames every 0.5s,
   run Gemini Vision to extract: block sizes, car speeds, pedestrian density, building ratios
2. Code extraction — scrape Unreal City Sample + Unity DOTS city GitHub repos for
   physics configs, NPC behavior values, traffic constants
3. Upgrade RAG from keyword search to Cloudflare Vectorize (true semantic search)
4. Behavior cloning from video (GTA traffic patterns → engine presets)
Target: 1200-1500 total chunks with real-world measured values

### 🔮 Phase 3 (Tier 3 — months)
- Fine-tune 7B model (Llama/Mistral) on game dev corpus
- Video-to-3D physics extraction (depth_pro, optical flow, sam2)

- [x] Phase 0: Plan created (2026-03-06)
- [ ] Phase 1: Knowledge base from video transcripts (IN PROGRESS)
- [ ] Phase 2: Frame extraction + vision model analysis
- [ ] Phase 3: Fine-tuned game dev model

---

## Phase 1 — RAG Knowledge Base (Days)
**Goal**: Build a searchable knowledge base from game dev tutorials/talks
that the crate-engine-ai worker queries when generating scenes.

### Step 1: YouTube transcript extraction
Target videos:
- Unreal Engine: city building, NPC AI, vehicle physics, open world
- Unity: procedural generation, crowd simulation, traffic systems
- GDC talks: NPC behavior, physics tuning, city design
- Channels: Unreal Sensei, GDC, Unity, CodeMonkey, Sebastian Lague

Tools: `yt-dlp --write-auto-sub`, or summarize skill

Output: `/crate-engine/ai-knowledge/transcripts/` — raw .txt files

### Step 2: Chunk + embed
- Split transcripts into ~500 token chunks
- Embed with text-embedding-3-small (OpenAI) or Cloudflare AI
- Store in Cloudflare Vectorize or KV with metadata:
  - topic (city, npc, physics, vehicles, combat)
  - source_url
  - timestamp

### Step 3: Enhance crate-engine-ai worker
- Add `/query-knowledge` endpoint
- When user asks "add realistic traffic" → vector search → inject top-3 chunks into prompt
- Result: AI generates code informed by real Unreal/Unity patterns

### Files
- `worker/ai-worker.js` — add RAG query logic
- `ai-knowledge/` — transcript chunks, embeddings index
- `ai-knowledge/topics.json` — topic taxonomy

---

## Phase 2 — Video Frame Analysis (Weeks)
**Goal**: Extract actual physics values, NPC patterns, city proportions from game footage

### Process
1. Download reference gameplay clips (GTA V, Watch Dogs, Cyberpunk, RDR2)
2. Extract frames every 0.5s: `ffmpeg -i video.mp4 -vf fps=2 frames/frame%04d.png`
3. Feed frames to Gemini 2.0 Flash Vision with prompts:
   - "What is the approximate speed of these cars? Estimate in m/s"
   - "How many pedestrians per 100m² in this scene?"
   - "What is the building height-to-street-width ratio?"
   - "Describe this NPC's walking gait timing"
4. Aggregate extracted values → engine presets JSON

### Output: Game Presets
```json
{
  "gta_city": {
    "car_speed_avg": 14,
    "car_density_per_block": 8,
    "pedestrian_density": 0.3,
    "building_height_ratio": 4.2,
    "block_size_meters": 80
  }
}
```

### Scripts
- `scripts/extract_frames.sh` — ffmpeg frame extraction
- `scripts/analyze_frames.py` — Gemini vision batch analysis
- `scripts/build_presets.py` — aggregate → presets JSON

---

## Phase 3 — Fine-Tuned Game Dev Model (Months)
**Goal**: Own model that speaks Three.js/game-dev fluently

### Training Data Sources
- Unreal Blueprint → Three.js conversions (synthetic)
- Unity C# game systems → JS equivalents
- GitHub: game dev repos, physics engines, NPC systems
- StackOverflow: game dev Q&A
- Our own engine.mjs + character.mjs (labeled examples)

### Model Options
- Qwen2.5-Coder-7B (strong at code, open weights)
- DeepSeek-Coder-V2 (excellent, open)
- Llama 3.1-8B fine-tuned on game dev corpus

### Infrastructure
- Training: Modal (A100 GPU, ~$50/run)
- Inference: Modal (serverless, cold start ~3s)
- OR: Cloudflare Workers AI (built-in, cheaper, slower)

### Format
Fine-tuning dataset: instruction → completion pairs
```
{"instruction": "Add realistic car physics with suspension",
 "completion": "// Three.js car physics...\nconst carBody = ..."}
```

---

## Current Knowledge Gaps (Priority Order)
1. NPC pathfinding through real city grids (traffic light logic, crosswalk timing)
2. Car physics: suspension travel, weight transfer, tire friction curves
3. Crowd simulation: social forces model, density-based speed reduction
4. Building proportions: real city block sizes (NYC=80m, Paris=120m, Tokyo=60m)
5. Day/night cycle impact on NPC behavior
6. LOD strategies from Unreal Nanite papers

---

## Key Resources
- GDC Vault: gdcvault.com (free talks archive)
- Unreal docs: docs.unrealengine.com
- Unity manual: docs.unity3d.com
- Game AI Pro: gameaipro.com (free book chapters)
- Papers: "Steering Behaviors for Autonomous Characters" — Craig Reynolds
- Papers: "Social Force Model for Pedestrian Dynamics" — Helbing & Molnar

---

## Worker Architecture (Enhanced)

```
User: "add realistic city traffic"
         ↓
crate-engine-ai worker
         ↓
1. Parse intent → topic: "traffic"
2. Vector search ai-knowledge DB
3. Retrieve: "GTA traffic density: 8 cars/block, avg speed 14m/s..."
4. Inject into Claude prompt as context
5. Generate Three.js code with real values
         ↓
Engine: spawns cars with correct physics
```

---

## Resume Instructions
If session interrupted, pick up from:
1. Check `ai-knowledge/transcripts/` — how many files extracted
2. Check `ai-knowledge/chunks.json` — how many chunks indexed
3. Check `worker/ai-worker.js` for `/query-knowledge` endpoint
4. Run `node scripts/build_index.js` to rebuild vector index
5. Test: `curl -X POST https://crate-engine-ai.koikes2021.workers.dev/query-knowledge -d '{"q":"city traffic density"}'`
