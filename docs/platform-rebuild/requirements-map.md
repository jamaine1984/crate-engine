# Crate Ship Games requirement and phase map

Sources: full master instruction sections 1–146 in attachment `dd9d1c69-b229-4f69-b46a-cbffce1545fe/Pasted text.txt`; Google advertising addendum sections 147–164 in attachment `85b6ac7c-0bcf-4d99-937d-957387528684/Pasted text.txt`. The user subsequently supplied `C:\Users\koike\Downloads\ChatGPT Image Sep 27, 2026, 02_57_40 PM.png` as the visual reference. This is a requirements summary, not an assertion that any feature is implemented or verified.

## Execution contract and hard gates

- Start with a complete audit of the actual repository and infrastructure. Record frontend/backend, Pages/Workers/R2/D1/KV/Firebase, auth, data, routes/APIs, engine/project/export/upload formats, user/admin systems, deployments/domain/build/environment variables/secrets, defects, logs, warnings, duplicate/dead code/dependencies, security and performance. Preserve useful code and working engine behavior; refactor incrementally and keep each major phase deployable.
- Build real production systems. Completion requires working authentication, authorization, persistence/database logic, security, error handling, and tests. A finished looking interface is insufficient. No fake accounts, rewards, purchases, financial events, security scan results, metrics, billing values, or engine links that lead only to marketing.
- **Stripe integration is deferred:** `PAYMENTS_ENABLED=false` and `STRIPE_ENABLED=false` throughout the initial build. Complete and verify phases 1–34 before connecting the owner's existing Stripe account. Then use test mode, verified webhooks, purchase/license and refund/chargeback tests. The owner must explicitly approve live payments after a successful readiness review before enabling payments. Premium listings may exist with `COMING SOON` or `PURCHASES NOT YET ENABLED` actions.
- **Google advertising integration is also deferred:** finish and verify the website, auth/accounts, rewards, player, developer portal/uploads, isolation, commerce/agreements, owner portal, engine, security, costs and documentation first. Keep `GOOGLE_ADS_ENABLED=false`, `H5_GAME_ADS_ENABLED=false`, `REWARDED_ADS_ENABLED=false`, `INTERSTITIAL_ADS_ENABLED=false` until each product is configured, eligible and approved. Production ads require a separate explicit owner go-live approval.
- Uploads remain private through quarantine, checksums, archive/structure/security validation, metadata inspection, developer review, submission and human moderation. Approve and promote before publishing. Developers/partners cannot self-approve submissions or payouts.
- Staging must be separated from production for secrets, data, uploads, payments, ads, flags, deployment and owner sessions as applicable. No dangerous testing against production. Fake/simulated money events are permitted only for internal tests, never as production financial records.
- Use the existing cost-conscious cloud stack where appropriate. Prefer static/serverless infrastructure; evaluate preserving useful Firebase auth. No unjustified always-on servers, GPU Pixel Streaming, or silent expensive dependencies.

## Owner decisions and external prerequisites

Escalate decisions materially affecting money, legal obligations, data deletion, security ownership, pricing, revenue percentages, production credentials or irreversible architecture. Resolve ordinary engineering choices using security, low cost, maintainability, replaceability, scalability and low vendor lock-in. Required owner/external inputs can be collected at the relevant gate while independent implementation continues:

- Identity and secure provisioning of the owner account; partner identity receives only `PARTNER_DEVELOPER`. Any changes to owner/finance authority require recent authentication/MFA. Never shared accounts or credentials.
- Actual game prices, revenue classifications/percentages/effective dates, payout schedules/minimums and legal agreement documents. The 70/30, 25/75 and 40/60 values are illustrations, not approved commercial terms. Platform-owned default is explicitly 100% platform/0% creator unless the owner intentionally configures otherwise.
- Account/domain/provider ownership, production credentials, Google product eligibility/activation/allowlisting, required publisher IDs, approved ad placements, consent/legal decisions, payment and ad go-live approvals.
- Material cost commitments or irreversible migrations/deletions. Suggested upload limits are configurable initial defaults, not a reason to scatter fixed constants.

