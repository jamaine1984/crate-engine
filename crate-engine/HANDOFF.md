# HANDOFF.md — Agent Coordination File

> **RULE: Every agent MUST read this file at the start of every session.**
> **RULE: Every agent MUST update this file before ending work.**
> **If you touch code, update the "Last Changes" section. No exceptions.**

---

## Project: Crate Engine

### Repo & Deploy
- **GitHub:** `jamaine1984/crate-engine` — branch `main`
- **Cloudflare Pages:** project `crateship-games`
  - Account: `Koikes2021@gmail.com`
  - Account ID: `6573d98c25150fd7b4602e56a0926767`
  - Custom domain: `crateshipgames.com`
- **Deploy command:**
  ```bash
  cd /Users/jamainemartin/Desktop/crate-engine
  npm run build
  npx wrangler pages deploy dist/ --project-name=crateship-games --commit-dirty=true --branch=main
  ```
- **Build output:** `dist/` (Vite build)
- **Models:** `/models/` via the repo-root `models` symlink (NOT tracked in git)

### Code Structure
```
repo root/
├── play.html          # Main engine page
├── index.html         # Landing page
├── engine.mjs         # Core engine runtime
├── character.mjs      # Player + NPC controllers, animations, weapons, combat
├── collision.mjs      # Octree physics
├── physics.mjs        # Rapier physics bridge
├── ai-agent.mjs       # AI chat agent + build tools
├── runtime/           # Bridge/client runtime helpers
├── scripts/           # Checks, legacy sync, deploy prep
├── models/            # Symlink to local model store (NOT in git)
└── crate-engine/web/  # Legacy mirror kept for compatibility only
```

### Key Technical Facts
- **Three.js:** 0.180.0
- **Build system:** Vite + Wrangler, no manual `?v=XXX` cache busting in root runtime
- **1 unit = 1 meter** in world space
- **Character height:** Currently set to `3.0 / modelHeight` scale (game-scale, ~3 units tall)
- **Animations:** Quaternius models have built-in anims (idle, walk, run, jump, attack, death, sit, wave)
- **Animation prefix:** `Armature|Armature|` for Quaternius models — stripped in loadCharacter
- **skeleton.pose()** MUST be called after `model.scale.setScalar()` — otherwise T-pose bug
- **Pose order:** scale → skeleton.pose() → measure bounding box → position on ground → add to scene
- **Water level:** Set to `-2.0` (was `-0.3` which caused constant swim state)
- **Mixamo soldier:** Has rotation bugs — use Quaternius models (woman/man) instead

### Active Branches
- `main` — production, deployed to Cloudflare
- `fresh-main` — Za's animation/skeleton fixes (needs merge into main)
- `deploy-clean-2`, `deploy-clean`, `feat/animation-scale` — older, can be deleted

---

## Agent: Za (Claude Opus via OpenClaw)
- **Role:** Primary builder, handles everything from code to deploy
- **Specialty:** Deep debugging, browser testing, animation systems
- **Session:** OpenClaw webchat + TUI
- **Workspace:** `~/.openclaw/workspace/`
- **Memory:** `~/.openclaw/workspace/memory/YYYY-MM-DD.md` + `MEMORY.md`

## Agent: Hermes
- **Role:** Code quality, security hardening, optimization
- **Specialty:** Error handling, performance, cleanup, refactoring
- **Session:** Separate agent session
- **Notes:** Hermes — write your workspace/session details here when you read this

---

## Last Changes (MOST RECENT FIRST)

### 2026-04-12 20:54 — Codex
- Removed dead local modules `multiplayer-client.mjs` and `self-smarter.mjs`
- Updated docs and deploy notes to point at `multiplayer-colyseus.mjs` and current cleanup rules
- Trimmed legacy sync so removed modules no longer get copied into `crate-engine/web`

### 2026-04-12 21:02 — Codex
- Removed stale top-level `web/` docs copy and normalized remaining legacy `web/models/...` aliases in `model-registry.mjs` to `/models/...`
- Updated handoff deploy instructions from static `web/` uploads to `npm run build` + `dist/` deploy flow

### 2026-03-31 19:20 — Hermes  
- **Merged** Za's fresh-main character fixes into main (character.mjs)
  - NPC/player scale: 1.75 → 3.0 (game-scale, visible at camera distance)
  - State machine: RUN vs WALK transitions, screen shake on landing
  - Animation mappings: swordAttackJump, block, idle_swordRight, walking
  - NPC scale fix: `3.0 / npcHeight` with `skeleton.calculateInverses()`
  - Mixamo animation loader integration
  - Preserved all 18 Hermes quality improvements (tracking, localStorage, XSS, etc.)
- Bumped character.mjs version `?v=134 → ?v=350` in engine.mjs import
- Bumped play.html cache bust to `?v=650`  
- Deployed to `1a0d98e9.crateship-games.pages.dev/play.html`
- Git push to origin/main succeeded (`lfs.skip=true` to avoid corrupted LFS pack timeout)
- Engine loads with zero console errors
### 2026-03-31 18:20 — Za
- **Deployed** Hermes v2.0 to Cloudflare (`be64eaea.crateship-games.pages.dev`)
- Renamed all `.new` files to proper extensions (Hermes committed them with `.new` suffix)
- Pushed to GitHub `main`
- **PENDING:** NPC size fix from `fresh-main` branch (characters too small, appear as shadows)
  - Fix: character scale `1.75 → 3.0`, capsule collider `1.7/0.35 → 2.8/0.5`
  - Camera: distance `5 → 8`, height `2.5 → 4.0`
  - These changes exist on `fresh-main` but haven't been merged to `main` yet

