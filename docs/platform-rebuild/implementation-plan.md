# Crate Ship Games rebuild

## Baseline and boundaries

Audited on 2026-09-27 from `jamaine1984/crate-engine` commit `e84d4412b40131c923210a47bc1ba029aa02761c`. Work is isolated on `codex/platform-rebuild`. The existing checkout in Downloads and production have not been modified.

The application is a Vite multipage browser engine with vanilla modules. Pages Functions serve game publishing from KV and model assets from R2; D1 currently records moderation and cleanup audits. The account API is a separately deployed `crate-engine-api` Worker, bound to CRATE_USERS, CRATE_MODELS and CRATE_GAMES KV. Its source is absent from this repository. Cloudflare's live preview and a public DNS request both show that `api.crateshipgames.com` does not resolve. Existing credentials and users must not be silently migrated or replaced.

The root engine is canonical. Preserve its `.crate` v3 project format, character systems, gameplay components, asset placement checks and external asset host. The legacy nested copy has drift and is not a build source. The asset host remains necessary: models are not present in Git.

Baseline validation: `npm run check` passed (60 files); `npm run build` passed, with existing 500 kB chunk warnings. On Windows, the pinned HeadTTS dependency's Unix-only install command breaks ordinary `npm ci`; `npm ci --ignore-scripts` succeeded and the existing build ran. Do not run the existing production smoke script as a read-only test: it contains live write paths.

## Phase order

1. **Audit and contain unsafe legacy paths.** Enforce identity and ownership on legacy writes, fixed model MIME, least-privilege mutation checks, prevent cross-game asset deletion and prevent automatic execution of downloaded project scripts on the main origin.
2. **Add an isolated platform data boundary.** New PLATFORM_DB and private PLATFORM_UPLOADS bindings; separate local/staging/production configuration. Never apply platform migrations to CRATE_AUDIT or CRATE_USERS. Establish real sessions, roles, account records and feature flags before exposing new workflows.
3. **Build the supplied design on real services.** Preserve the dark green/orange three-column layout, responsive navigation, player-first hierarchy and Creator Hub. Data comes from the platform API. No fabricated ratings, game inventory, account counts, prices, purchases or earnings. The current public KV results include old production smoke fixtures; do not automatically treat them as reviewed retail games.
4. **Complete persistent player and creator workflows.** Profiles, favorites, library, history, progress, projects, waitlist, notifications, ownership checks, versioned uploads and human moderation. Quarantine has no public route. A missing scanner blocks approval and publication.
5. **Implement isolated player and SDK.** Strict game/session binding, message source/origin validation and constrained operations. Separate content origin, no account tokens inside games, no arbitrary reward grants.
6. **Implement commerce and owner operations.** Versioned agreements; integer accounting; immutable revenue/wallet events; independent creator obligations; OWNER-only sensitive operations with recent MFA; audit trails; truthful zero/unavailable states. Payments, payout and ad providers remain disabled.
7. **Integrate engine persistence and exports.** Keep editing and project loading compatible; cloud save belongs to authenticated users. Standalone exports must identify external assets honestly until packaged and licensed assets are available.
8. **Verify locally and in staging.** Negative authorization tests, persistence, hostile ZIPs, accounting replay/version tests, responsive browser QA and engine regression. Complete migration/recovery and cost documentation. Production deployment only from a reviewed, tested artifact with the correct assets and separately configured services.

## Required external configuration and release evidence

- Dedicated staging and production platform database/bucket; verified account owner bootstrap (never assign OWNER from a client-supplied email or role).
- Transactional email, Google OAuth credentials/redirects, owner MFA and security review of authentication. No fake delivery or Google success.
- Trusted malware scanning service and isolated game content origin. No unsupported archive is promoted when a scanner is absent.
- Approved game inventory, artwork rights and monetization agreements. An upload alone grants no revenue rights.
- Backups and recovery drill before moving real records. Existing KV identities and content need an explicit migration plan and ownership verification.
- Stripe only after phases 1–34 meet the brief, followed by test mode and explicit owner live-payment approval.
- Google ad integration only after the stable core, supported-product eligibility/consent checks, test inventory and explicit owner ad go-live approval.

See `backend-audit.md`, `engine-audit.md` and `requirements-map.md` for evidence and the complete acceptance criteria. A successful local build is not production readiness.