## Ordered implementation phases

| Phase | Required result |
| --- | --- |
| 1 | Actual repository and infrastructure audit |
| 2 | Security and secrets audit |
| 3 | Stabilize the build |
| 4 | Design system from approved visual reference |
| 5 | Real authentication |
| 6 | Profiles and persistent user data |
| 7 | Player-first homepage |
| 8 | Database-backed game catalog |
| 9 | Isolated game player |
| 10 | R2/storage architecture |
| 11 | Developer portal |
| 12 | Upload and quarantine pipeline |
| 13 | Game validation/security |
| 14 | Developer documentation |
| 15 | Controlled Crate Ship SDK |
| 16 | Rewards/wallet with idempotent ledger |
| 17 | Central advertising architecture; provider integration remains gated |
| 18 | Unified Commerce & Revenue system |
| 19 | Versioned monetization agreements |
| 20 | Per-game partner custom agreement capability |
| 21 | Secure owner portal |
| 22 | Audit/security center |
| 23 | Repair and preserve real game engine |
| 24 | Persistent engine projects |
| 25 | Portable engine exports |
| 26 | Bring-your-own AI provider/model system |
| 27 | Premium marketplace with payments disabled |
| 28 | Server-enforced flags and emergency controls |
| 29 | Cost dashboard/alerts |
| 30 | Backup/recovery strategy and procedure |
| 31 | Accessibility |
| 32 | Performance |
| 33 | Staging verification |
| 34 | Production deployment verification |
| 35 | Connect existing Stripe only after phases 1–34 work |
| 36 | Stripe test mode |
| 37 | Webhook validation |
| 38 | Purchase/license tests |
| 39 | Refund/chargeback tests |
| 40 | Explicit owner approval of live payments |
| 41 | Enable payments only after successful production readiness review |

Google integration follows the stable-core gate separately and must complete sections 147–164 before its own owner go-live. Security, gating and authorization are cross-cutting dependencies even when their dashboard appears later in the listed sequence.

## Product, design and real content

- One ecosystem: Play, Buy, Build, Export, Publish, Earn. Players come first; engine remains a major product and creators use a real shared workflow.
- Use the supplied dark forest-green/orange three-column gaming-hub reference. Suggested backgrounds `#07110D`, `#0A1711`, `#101B15`, `#111511`; panels `#102019`, `#14261D`, `#172A20`; orange `#FF6A1A`, `#FF7A21`; amber `#E9A53A`, `#F3B34C`; tan `#D8BA83`; small green accents `#35D07F`, `#1FAE68`; text `#F5F1E8`, `#C8C3B8`, `#8F9C92`. Rounded panels, subtle shadows/warm glows/borders, readable type, premium art, restrained motion and accessible contrast. No white redesign. Reference sample titles/prices/user counts must not become fabricated real platform data.
- Top: logo, `Search games, creators, or collections...`, Games/Community/Support, notifications; logged-out login/signup; logged-in avatar, username, rewards, notifications, account menu. Sidebar: Home, Play Games with FREE badge, Buy Games, Game Engine, Creators, Marketplace, Coming Soon, Favorites; watch-ads/earn-rewards area near bottom, truthful to current flags.
- Exact homepage order: cinematic Featured Game → Featured Games → Play Free With Ads → Buy Premium Games → Creator Hub → Build. Share. Earn. Coming Soon. → monetization information → tools → benefits → roadmap → submission requirements → developer FAQ → documentation → creator waitlist.
- Hero: actual artwork/name/description/genre, Play Now/View Details; database-controlled featured content with future rotation. Cards: real covers/title/genre/free-or-premium/rating/favorite/actions; `FREE + ADS` labels; premium artwork/developer/price/rating/wishlist/view with gated purchases. No invented ratings or prices.
- Real indexed search for games, genres, developers, future creators and collections. Real waitlist stores userId/email/createdAt/status/source and prevents duplicates. Upcoming creator tools/analytics/revenue/payout features explicitly marked Coming Soon or Beta.
- Player supports loading/progress/fullscreen/crash/error recovery/reload/exit/controller information. Desktop, laptop, tablet and mobile; drawer sidebar and adaptive rows. Unsupported mobile engine editing has an intentional explanatory state.
- Keyboard navigation, focus, semantic markup, appropriate ARIA, alt text, contrast, reduced motion, accessible forms/error announcements. Major screens handle loading, success, empty, offline, network/server/validation failure, expired authentication and denied permission.
- Lazy loading, code/route splitting, optimized images, caching, pagination, skeletons, efficient queries; no hundreds of covers/assets on first homepage load.