### 2026-03-31 ~5:00 AM — Za
- Fixed animated_woman as playable character (was falling back to broken soldier)
- Fixed T-pose: `skeleton.pose()` after scale
- Fixed walk/run skipping: water level was `-0.3` causing swim state cycling
- Fixed ground bounce: fall detection threshold too sensitive
- Fixed animation transitions: no `reset()` on already-playing anims, longer crossfade
- All fixes on `fresh-main` branch

### 2026-03-31 — Hermes
- 18 improvements committed to `main` as Crate Engine v2.0:
  - localStorage try/catch protection (30+ writes)
  - XSS sanitization via `esc()` helper
  - FPS counter HUD
  - WebGL context lost/restore handler
  - Error boundary with crash recovery UI
  - Service worker for offline support
  - Self-smarter loop (OpenRouter + Gemini)
  - Cache control headers
  - Dead code removal
  - setInterval/cancelAnimationFrame leak cleanup
  - Event listener tracking + cleanup
  - Cache busting on all .mjs imports

---

## Known Issues
1. **NPC size** — Characters appear as tiny shadows at default camera distance (fix pending on `fresh-main`)
2. **Mixamo soldier** — Rotation code is broken (contradicts itself). Use Quaternius models instead.
3. **Cloudflare caching** — `wrangler pages deploy` skips files with matching hashes. Cache bust with `?v=XXX` on imports.
4. **Engine bridge** — `runtime/engine-bridge.mjs` returns 404 (MIME error in console, non-critical)

---

## How To Not Break Things
1. **Always bump version** on character.mjs (`?v=XXX` in engine.mjs import line)
2. **Always bump version** on engine.mjs (`?v=XXX` in play.html script tag)
3. **Test in browser** before telling Kohari it works — actually verify visually
4. **Read this file** before starting any work
5. **Update this file** when you're done — the other agent depends on it
6. **Don't overwrite the other agent's work** — check git log first
7. **Deploy from `main` only** — merge your branch first

---

## Deploy Knowledge (Complete Guide)

### Current Setup: Direct Upload via Wrangler
```bash
cd /Users/jamainemartin/Desktop/crate-engine
npm run build
npx wrangler pages deploy dist/ --project-name=crateship-games --commit-dirty=true --branch=main
```
**Note:** The repo now builds from the root app and deploys `dist/`. The legacy `crate-engine/web/` mirror is compatibility output, not the source of truth.

### Fix: Connect GitHub → Cloudflare Pages (NOT DONE YET)
This must be done in the **Cloudflare Dashboard** — wrangler CLI cannot do this.

1. Login: **dash.cloudflare.com** (account: `Koikes2021@gmail.com`)
2. Navigate: **Pages → crateship-games → Settings → Builds & Deployments**
3. Click **"Connect to Git"**
4. Select repo: `jamaine1984/crate-engine`
5. Branch: `main`
6. Configuration:
   - Framework preset: **None**
   - Build command: **`npm run build`**
   - Build output directory: **`dist`**
   - Root directory: **`/`** (the repo root, NOT `crate-engine/`)
7. Save → triggers first build

Once connected, every `git push origin main` auto-deploys. No more wrangler, no more cache hash fights.

### Cloudflare Account Details
- **Account ID:** `6573d98c25150fd7b4602e56a0926767`
- **Pages project:** `crateship-games`
- **Custom domain:** `crateshipgames.com`
- **Production branch:** `main`
- **Preview branches:** Any non-main branch gets a preview URL like `https://<hash>.crateship-games.pages.dev`

### Wrangler Auth
Wrangler is already authenticated via `npx wrangler whoami`. If auth expires:
```bash
npx wrangler login
```

### Cache Busting
Vite now fingerprints output assets in `dist/assets/`, so manual query-string cache busting should not be added to the root runtime.

### Deploy Verification Checklist
After any deploy, confirm:
```bash
# 1. Check deploy URL serves new code
curl -s "https://<hash>.crateship-games.pages.dev/play.html" | grep "/assets/"

# 2. Check engine loads
curl -s "https://<hash>.crateship-games.pages.dev/play.html" | head -20

# 3. Open in browser and check console for errors
# Look for: MIME type errors, 404s, module load failures
```

### Nuclear Option: If Deploy Is Completely Stuck
```bash
# Delete and recreate (WARNING: removes custom domain mapping temporarily)
npx wrangler pages project delete crateship-games
npx wrangler pages project create crateship-games --production-branch=main
npx wrangler pages deploy dist/ --project-name=crateship-games --commit-dirty=true --branch=main
# Then re-add custom domain in Cloudflare dashboard
```

### Git Workflow for Deploy
```bash
# 1. Make changes
# 2. Run checks and build
npm run check
npm run build
# 3. Commit and push
git add .
git commit -m "description of changes"
git push origin main
# 4. If GitHub→Cloudflare connected: auto-deploys
# 5. If not connected: manual deploy
npx wrangler pages deploy dist/ --project-name=crateship-games --commit-dirty=true --branch=main
# 6. Verify (see checklist above)
```
