> **October 3, 2026 current status:** Read `STRIPE-SETUP-2026-10-03.md`. Sandbox Stripe checkout, seller account/link generation, webhook verification and a real sandbox refund are tested; real payments await Stripe identity verification, final policies/tax handling and live connection. Cloudflare rejected publishing deployment on its Free plan; activate Workers Paid to finish uploads/publication. H5 application is submitted, with AdSense and H5 approvals pending. Operator: Jamaine Martin, Washington, United States. The owner wants all completed services live and ready for real games. The newer ad proposal is **70% creator / 30% platform**, superseding the older ad split below if adopted.

# Crate Ship Games: Checklist

The one running list of what's done and what's left. Newest decisions first. Last updated Sept 28, 2026 (night). Current handoff: `SESSION HANDOFF 2026-09-28 (night).md`.

## Owner decisions on record
- **No sub-agents.** Do the work directly; agent fleets burn usage too fast.
- **The Starter Library is three of the owner's own characters** (Human, Goat Kid, Blue Robot). The old 4,000+ model catalog, the 100 picks and their asset host were deleted on purpose, with no backup. Customers bring their own models or build them in Blender.
- Everyone who signs up is a **player**. Any verified player becomes a **creator** in one click. The owner approves every game before it goes live.
- The owner's own games are **approved automatically**.
- Game pages get **3 screenshots**, no video (to save storage).
- Games are hosted on a free Cloudflare address, `crateship-game-content.koikes2021.workers.dev`. No second domain.
- **Revenue split for creator games** (build it when monetization starts):
  - Ads: Crate Ship 80%, creator 20%.
  - Game sales: creator 80%, Crate Ship 20%. Crate Ship's 20% covers the Stripe fee.
  - The owner's own games are 100% Crate Ship.
- The spare account `koikes2021@gmail.com` stays as the owner's test player for API and MCP tests.

## Needs the owner (can't be done without you)
- [ ] **Try Build with AI on the live site** with your real API key, and **try the AI connector** (`https://crateshipgames.com/mcp` in Claude → Settings → Connectors, or ChatGPT Developer mode; then /play → **AI apps** → both switches on). Neither has been tried with a real account on the live site.
- [ ] **Confirm the Human character's likeness** may be shown publicly (it looks like a real person), and which **Meshy licence** applies to the three characters.
- [ ] **Phone testing:** play games on a real phone and confirm that downloads save.
- [ ] **Legal pages:** Terms, Privacy and the creator agreement are prelaunch drafts. Get them reviewed before launch.

## Check next session
- [ ] **First automatic cleanup run** (due 03:17 UTC on Sept 29): look for a `platform.maintenance.run` line in `npx wrangler tail crateship-engine-maintenance` or the dashboard logs.
- [ ] The old R2 buckets `crate-engine-assets` and `crate-engine-animations` (March, old engine) were not touched and their contents were never checked. Ask before deleting.

## Parked until the owner says go
- [ ] **Turn on creator uploads.** Needs the Cloudflare **Workers Paid plan ($5/month)**. Steps are in `SESSION HANDOFF 2026-09-28 (earlier, history).md`.
- [ ] **Agreements for creator games**, then **monetization:** Stripe checkout, ads, creator payouts.
- [ ] **Downloadable (Windows/Mac/Linux) games:** only browser games are accepted for now.

## Ideas for later
- [ ] Real animations for the goat and robot (they currently borrow the human's walk and run) via Blender.
- [ ] More AI tools: a chosen camera position for `screenshot`, a custom start point for `play_test`, importing an uploaded GLB.
- [ ] A 1-unit-wide box player can stick on a ramp tip that sits exactly at ground level (a real capsule player does not).

## Done
- [x] **Owner Portal numbers** (Sept 28, migration 0012): real visitors, page views, editor opens, sign-ups and plays, today / 7 days / all time plus a 14-day table. Cookie-free, no stored IP. Verified on the live site.
- [x] **Daily cleanup job** deployed (Sept 28): `crateship-engine-maintenance`, 03:17 UTC daily, every step capped per run. Unit-tested; first live run not yet seen.
- [x] **Drawn shapes collide along their outline by default** (Sept 28): ramps and hills work; Box still overrides; inspector has Automatic / Box / Follow the outline.
- [x] **Starter Library cut to three characters; old catalog and asset host deleted** (Sept 28).
- [x] **AI apps can take screenshots, play-test and save** (Sept 28, `37fee49`): `screenshot`, `play_test`, `save_project`. Verified end to end.
- [x] **Black sky at High render quality fixed** (Sept 28, `53719f3`).
- [x] **Build with AI box and API-key building** live, `ENGINE_AI_ENABLED` on (Sept 28, `5d315af`, migration 0011).
- [x] **AI app connections live** (Sept 28, `a61b7c9`, `b2f2c0e`, migration 0010): Claude, ChatGPT, Claude Code, Cursor or any MCP app on their own subscription or API key, at `https://crateshipgames.com/mcp`.
- [x] **Live game updates** (Sept 28, `92f85f4`, migration 0009).
- [x] Creator sign-up is instant, with a pause switch (Sept 28)
- [x] Step-by-step upload guide and upload checklist (Sept 28)
- [x] Owner portal simplified: Review Games, Player Reports, Creators, Players, On/Off Switches, Activity Log, Security, and a how-to guide (Sept 28)
- [x] Creators are notified of review decisions; one-click Suspend / Reactivate (Sept 28)
- [x] 3 screenshots per game, shrunk automatically in the browser (Sept 28)
- [x] Free security check for uploaded games, written and tested; game hosting Worker deployed (Sept 28)
- [x] Owner games approved automatically, with automatic Crate Ship-owned agreement (Sept 28)
- [x] Player Reports queue: handle, dismiss, or take a game off the site (Sept 28)
- [x] Side-view camera follows the player up to high platforms (Sept 28)
- [x] AI tools can read and edit an object's vector art (`get_object`) (Sept 28)
- [x] Sign-in fixed, authenticator QR code, owner account set up (Sept 27–28)
- [x] Engine gameplay rules: goal, hazard, checkpoint, moving platform, lives, win/lose screens (Sept 27)