## Authentication, authorization and privacy

- Real email/password and Google sign-in, email verification/reset, persistent sessions/logout/account deletion. Profile has avatar/username/display name/created date/last login.
- Backend source of truth for points/credits/tokens/achievements/favorites/history/library, future purchases, progress, notifications/preferences, engine projects/submissions. Browser storage only caches. Cross-device persistence and restoration after logout/login required.
- Backend-enforced roles: PLAYER, DEVELOPER, PARTNER_DEVELOPER, MODERATOR, CONTENT_MANAGER, FINANCE_ADMIN, PLATFORM_ADMIN, OWNER. Separate content/moderation/creator/ad/finance/platform privileges; no universal admin flag. Server verifies resource ownership and scope, not client role claims.
- Partner uses `/developer/upload` and normal developer workflow; may upload/update assigned games/media/trailers, submit, see own technical analytics/errors and explicitly authorized monetization information. Deny owner portal, company/other-creator/platform ad revenue, Stripe/Cloudflare finance, ad/reward configuration, terms/percentages, self-approval, admin creation and infrastructure/provider secrets.
- Owner portal at `/owners-portal`, omitted from normal navigation but secured server-side on every API. Real MFA, secure expiring sessions, recent reauthentication for sensitive changes, session/device management, login history, rate limits, suspicious-login detection and security notifications. No secret-URL authentication, hardcoded passwords or frontend password checks.
- Recent auth/MFA specifically for new OWNER, FINANCE_ADMIN grants, payout destinations, ad-provider settings, monetization percentages, large manual finance adjustments and payment secrets.
- Keep secrets out of Git, frontend/public configs, exposed environment variables, uploaded games and logs. Structured logs exclude passwords, API keys/session tokens/full payment details/credentials. BYO AI keys encrypted server-side where possible, tenant-isolated, never logged/committed.
- Privacy/Terms, cookie/ad consent architecture, account deletion, future data export; avoid exposing private engine project content through owner analytics. Persist developer distribution-rights declarations for code/art/music/sound/models/third-party assets/trademarks.

## Storage, uploads, isolation and moderation

