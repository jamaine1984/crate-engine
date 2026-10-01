# Crate Ship Games — player and marketplace launch plan

Updated October 1, 2026. Engine development is outside this pass.

## Decisions and proposals

- Prioritize playable, reviewed games and advertising, then full-game sales.
- Free hosted creator releases should be substantial demos, clearly linked to the full game when offered. Do not promise a universal number of minutes: require a complete level or meaningful gameplay loop and review it.
- Recommended ad share: **70% creator / 30% platform** of provider-finalized eligible ad proceeds attributable to the game. Ordinary hosting costs come from the platform share. Do not pay estimates or count client callbacks as income.
- Proposed sale share: **80% creator / 20% platform** of the pre-tax sale amount, after refunds. To match the owner's reason for the commission, propose paying standard Stripe and Connect fees from the platform's 20%. Confirm that policy before activation. The existing ledger currently subtracts fees before splitting; it must gain an explicit, category-specific fee-bearer policy to support this proposal correctly.
- Recommended players: 13+, with age-appropriate games and guardian involvement where applicable. Recommended monetized creators: 18+ and legally able to contract. Under-13 registration remains outside the initial launch proposal. The owner has required birthday-based restrictions but has not yet confirmed the final minimum age.
- Every player must sign in and complete the birthday step before play. This is a **required implementation task**, not a shipped capability. Existing accounts need the same completion step. A declared birthday is not verified identity.
- Final business identity, operating jurisdiction, mailing address, age policy, commercial agreement, refund rules, and payout schedule require owner/counsel confirmation. Draft pages must not be represented as final legal clearance.

## Current evidence

Production configuration and catalog were checked during this run:

| Area | Actual state |
|---|---|
| Database and upload storage bindings | Health endpoint reports configured |
| Email/Google signup | Enabled; Firebase configured; user reports working |
| Creator signup | Enabled |
| Published catalog | **0 games** returned by `/api/platform/catalog` |
| Creator ZIP uploads and publishing | Disabled |
| Isolated game origin | `null` in public configuration |
| Ads, paid checkout, payouts | Disabled in flags and hard-disabled by server provider gates |
| Stripe account | Signed-in `crateshipstudios` account inspected in Edge |
| Stripe Connect | Connect onboarding shows **Get started**; completion not verified |
| Marketplace and community | Placeholder screens, no asset sales or discussion workflow |
| Birthday and enforced game age ratings | Not implemented |

Public pages, account entry forms, creator documentation, signed-out collection gating, and responsive layouts were inspected. No production account was created and no real payment, payout, ad impression, upload, or live game session was performed. Local seeded account visibility is not proof of production authentication.

## Completed in this pass

1. Reproduced the sticky left navigation covering lower homepage content.
2. Confined lower creator sections to the center column; both side rails now have bounded, independent scroll areas. The page scroll is separate. Keyboard focus is available on both scroll regions. Mobile retains its navigation drawer and hides the desktop right rail.
3. Added a Legal & Trust Center and nine draft policies: Terms, Privacy, Cookies/Privacy Choices, Creator Agreement, Monetization/Payouts, Refunds, Acceptable Use, Community Guidelines, Copyright/Takedowns.
4. Added `crateshipstudios@gmail.com` as the support/policy contact.
5. Corrected the upload guide's comprehensive-malware-scan implication and disclosed that public uploading is closed.
6. Added direct-route rewrites and working policy section links. Fixed navigation order so section anchors remain visible beneath the sticky header.

## Phase 1 — mandatory account and age controls

Before publishing any playable game:

- Confirm 13+ players and 18+ monetized creators with the owner and legal reviewer. An age label alone does not resolve child-directed-service rules.
- Show a neutral birthday step before processing a new account's other information; validate a real date, reject future/impossible dates, calculate age on the server, and decline under-minimum registrations without creating a Firebase/platform account. Do not ask for both birthday and a freely editable age number.
- Cover email and Google signup/sign-in, API calls, and existing accounts missing birthday data. Store the minimum information needed privately, define correction/appeal handling, and update Privacy/retention disclosures. Do not expose birthday to other players or creators.
- Require sign-in and completed age eligibility at `/player/sessions` and paid-entitlement endpoints. Hide incompatible listings/artwork and reject direct URLs, session creation, and content-token issuance for incompatible games. Merely hiding a Play button is insufficient.
- Add structured, reviewer-approved minimum-age and content-warning fields. Default unrated games to unavailable. Creators cannot lower an approved age restriction by editing metadata. Updates that change content require renewed review.
- Keep public game files from becoming a bypass of the age gate: issue short-lived, game/version-scoped content authorization only after server eligibility checks. The current game-content architecture needs this additional control because a public file URL can be visited directly.
- Do not use personalized advertising for teen accounts until the applicable provider/minor rules are resolved. Do not collect government identification casually to make birthdays appear verified.

