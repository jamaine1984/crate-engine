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
  cd ~/.openclaw/workspace/crate-engine
  npx wrangler pages deploy web/ --project-name=crateship-games --commit-dirty=true --branch=main
  ```
- **Build output:** `web/` (static files, no build step)
- **Models:** `web/models/` (~2GB, NOT tracked in git — already on Cloudflare CDN)

### Code Structure
```
web/
├── play.html          # Main engine page
├── index.html         # Landing page
├── engine.mjs         # Core engine (~28K lines) — commands, scene, rendering
├── character.mjs      # Player + NPC controllers, animations, weapons, combat
├── collision.mjs      # Octree physics, capsule collider
├── voice-commands.mjs # Voice/text command mapping
├── ai-agent.mjs       # City builder AI agent
├── sound.mjs          # Audio system
├── mobile.mjs         # Touch controls
├── multiplayer-client.mjs  # WebSocket multiplayer
├── auth.mjs           # Stripe + auth
├── self-smarter.mjs   # Self-improvement loop (OpenRouter)
├── savesystem.mjs     # Save/load system
├── interpreter.mjs    # Command interpreter v2
├── _headers           # Cloudflare cache/MIME headers
└── models/            # 3000+ GLB models (NOT in git)
```

### Key Technical Facts
- **Three.js:** 0.170.0 via CDN importmap in play.html
- **character.mjs version:** Bump `?v=XXX` in engine.mjs import when editing character.mjs — CDN caches aggressively
- **engine.mjs version:** Bump `?v=XXX` in play.html `<script>` tag when editing engine.mjs
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
cd ~/.openclaw/workspace/crate-engine
npx wrangler pages deploy web/ --project-name=crateship-games --commit-dirty=true --branch=main
```
**Problem:** Cloudflare's content-addressed asset store skips files with matching chunk hashes. If the file content hasn't changed byte-for-byte, it says "0 files uploaded (already uploaded)" and the deploy appears to succeed but serves stale code. This is why cache-busting `?v=XXX` on imports is critical.

### Fix: Connect GitHub → Cloudflare Pages (NOT DONE YET)
This must be done in the **Cloudflare Dashboard** — wrangler CLI cannot do this.

1. Login: **dash.cloudflare.com** (account: `Koikes2021@gmail.com`)
2. Navigate: **Pages → crateship-games → Settings → Builds & Deployments**
3. Click **"Connect to Git"**
4. Select repo: `jamaine1984/crate-engine`
5. Branch: `main`
6. Configuration:
   - Framework preset: **None**
   - Build command: **(leave empty)** — static site, no build step
   - Build output directory: **`web/`**
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

### Cache Busting (CRITICAL)
Cloudflare CDN + browser caching is aggressive. When editing files:

1. **character.mjs** — bump `?v=XXX` in engine.mjs:
   ```js
   import { CharacterController, ... } from './character.mjs?v=134'
   //                                                        ^^^^^ bump this
   ```

2. **engine.mjs** — bump `?v=XXX` in play.html:
   ```html
   <script type="module" src="engine.mjs?v=900DEPLOY"></script>
   <!--                                  ^^^^^^^^^^^ bump this -->
   ```

3. **Other .mjs files** — check their import lines in engine.mjs, bump similarly

4. **After deploy** — always verify with curl:
   ```bash
   curl -s "https://crateshipgames.com/engine.mjs?v=NEW" | head -3
   ```

### Deploy Verification Checklist
After any deploy, confirm:
```bash
# 1. Check deploy URL serves new code
curl -s "https://<hash>.crateship-games.pages.dev/play" | grep "engine.mjs"

# 2. Check engine loads
curl -s "https://<hash>.crateship-games.pages.dev/engine.mjs" | head -3

# 3. Check character module loads  
curl -s "https://<hash>.crateship-games.pages.dev/character.mjs" | head -3

# 4. Open in browser and check console for errors
# Look for: MIME type errors, 404s, module load failures
```

### Nuclear Option: If Deploy Is Completely Stuck
```bash
# Delete and recreate (WARNING: removes custom domain mapping temporarily)
npx wrangler pages project delete crateship-games
npx wrangler pages project create crateship-games --production-branch=main
npx wrangler pages deploy web/ --project-name=crateship-games --commit-dirty=true --branch=main
# Then re-add custom domain in Cloudflare dashboard
```

### Git Workflow for Deploy
```bash
# 1. Make changes
# 2. Bump version strings (see Cache Busting above)
# 3. Test locally or via preview deploy
# 4. Commit and push
git add web/
git commit -m "description of changes"
git push origin main
# 5. If GitHub→Cloudflare connected: auto-deploys
# 6. If not connected: manual deploy
npx wrangler pages deploy web/ --project-name=crateship-games --commit-dirty=true --branch=main
# 7. Verify (see checklist above)
```