- Pages serves site/application/small assets/docs; object storage holds browser builds/ZIPs, premium packages, media/large assets/patches/versions/exports. Example layout: `games/{gameId}/media`, `metadata`, `web/{version}`, `windows/{version}`, `macos/{version}`, `linux/{version}`, `patches`, `quarantine`.
- Engine-agnostic static browser builds: Crate, Three.js, Babylon, Phaser, Pixi, Unity Web, Godot Web, Construct, GDevelop, PlayCanvas, custom HTML5/JS/WASM/WebGL and supported WebGPU. One ZIP with expected root `index.html`, relative paths and required assets/WASM. Unity Build/TemplateData/StreamingAssets and supported compression headers; Godot HTML/WASM/PCK/data/assets validated.
- Configurable suggested size policy: first playable payload under 50–100 MB; compressed full build around 250 MB; initial hard upload maximum 500 MB. Owner can change limits centrally.
- Premium games need no browser build. Support complete Windows/macOS/Linux packages from legitimate engines. Require Windows executable plus necessary data/DLL/assets/config, not a random EXE. Document macOS .app/signing/notarization and permitted Linux ZIP/tar.gz. Packaged Unreal PC builds supported; no initial GPU streaming or console distribution.
- Workflow: choose Web/Premium/Both → metadata → artwork → build → automatic validation → security processing → developer review → submission → human review → approve/request changes/reject → publication.
- Metadata: title/slug/short/full description/developer/version/genres/tags/cover/hero/screenshots/optional trailer/controls and keyboard/mouse/controller/touch support/desktop/mobile browser support/languages/content information/release notes/download requirements.
- Quarantine pipeline includes SHA-256, archive/structure validation, security scan, metadata inspection and separate moderation before promotion. Prevent ZIP Slip/path traversal/bombs/nested archives/extreme ratios/symlinks/excessive counts/extracted size/malicious names/recursive extraction. Executables remain quarantined until approved; record scans and notify owner of significant detections.
- Inspect web builds for unauthorized scripts/ads, cryptominers, credential theft, redirects, hostile iframes/tracking/exploitation and suspicious obfuscation. Reject prohibited/illegal/stolen content. Player reports (broken/malware/copyright/content/ads/technical/other) enter moderation queue.
- Third-party JS runs on an isolated game origin (example `games.crateshipgames.com` or dedicated content domain) inside a sandboxed iframe. Constrained postMessage/SDK bridge to trusted backend. Never expose auth tokens, owner/finance APIs, private account/other-creator data or provider/infrastructure secrets. Intentional CSP, security headers and iframe capabilities; no unjustified wildcards.
- Version records preserve game/version/platform/file/checksum/size/release notes/uploader/time/status. Do not silently overwrite historical releases. Review statuses: draft, uploading, processing, validation_failed, ready_for_submission, submitted, under_review, changes_requested, approved, published, suspended, rejected, removed.
- Future premium downloads require backend license verification and short-lived authorization; expired URLs stop working, no permanent public package URL.

## SDK, rewards and Google advertising

- Controlled APIs: initialize/getPlayer/saveProgress/loadProgress/unlockAchievement/submitScore/requestRewardedAd/notifyLevelComplete/reportSession/getLanguage/getGameConfig; add requestInterstitial per Google addendum. Games never get unrestricted DB access. Progress may use per-game schemas rather than forcing universal levels/checkpoints.
- Wallets for points/credits/reward tokens are server-controlled with idempotent transaction ledger: ID/user/game/type/currency/amount/reference/event/status/created/verified. Types include rewarded_ad, achievement, daily_bonus, promotion, game_reward, purchase, refund, reversal, admin_adjustment. Game/browser chooses neither arbitrary reward amount nor authoritative completion.
- Central services: AdManager, RewardedAdService, InterstitialAdService, AdAnalyticsService, AdRevenueAttributionService, FrequencyCapService, ConsentService; Google addendum adds GoogleAdProvider and AdPlacementService. Platform owns account/config/inventory/credentials; never embed independent provider setup into each game.
- Reward flow: intentional player opt-in → backend player/game eligibility → provider ad → completion event → strongest available verification → trusted reward config → ledger once → wallet → confirmation. Do not assume mobile SSV exists for Google web; bind unique request IDs to game/session/player, rate-limit, deduplicate, cap rewards, detect anomalies and audit.
- Interstitials only at natural level/match/round/menu/session breaks with frequency caps. Never active controls/combat/movement/critical gameplay/login/checkout/every click.
- Evaluate supported Google H5 ad products/APIs and Ad Manager where required. Ordinary AdSense display units are not the H5 game-ad implementation. AdSense may support appropriate content-rich detail/marketplace/docs/search pages; no ad-only pages or overload. The site must work without immediate Google approval.
- Google owner metrics only where exposed: estimates/finalized revenue, impressions, rewarded starts/completions, interstitial impressions, revenue by game/format/date, eCPM/RPM/fill/invalid traffic. Clearly label estimate vs finalized; do not invent provider metrics.
- Attribution can contain game/developer/creator/session/type/provider/unit/time/completion/provider reference. Normalize reports and associate game/inventory where possible; apply the event-time agreement and record through shared commerce ledger. Authorized partner view only own-game share and payout status; never underlying Google account/platform totals/other-game revenue.
- Fraud controls address fake/automated views, forced/self clicks/click exchanges, misleading interactions, reward farming, impossible completion frequency/rates/repeated sessions/duplicates and coercive game scripts. Owner can suspend game ads, developer, player rewards, or formats globally. Published creator rules prohibit unauthorized/replaced units, hidden controls, automated traffic, click encouragement, false rewards; consequences include disables/suspension/holds/removal.
- Consent state integrates with AdManager, regional/Google/privacy requirements. No personalized ads without consent when legally required. At activation configure applicable ads.txt, domain ownership and publisher identifiers, documented without secrets.
- Google tests use approved test inventory/modes; never click live ads. Cover display/rewarded opt-in/decline/completion/duplicate-once/interstitial placement/caps, denied/granted consent, signed-in/out, partner/platform-owned/custom agreement, dashboard and kill switch. Go-live requires stable core, necessary domain approval/policy review, working consent/placements/fraud controls/reporting/commerce/kill switches/published rules and explicit owner approval.

