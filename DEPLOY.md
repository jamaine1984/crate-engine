# Deploying Crate Ship Games

Live site: https://crateshipgames.com (Cloudflare Pages project `crateship-games`).
Work happens on branch `codex/platform-rebuild`; `main` is the old version and is left alone.
Wrangler is logged in as the Cloudflare account that owns the project.

## Every deploy

```powershell
npm run test:platform          # expect 0 failures (1 skip: real Blender)
npm run build
npx wrangler d1 migrations apply crateship-platform-v1 --remote   # only if platform/migrations changed; run BEFORE deploying code that needs it
npx wrangler pages deploy dist --project-name crateship-games --branch=main --commit-hash=<git sha> --commit-dirty=false
```

- Wrangler 4.20 often fails with "fetch failed / other side closed". Retry the same command (up to about 4 times).
- The live site can take around 20 seconds to update after "Deployment complete".
- Never use `fetch(..., {redirect: 'error'})` in server code. Cloudflare Workers throws on it, and it once broke every sign-in.

## Separate Workers

| Worker | Config | Purpose | Status |
| --- | --- | --- | --- |
| `crateship-game-content` | `worker/game-content/wrangler.toml` | Serves published games from `crateship-game-content.koikes2021.workers.dev`, walled off from player accounts | Deployed |
| `crateship-game-scanner` | `worker/game-scanner/wrangler.toml` | Security check for uploaded game ZIPs (service binding `GAME_SCANNER`) | Needs the Workers Paid plan |
| `crateship-game-publisher` | `worker/game-publisher/wrangler.toml` | Copies an approved build into `crateship-published-games` (service binding `GAME_PUBLISHER`) | Needs the Workers Paid plan |
| `crateship-engine-maintenance` | `worker/engine-maintenance/wrangler.toml` | Hourly cleanup of private engine models | See its config |

Deploy one with `npx wrangler deploy --config <config path>`.

## Data and storage

- D1 database `crateship-platform-v1` (binding `PLATFORM_DB`). To read it: `npx wrangler d1 execute crateship-platform-v1 --remote --command "SELECT ..."`.
- R2 bucket `crateship-games-user-assets` holds uploads, screenshots and private models. `crateship-published-games` holds released game files.
- There is no separate model host any more. The old 4,000+ model catalog and its Pages project (`crateship-games-assets`) were deleted on purpose (owner decision, 2026-09-28). The three Starter Library characters ship inside `dist` from `starter-library/`.

## Local preview

`npm run build`, then `node platform/dev/server.mjs --built` (port 4173; set `PLATFORM_PORT` to change it). Local data lives in `.platform-local/`, never in production.
