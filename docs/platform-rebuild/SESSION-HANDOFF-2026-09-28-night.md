# CrateShip Games Arcade: Session Handoff (Sept 28, 2026, night)

Read this first in the next session, then `CHECKLIST.md` (the running list). Older notes are in the other `SESSION HANDOFF …(history).md` files. The owner wants the work done directly, with **no sub-agents** (they burn usage too fast).

## Where everything lives
- **Working checkout:** `C:\Users\koike\Documents\Codex\2026-09-27\and-look-this-is-what-i\outputs\crate-engine`, branch `codex/platform-rebuild`. `main` has never been touched.
- **GitHub:** github.com/jamaine1984/crate-engine. The **deployed app is commit `7d97984`**; commits after it only change notes and docs. Everything is pushed.
- **Live site:** crateshipgames.com (Cloudflare Pages `crateship-games`, deployment `6199bfe3`). Wrangler is logged in as koikes2021@gmail.com.
- **Deploy steps:**
  1. `npm run test:platform`. Expect **589 tests, 588 pass, 0 fail, 1 skip**.
  2. `npm run build`. This wipes `dist`, so no test files get shipped.
  3. New D1 migrations first: `npx wrangler d1 migrations apply crateship-platform-v1 --remote`. **Migrations 0001–0012 are applied.**
  4. `npx wrangler pages deploy dist --project-name crateship-games --branch=main --commit-hash=<sha> --commit-dirty=false`. It often fails once with "fetch failed"; just retry.
- **Cleanup Worker** `crateship-engine-maintenance` (version `6db1d333`): `npx wrangler deploy --config worker/engine-maintenance/wrangler.toml`.
- Never use `fetch(..., {redirect:'error'})` in server code. Cloudflare Workers throws on it.

## What shipped this session (all live)

### 1. Black sky at High quality: FIXED
- **Cause:** the depth buffer has too little precision far from the camera, so the ambient-occlusion pass turned a 450 m sky dome solid black.
- **Fix:** AO fades out between 30 and 90 m (`fadeAoWithDistance` in `engine/runtime/scene.mjs`). Exported games use the same code.
- **Checked:** reproduced with the real sky-dome model (black at High, blue at Balanced), then confirmed blue at High after the fix. A test fails if a three.js upgrade renames the shader text the fix patches.

### 2. AI apps got eyes and hands: DONE
New tools for Claude, ChatGPT, Cursor and any MCP app:
- **`screenshot`**: a JPEG of the editor view or the game camera (grid and gizmos hidden), returned as a real MCP image block.
- **`play_test`**: plays the level with scripted controls (`steps: [{move, seconds, jump?}]`, up to 12 s), then returns to Edit mode. It reports start/end position, lowest/highest point, score, lives, won/lost, events and a picture of the last frame. It never changes the project.
  - Physics is stepped here at a fixed 60 Hz, faster than real time, so it does **not** depend on frame rate or on the tab being in front. (The first version used the frame loop and timed out in a throttled tab; this was fixed and re-verified at 3 fps.)
- **`save_project`**: saves on this device, or also to the account (`where: "account"`). Needs "Allow changes".
- Code: `engine/runtime/scene.mjs` (`capture`), `engine/runtime/editor.mjs` (`screenshot`, `playTest`), `engine/editor/mcp-client.mjs`, `integrations/editor/contracts.mjs`, `platform/server/ai-connect.mjs`.
- **Checked end to end** with the scripted MCP client against the real editor: screenshots, win/lose/fall/jump play tests, save to device and to account, the no-player error, and that the editor is back in Edit mode afterwards. Also unit tests.