## Commerce, agreements and finance

- All money systems reconcile through one auditable Commerce & Revenue architecture: rewarded/interstitial ads, premium sales/marketplace fees, future DLC/IAP/subscriptions/sponsorships/promotions, creator/partner/platform shares, refunds/adjustments/payouts.
- Every game has an explicit classification: PLATFORM OWNED, CREATOR REVENUE SHARE, CUSTOM AGREEMENT. Uploading/ownership alone grants no revenue rights. Published game assignments identify creator/developer/agreement/version/effective time/status. Partner may have different agreements per game; never one automatic global percentage.
- Event flow identifies game/creator/source and event-time agreement version, calculates eligible revenue/platform/creator allocations, records immutable event/creator obligation and exposes scoped results. Preserve historic versions and effective periods; later terms cannot rewrite previous accounting.
- Revenue model includes ID/game/developer/creator/source/type/gross/currency/fees/refund/eligible/platform/creator amounts/agreement/version/provider reference/status/event date/timestamps. States distinguish estimated, pending_provider_finalization, finalized, adjusted, reversed, refunded, eligible_for_payout, paid. Estimated ad revenue is not guaranteed earnings.
- Agreement model includes name/type/developer/creator/games/effective and optional end date/status/category percentage pairs/minimum payout/schedule/public/internal notes/private legal-document reference/version/creator/approver/timestamps. Categories: rewarded ads, interstitials, premium, DLC, IAP, subscriptions, sponsorships, promotions/other. States: draft, pending, active, paused, expired, terminated.
- Owner manager creates/assigns/versions/pauses/terminates/reviews/filters agreements and shows a calculation preview before activation. Developers see allowed agreement status/rights but cannot modify type/terms/effective dates/internal notes/payout configuration. Private executed-document support does not replace a legal agreement.
- Creator obligations are separate from company cash, linked to revenue event/agreement/game. States: estimated, pending, finalized, held, eligible, included_in_payout, paid, reversed. Payout preparation only, with accruing/pending/approved/processing/paid/failed/held/reversed/disputed; no self-approval or premature payment activation.
- Prepare PaymentProvider/PaymentService/CheckoutService/PurchaseVerificationService/RefundService/WebhookService/LicenseService interfaces. Later Stripe is server-side Checkout + authenticated webhooks/idempotency/verification/refund/chargeback handling. No client-success trust or exposed Stripe secrets.
- Verified payment → purchase/items → license → library ownership → temporary secure download. Support partial/full refunds, fraud, chargebacks, reversals and adjustments through ledger entries, never deletion of financial history.

## Owner operations, controls and recovery

