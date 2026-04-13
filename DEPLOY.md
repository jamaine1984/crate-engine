# DEPLOY.md — Crate Engine Deployment Guide

**⚠️ READ THIS BEFORE MAKING ANY CHANGES ⚠️**

## Current Working Version

- **Git commit:** `1af5e18d` (main branch)
- **Cloudflare deploy:** `edce0520.crateship-games.pages.dev`
- **Live URL:** https://crateshipgames.com
- **Date confirmed working:** 2026-04-06
- **Confirmed features:**
  - City builder (buildCityWorld3) — type "build city"
  - Woman/Man NPCs with walk/run/idle animations
  - 15 built-in world recipes (medieval village, cyberpunk city, etc.)
  - 6,218 3D model files (GLBs)
  - AI Build Agent (zero API keys needed for core features)
  - Godmode runtime (client-side effects)

## Repository Structure

```
/Users/jamainemartin/Desktop/crate-engine/     ← Git repo (source code)
├── engine.mjs          ← Main engine (30K+ lines)
├── character.mjs       ← Character system + NPCs
├── ai-agent.mjs        ← AI chat agent + world recipes
├── godmode.mjs         ← Godmode effects runtime
├── llm-interpreter.mjs ← LLM command interpreter
├── city_assets.json    ← City building manifest (REQUIRED for city builder)
├── index.html          ← Landing page
├── play.html           ← Game page
├── models/             ← SYMLINK to models (NOT in git, deploy-only)
└── .gitignore          ← Excludes models/, KOKO.app, etc.
```

## Where Are The Models?

The 3D models (6,218 GLB files, ~2GB) are **NOT in git** — they're too large.

**Local location:**
```
/Users/jamainemartin/.openclaw/workspace/crate-engine/web/models/
```

**In the deploy directory:**
The `models/` symlink in the repo root points to the above location.

**On Cloudflare:** Models are uploaded via wrangler and served at `/models/` paths.

## How to Deploy

### Step 1: Push source code to GitHub
```bash
cd /Users/jamainemartin/Desktop/crate-engine
git add -A
git commit -m "your message"
git push origin main
```

### Step 2: Deploy to Cloudflare (includes models)

**IMPORTANT:** Deploy from `/tmp/crate-deploy` (or similar) that includes both source AND models.

```bash
# Create deploy directory with source + models
mkdir -p /tmp/crate-deploy
cp /Users/jamainemartin/Desktop/crate-engine/*.mjs /tmp/crate-deploy/
cp /Users/jamainemartin/Desktop/crate-engine/*.html /tmp/crate-deploy/
cp /Users/jamainemartin/Desktop/crate-engine/*.json /tmp/crate-deploy/
cp /Users/jamainemartin/Desktop/crate-engine/*.svg /tmp/crate-deploy/ 2>/dev/null
cp /Users/jamainemartin/Desktop/crate-engine/_headers /tmp/crate-deploy/ 2>/dev/null
cp /Users/jamainemartin/Desktop/crate-engine/service-worker.js /tmp/crate-deploy/ 2>/dev/null

# Symlink models (avoids copying 2GB)
ln -sf /Users/jamainemartin/.openclaw/workspace/crate-engine/web/models /tmp/crate-deploy/models

# Deploy
cd /tmp/crate-deploy
npx wrangler pages deploy . --project-name=crateship-games --branch=main --commit-dirty=true
```

### ⚠️ DO NOT keep large app bundles in the repo root
App bundles like `KOKO.app` can exceed Cloudflare's 25MB upload limit. Keep them outside the repo, or deploy from `/tmp/crate-deploy` as shown above.

## Critical Files — DO NOT DELETE

| File | Why |
|------|-----|
| `city_assets.json` | Without this, "build city" silently fails |
| `engine.mjs` | Must have `skeleton.pose()` fix and tutorials.mjs stub |
| `character.mjs` | Must have `woman`, `man`, `animated_woman`, `animated_man` entries |
| `models/` directory | All 3D assets — city won't render without these |

## What Broke Before (History)

1. **Hermes (agent)** — made 18 "improvements" that broke production on 2026-03-31
2. **Claude (agent)** — reverted engine to older version on 2026-04-05, losing:
   - Woman/Man NPC characters
   - Mixamo animation loading
   - skeleton.pose() fix (caused T-pose)
   - tutorials.mjs stub (caused black screen)
   - city_assets.json (city builder stopped working)
3. **Fix (Za/OpenClaw)** — 2026-04-06: Pulled correct files from working Cloudflare deploy `2baff1e9`, restored models from local disk, redeployed

## Rules for AI Agents

1. **DO NOT rewrite engine.mjs or character.mjs from scratch** — they are 30K+ and 8K+ lines
2. **DO NOT remove city_assets.json**
3. **DO NOT push to GitHub without Jamaine's permission**
4. **DO NOT deploy without confirming the models/ directory is included**
5. **Test changes locally before deploying**
6. **If something breaks, the known-good commit is `1af5e18d`**

## Cloudflare Details

- **Project:** crateship-games
- **Account:** Koikes2021@gmail.com
- **Custom domain:** crateshipgames.com
- **GitHub repo:** jamaine1984/crate-engine
- **Cloudflare Worker (AI):** crate-engine-ai.koikes2021.workers.dev