### 3. Starter Library cut to three characters; old catalog DELETED
Owner decision, with **no backup**:
- The library is now the owner's own **Human**, **Goat Kid** and **Blue Robot** (`starter-library/`, served from the site itself). All three are rigged with **Walking** and **Running** clips.
  - Human: Meshy "Merged Animations (2)", textures shrunk to 1024 px (1.2 MB).
  - Goat Kid and Blue Robot: from `Desktop\desert+soldier+3d+model (1)\output\`. They had a rig but **no clips**, so the human's clips were retargeted onto their Mixamo-named skeletons. Verified visually in Play.
  - `scripts/retarget-animations.mjs` and `scripts/shrink-textures.mjs` do this for future characters.
- **Deleted:** the Cloudflare Pages project `crateship-games-assets` (4,182 files), the 1.6 GB local mirror `Documents\Codex\2026-05-16\…\models-live-cache`, the Desktop copies (`asset-catalog-2026-09-28`, `asset-curation`, inventory files) and 44 catalog list files in old Downloads/Desktop folders.
- An **empty** project with the same name was re-created so nobody else can claim `crateship-games-assets.pages.dev`. Do not deploy anything to it.
- The editor's "Full catalog" tab is gone. Projects no longer accept the old host's URLs. `add_library_model` and `list_library_models` know only the three.
- **Still there:** git history on GitHub still holds the old catalog file lists and 100 thumbnails (not the models). Rewriting history was not asked for. The R2 buckets `crate-engine-assets` and `crate-engine-animations` (old engine, March) were **not touched**; their contents were never checked, so ask before deleting them. The old root-level legacy modules (`model-registry.mjs`, `asset-gallery.mjs`, …) are dead code and still mention the removed files.

### 4. Owner Portal numbers: DONE (migration 0012)
- The overview now shows real **visitors, page views, editor opens, sign-ups and game plays**: today, last 7 days, all time, plus a 14-day table (UTC days).
- **Privacy-friendly counting:** no cookies, no stored IP address or browser string (a one-way hash that changes every day), Do Not Track and GPC respected, bots and the owner portal ignored, rate limited. A returning person counts again on another day.
- Code: `platform/server/analytics.mjs`, `platform/client/visit.mjs`, `platform/client/activity-panel.mjs`.
- **Checked** on the live site: a real visit was recorded in the production database.

### 5. Daily cleanup job: DEPLOYED
- `crateship-engine-maintenance` runs **once a day at 03:17 UTC** (`platform/server/maintenance.mjs`).
- It removes queued private model files, rolls finished visit days into `platform_daily_stats` and deletes their hashes, and clears expired sessions, rate-limit rows, OAuth codes and tokens, and AI-connection leftovers.
- **Every step is capped per run** (100 model files, 2,000 rows per table) and independent: if one fails, the others still run and the failure is in the log. A used refresh token is kept until it would have expired, so reuse is still detected.
- **The first automatic run has not been seen yet.** It is due at 03:17 UTC (about 20:17 Pacific). Check it with `npx wrangler tail crateship-engine-maintenance` or the Cloudflare dashboard logs; look for a `platform.maintenance.run` line. Wrangler refuses `dev --remote` against the production bucket, so it could only be tested with unit tests (5 of them).

### 6. Engine limits: collision (DONE), the rest noted
- **Static drawn shapes (customMesh) now collide along their outline by default**, so ramps, hills and curved platforms work. An explicit **Box** still overrides. Players, moving platforms, dynamic bodies and imported models stay boxes.
- **Proof:** the same ramp with a box stopped the player at an invisible wall (x = −3.3); with the outline the player walked up and won.
- The inspector now offers Automatic / Box / Follow the outline. AI apps are told about it.
- **Known corner case:** a 1-unit-wide box player can stick on a ramp tip that sits exactly at ground level (a real-sized capsule player does not).
- Licences on imported models are still the customer's job; the old catalog's licences were never checked and are now moot.

## START HERE next session: remaining list, in order
1. **Check the first cleanup run** (see item 5 above).
2. **Owner: try Build with AI and the AI connector on the live site** (see below), then report what fails.
3. **Real animations for the goat and robot** if you want more than borrowed walk/run: build or animate them in Blender (the Blender connection exists).
4. **Confirm the Human likeness** may be shown publicly (see "Needs the owner").
5. **More AI tool ideas:** per-object screenshot framing (choose a camera position for `screenshot`), `play_test` with a custom start point, a tool to import a GLB the user uploaded.
6. **Legal pages, downloadable games, monetization**: parked (below).

## Needs the owner (Claude can't do these)
- **Try Build with AI on the live site** with your real key, and **try the connector** (`https://crateshipgames.com/mcp` in Claude → Settings → Connectors, or ChatGPT Developer mode). Neither has been tried with a real account on the live site.
- **The Human character looks like a real person** (orange shirt, dreadlocks). It is in the public Starter Library. Confirm you are happy to show that likeness, or say so and it is swapped.
- **Meshy licence:** the three characters were made with Meshy. Free-plan Meshy output is CC-BY 4.0, paid plans allow commercial use. Confirm which applies.
- Phone testing; a live Owner Portal click-through with your login and authenticator (locally the owner session lasts about 2 hours); the spare account `koikes2021@gmail.com` is kept for API/MCP tests on purpose.
- Terms, Privacy and the creator agreement need a legal review before launch.

## Parked by the owner (do not start without their go-ahead)
- **Creator uploads:** need Workers **Paid** ($5/mo). See `SESSION HANDOFF 2026-09-28 (earlier, history).md` under "After the owner upgrades".
- **Creator agreements and monetization:** ads 80% Crate Ship / 20% creator; sales 80% creator / 20% Crate Ship; the owner's games are platform-owned.
- Downloadable (Windows/Mac/Linux) games.

## Useful tricks
- **Local server:** `PLATFORM_PORT=4176 node platform/dev/server.mjs --built` (run `npm run build` first).
- **Local logins without Firebase:** `Desktop\CrateShip Games Arcade\verification-and-project-backups\ai-connect-qa\seed.mjs` (copy it to the repo root first; it imports `./platform/server/identity.mjs`) creates `qa-owner` and `qa-dev`. Tokens are `('qatoken'+name+'x'.repeat(43)).slice(0,43)`; set cookie `crateship_session_local`. **Owner sessions expire after about 2 hours**: re-run the seed if `/me` returns `user:null`. Delete the copy afterwards.
- **Scripted MCP client:** `…\ai-connect-qa\mcpclient.mjs` (`start`, `code`, `call`). A helper that also saves returned images is `tool.mjs` (session scratchpad, easy to recreate: it calls `tools/call` and writes `image` blocks to files).
- **Testing tabs:** the in-app browser throttles `requestAnimationFrame` to about 3 fps when it is not being watched. `play_test` no longer cares; anything that relies on the frame loop does.
- **Editing files in this repo:** many files have very long single lines and CRLF endings. The Edit tool keeps CRLF for single-line edits. For multi-line changes write a small Node patch script (Bash heredocs mangle regexes and quotes).
- **Read production data:** `npx wrangler d1 execute crateship-platform-v1 --remote --command "SELECT ..."`.