- Owner dashboard immediately shows today revenue/ad revenue/premium sales/plays/new users; month gross/creator obligations/platform share/pending payouts; activity uploads/review/security/storage/developer updates/errors.
- Commerce dashboards include gross/estimated/finalized/platform share/creator obligations/pending and paid creator payouts/refunds/chargebacks; breakdown by game/developer/type/agreement. Real zero states while providers remain disabled.
- Navigation: Overview, Commerce & Revenue, Advertising, Premium Sales, Creators, Agreements, Payouts, Games, Players, Rewards, Game Engine, Infrastructure, Storage, Costs/Usage, Security, Audit Log, Notifications, Platform Settings.
- Game management filters review state/developer/game type/monetization/agreement/platform. Creator directory includes identity/email/role/status/games/agreements/authorized earnings/payout state/security flags/warnings. Player analytics tracks users/activity/plays/session time/favorites/library/rewards/future purchases. Engine analytics tracks usage/projects/saves/exports/publications/storage/AI/errors without needless private-content exposure.
- Provider-permitted infrastructure metrics: R2 storage/operations, Workers requests, Pages, D1/KV/database growth, media/game/engine storage and auth. Label ACTUAL PROVIDER DATA vs INTERNAL ESTIMATE; never invent billing data. Owner-configurable usage thresholds alert storage/request/upload/download/AI/DB anomalies and growth; aim early costs near zero.
- Server-enforced flags include PUBLIC_CREATOR_UPLOADS_ENABLED, CREATOR_WAITLIST_ENABLED, PREMIUM_SALES_ENABLED, PAYMENTS_ENABLED, STRIPE_ENABLED, REWARDED_ADS_ENABLED, INTERSTITIAL_ADS_ENABLED, CREATOR_PAYOUTS_ENABLED, ENGINE_AI_ENABLED, PUBLIC_REGISTRATION_ENABLED plus Google flags. Unfinished features are disabled safely rather than deleted.
- Owner kill switches cover registration/upload/public publishing/rewarded/interstitial/purchases/premium downloads/specific game/developer/engine AI/engine publishing/platform APIs/maintenance mode. Backend enforcement is mandatory.
- Audit sensitive uploads/reviews/suspensions/agreements/revenue adjustments/roles/finance permissions/payout/ad/security settings/emergency switches with actor/action/target/old and new values/time/result/reason. Security center includes failed/suspicious logins, owner access attempts, role/admin changes, upload threats/malware/blocked games, ad/monetization/financial changes/API abuse/storage anomalies.
- Owner notifications include submission/review/scan/malware/upload/storage/traffic/error/expiry/unauthorized financial attempts/future payout/chargeback/revenue anomalies. Backup and documented recovery cover users/games/metadata/versions/projects/agreements/revenue and reward ledgers/settings/audit logs.

## Engine and documentation

- Sidebar opens the real engine. Audit/repair existing project manager, scene/hierarchy/inspector/assets/models/materials/textures/audio/animation/scripts/lighting/camera/physics/UI/preview/settings/AI/save/autosave/export/publish modules as applicable. Preserve functioning code.
- Authenticated projects support create/save/autosave/open/rename/duplicate/delete/export, metadata/thumbnails/update dates and survive logout. Export menu: Web ZIP, publish through review workflow, project backup, supported GLTF/GLB; future Unity/Unreal compatible workflows. Users can host or sell elsewhere with no platform lock-in.
- BYO AI may support OpenAI/Anthropic/Google/Mistral/OpenRouter/future providers: add/test/select model/default/update/delete key; private secure handling. Assistant may generate/explain/fix scripts, objects/components/scenes/gameplay logic, optimize/debug using chosen connected provider/model.
- `/developers/docs` is a major product area: getting started/types/upload/web/Unity/Three.js/Godot/premium/Windows/macOS/Linux/ZIP/sizing/artwork/versioning/SDK/ads/agreements/revenue/security/moderation/errors/FAQ. Detailed upload guide must match actual verify-account-to-review-to-version-update workflow.
- Guides cover relative paths/static build output/WASM/GLB/GLTF/textures/audio/shaders/compression/lazy streaming/cloud saves/SDK/ads/fullscreen/gamepads/mobile; Unity gzip/Brotli/StreamingAssets; Godot WASM/PCK/thread/browser compatibility; native packaging/signing/system requirements/review/secure updates. FAQ explains compatible engines, Unreal browser limitations, sizes, rights, own-ad prohibition, agreement-based earnings, isolation, rejection/malware and export/publish freedom.