Acceptance: underage signup is declined before account creation; existing incomplete accounts cannot play; compatible games work; incompatible games and their direct content URLs fail; review changes cannot be bypassed by a creator edit; birthday changes are controlled. Include boundary birthdays, leap dates, malformed requests, Google signup, expired sessions, and mobile forms.

## Phase 2 — publish and play a real demo

- Confirm Cloudflare Workers billing/CPU capacity for the existing scanner and publisher. Do not upgrade a paid plan automatically. Their current configurations use CPU budgets unavailable on the free tier.
- Provision the dedicated published-game storage; deploy scanner, publisher, and isolated game-content service; bind `GAME_SCANNER` and `GAME_PUBLISHER`; configure `GAME_CONTENT_ORIGIN` and required internal secrets securely.
- Inspect the current scanner as a bounded build checker. It blocks unsafe ZIPs, prohibited native files, and selected mining markers; it is not a full antivirus engine. Preserve human review and isolation and decide whether an additional malware service is required.
- Make the actual release limits authoritative throughout upload UI/API: 16 MiB ZIP, 48 MiB expanded, 1,000 files, 16 MiB per file. Public config currently advertises broader reservation limits, which must not mislead creators about publishable browser builds.
- Add Demo/Full-game classification, their relationship, demo limitations, meaningful-content expectations, screenshots, controls, compatible devices, and content ratings. Premium delivery needs separate entitlement support; the current publisher rejects paid games.
- Exercise creator draft → screenshots → upload → checks → review → approve → publish with a real owned browser demo. Verify updates, failed/aborted uploads, rejected files, review notifications, rollback, and retention.
- Exercise player loading, keyboard/touch/fullscreen, audio after gesture, pause/resume, return to catalog, favorites, library, recent history, progress save/load, and expired sessions on desktop and actual phones.

Acceptance: at least one reviewed, age-compatible demo is playable from its public listing by an eligible signed-in account, isolated from platform credentials; no unapproved version is exposed. This is the prerequisite for real in-game ad testing.

## Phase 3 — advertising (highest monetization priority)

The provider name is **Google H5 Games Ads**, not “High Five.” H5 uses Google's Ad Placement API and requires an approved AdSense account plus H5 application access. Approval is not guaranteed. Apply once the site has genuine playable content and completed operating disclosures. [H5 signup](https://developers.google.com/ad-placement/docs/signup), [H5 product](https://adsense.google.com/start/h5-games-ads/).

- Confirm the intended publisher account, approved sites/game origin, publisher ID, required `ads.txt`, domain verification, and provider terms. Do not paste secret credentials into game builds.
- Implement the actual required consent flow before ad requests. For personalized ads in the EEA/UK/Switzerland, Google requires a certified CMP; the existing account preference is not sufficient. Confirm regional and minor handling. [Google CMP requirements](https://support.google.com/adsense/answer/13554116?hl=en).
- Prototype a provider-approved H5 integration in the isolated player without weakening its boundary. Test whether the provider supports the selected embedding/storage arrangement. Do not assume the present opaque sandbox can run an ad integration unchanged.
- Provide an SDK for natural game breaks and optional rewarded placements. Pause/mute before an ad, resume afterward, and handle no-fill, dismissal, timeout, ad blockers, and frequency limits gracefully. Do not interrupt active gameplay on an arbitrary wall-clock timer. [Ad Placement API callbacks](https://developers.google.com/ad-placement/apis/adbreak).
- Rewards are game benefits, not cash or creator earnings. Grant only on the provider's successful completion path with replay/rate controls; never on a simulated timer. Do not represent browser callbacks as server-verified ad revenue.
- Establish provider-approved per-game reporting and reconciliation. Investigate AdSense for Platforms eligibility for direct revenue sharing; it is a separate enterprise product and cannot be assumed available. Otherwise obtain approval for the platform's reporting/payout model. [AdSense for Platforms](https://developers.google.com/adsense/platforms).
- Create accepted, versioned 70/30 ad agreements and reports showing estimates, finalized proceeds, adjustments, holds, and paid amounts. Keep platform-owned games classified separately.

Acceptance: provider-approved test mode behaves correctly on desktop/mobile; real approved inventory loads after consent; missing/blocked ads do not trap players; no fake reward or income; finalized per-game proceeds reconcile to the provider and accepted agreement. Only then remove provider activation gates.

## Phase 4 — Stripe sales and creator payouts

Use **Stripe Connect plus hosted Checkout**, not a single generic payment link. For an initial one-game/one-creator order, destination charges with an explicit application fee are a suitable candidate. The platform is charged Stripe fees/refunds/disputes in this model; refunds need correct transfer and application-fee handling. Confirm settlement merchant, eligible seller countries, and business model with Stripe. [Destination charges](https://docs.stripe.com/connect/destination-charges?platform=web&ui=stripe-hosted).

- Finish Connect setup and seller onboarding after the owner reviews the financial/contract choices. Prepare in a sandbox first. Store secret API keys and webhook signing secrets server-side only; never expose or print them in screenshots/logs.
- Persist connected-account status and prevent sales while requirements, supported countries, or payout capabilities are incomplete.
- Add prices/currencies, orders, payment attempts, licenses, and protected delivery for the full game. Calculate price/creator/agreement/version on the server. A client cannot supply its own commission or entitlement.
- Implement signed, idempotent provider webhooks for successful/failed/delayed payments, refunds, disputes, account changes, and transfers. Do not grant ownership from the redirect/success screen alone.
- Update the ledger to preserve an 80% creator amount when fees are platform-borne. Store gross/pre-tax amount, taxes, refund allocation, provider costs, commission, creator balance, and adjustments separately.
- Implement purchase library access, redownload, receipt links, cancellation/refund requests, failed delivery, purchase revocation, and proportionate transfer reversals.
- Define payout schedule, reserves, minimum, identity/tax checks, and creator reports in the effective agreement. Confirm whether any separate ad disbursement flow is supported by Stripe and Google.
- Budget provider fees. Published US Connect pricing for platform-controlled pricing currently includes $2 per monthly active paid-out account and 0.25% + $0.25 per payout, besides processing. A $10 sale at an illustrative 2.9% + $0.30 processing rate leaves $1.41 of the platform's $2 before other costs. Actual region/account pricing must be checked. [Connect pricing](https://stripe.com/connect/pricing).

Acceptance: sandbox purchase, decline, delayed confirmation, duplicate webhook, refund, chargeback, suspended seller, invalid price, replay, and delivery denial all behave correctly. Production activation comes after verified setup and owner approval; no live test charge/payout is made as part of this audit.

## Legal and operating completion

The nine new pages are marked **prelaunch drafts**. Before treating them as final:

- Confirm operator legal name, state/country, business mailing address, and jurisdiction; avoid publishing a personal home address without an appropriate business-contact decision.
- Resolve age policy, parental involvement, birthday retention, and content-rating enforcement with counsel. Under-13 processing needs a distinct compliant program if ever considered. [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
- Confirm the proposed fees, demo rules, refund policy, paid digital-delivery consent, payout timing, dispute process, and seller tax/transaction-tax responsibilities. Do not promise that a page alone implements them.
- Add durable legal-version acceptance records across email/Google signup and creator enrollment. Commercial agreement acceptance must bind an exact game, agreement version, creator, and timestamp. Verify existing users' required notices/acceptance before monetization.
- Inventory actual providers/data flows/retention, privacy request fulfillment, international transfers, applicable consumer privacy rights, consent withdrawal, and required opt-outs. Do not claim universal regulatory compliance from these drafts. [California privacy overview](https://oag.ca.gov/privacy/ccpa).
- Confirm/register the appropriate DMCA agent and publish its required contact information; implement notices, counter-notices, repeat-infringer handling, and case records. Merely adding a copyright page does not establish safe-harbor eligibility. [Copyright Office guidance](https://www.copyright.gov/512/), [agent directory](https://www.copyright.gov/dmca-directory/).
- Verify the support inbox is monitored, with owner review/appeal handling and an escalation process. Community moderation tools can follow later; do not advertise functioning discussions yet.

## Verification recorded in this pass

- Production config, health, and catalog inspected; catalog is empty.
- Build passed after the changes; existing engine JS/CSS filenames match production, and no engine source changed.
- 146 marketplace/backend checks passed, plus 41 identity/Firebase/analytics/legal checks: **187 passed, 0 failed** across these two focused runs.
- Independent side-panel scrolling preserved page position in the browser (page Y stayed 720 while left/right scroll positions advanced to 266/129).
- Desktop, 900px tablet, and 390px mobile inspected. Mobile/tablet page widths did not exceed the viewport. Legal center, all nine direct policy routes, policy anchors, and drawer navigation checked locally.
- Source checks and local tests do not prove complete production signup, game hosting, ad delivery, payments, payouts, or legal compliance. Those remain the explicit acceptance gates above.

## Next implementation order

1. Confirm final audience/business details; implement birthday and reviewed age gates.
2. Complete isolated hosting and publish a reviewed demo with signed-in play.
3. Apply/configure H5 Ads and consent, then prove finalized 70/30 reporting.
4. Complete Connect/Checkout, fee accounting, protected full-game delivery, refunds, and 80/20 sales.
5. Finish legal acceptance, operational checks, and production go-live evidence for each feature before its switch is enabled.

Keep engine work parked. Keep the desktop source/handoff backup free of secrets and local account databases. Do not reopen the removed legacy asset catalog or change existing agreement history.