## Required routes and entity coverage

Public/user routes: `/`, `/games`, `/games/free`, `/games/premium`, `/game/:slug`, `/marketplace`, `/library`, `/favorites`, `/rewards`, `/profile`, `/settings`, `/login`, `/signup`, `/forgot-password`, `/engine`, `/engine/projects`, `/engine/project/:id`, `/developer`, `/developer/games`, `/developer/upload`, `/developer/game/:id`, `/developer/analytics`, `/creators`, `/community`, `/support`, `/privacy`, `/terms`.

Documentation routes: `/developers/docs` plus `/uploading`, `/web-games`, `/unity-web`, `/threejs`, `/godot-web`, `/premium-games`, `/sdk`, `/ads`, `/monetization`, `/security`, `/faq` under that base.

Owner routes: `/owners-portal` plus `/dashboard`, `/commerce`, `/revenue`, `/ads`, `/sales`, `/agreements`, `/agreements/new`, `/creators`, `/games`, `/payouts`, `/players`, `/rewards`, `/engine`, `/infrastructure`, `/storage`, `/security`, `/audit`, `/notifications`, `/settings` under that base.

Prepare or map equivalent entities: users, developerProfiles, games, gameVersions, gameBuilds, gameMedia, favorites, playHistory, gameProgress, achievements, notifications, wallets, walletTransactions, rewardEvents, adEvents, gameLicenses, purchases, purchaseItems, paymentEvents, refunds, chargebacks, downloadAuthorizations, monetizationAgreements, monetizationAgreementVersions, gameMonetizationAssignments, revenueEvents, creatorEarnings, revenueAdjustments, payouts, payoutItems, developerApplications, creatorWaitlist, moderationReports, submissionReviews, auditLogs, securityEvents, ownerNotifications, engineProjects, featureFlags, usageThresholds, platformConfiguration.

## Required verification and evidence

- Authentication: signup/verification/login/logout/Google/reset/restore/expiry/deleted account/unauthorized routes. Owner MFA/reauth/session management and portal actions; player/developer/partner denied owner access.
- Partner denied company/ad/finance/other-creator data, ad config, agreement/percentage changes, self-approval of submission/payout and secrets. Backend validates game ownership/status, reward/ad/purchase facts, agreement assignment and financial adjustments.
- Persistence: rewards/favorites survive refresh/logout/login, recent play updates, engine projects survive save/refresh/logout/login. Cross-account/resource denial included with backend authorization checks.
- Uploads: valid Three.js/Unity/Godot/Windows, missing entry, oversize, ZIP Slip/bomb/invalid structure/suspicious scripts/malicious executable, version update and rollback if supported. Quarantine/isolation and scan/publish boundaries require actual evidence.
- Payments disabled: premium renders, checkout cannot finish, no fake purchase/license, zero-revenue owner dashboard; internal-only simulated calculation tests.
- Agreements: platform-owned/standard/custom/per-game partner terms, v1/v2 event-time behavior, denied partner edits, audited owner edits. No historic accounting mutation.
- Staging isolation: correct separate payment/ad config, upload locations and owner sessions; build, accessibility/performance, backup/recovery, feature flags/kill switches and production behavior verified before core readiness claims.
- Google tests and go-live follow the separate gate above. Record actual passing evidence and remaining provider/owner prerequisites; do not label unconfigured third-party flows complete.
