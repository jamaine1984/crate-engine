# CrateShip Games Stripe status — October 3, 2026

## Current deployment and owner decisions

The site is deployed at https://crateshipgames.com. Stripe **sandbox** is connected to its backend; real checkout has not launched yet. The owner explicitly wants real checkout, seller uploads and publication to remain available after activation, ready for future real games. This is not a direction to leave every feature disabled.

Operator confirmed by the owner: **Jamaine Martin, Washington, United States**. Contact: **crateshipstudios@gmail.com**. These details were added to the public legal drafts. Mailing address, age enforcement, final commercial policies and transaction-tax setup still require completion before a commercial launch. Do not label the policies as legal clearance.

- Final site deployment: https://149eabf3.crateship-games.pages.dev (production main), including operator details and final pricing/expiry repairs. Two connection-reset deploy attempts did not create releases; the successful retry used normal TLS with IPv4 DNS preference.
- D1 migration `0014_stripe_commerce.sql` applied remotely to `crateship-platform-v1`.
- Encrypted Cloudflare production secrets: `STRIPE_SECRET_KEY` (sandbox) and `STRIPE_WEBHOOK_SECRET`. No credentials are in source, Git or the desktop backup.
- `STRIPE_MODE=test`. Live readiness requires a live key, live webhook, final policy version, approved configuration and owner payment flags.
- Protected game-content Worker deployed: version `0a93b86d-28f4-4498-9d6c-fb382bd4e5bc`.
- Updated game-publisher Worker deployment was **rejected by Cloudflare**: CPU limits unsupported on Free plan, error 100328. The existing publishing deployment was not replaced. Workers Paid activation is required; do not claim uploads/publication are operational.
- Live Stripe Connect page says **Provide a valid identity document** for Jamaine Martin. Live account creation is disabled until identity verification and integration confirmation finish. The identity consent step is open in Microsoft Edge for the owner; no consent or identity upload was submitted by the agent.

## Implemented payment flow

- Server-only REST client pinned to `2026-09-30.endive`, with timeout and sanitized public errors. Current Stripe API requires Dashboard-managed payment methods; the rejected legacy `payment_method_types` parameter was removed following an actual provider test.
- Hosted Checkout uses reviewed published browser-game prices from the database, USD $1.99–$999.99. Browser-submitted prices are ignored. Pricing locks after submission for review.
- Creator destination charges allocate 80% to the creator and 20% to CrateShip, with cent rounding; ordinary Stripe processing fees are recorded separately against the platform share. Platform-owned games use no creator transfer.
- Stripe-hosted Express onboarding supports US adult sellers, with verified provider account readiness before checkout and versioned assigned agreement acceptance before live sales.
- Orders are account/mode bound and idempotent. One open order per buyer/game/mode; timeouts retain a retryable order, expired orders require a new checkout.
- Raw-body HMAC webhook verification, timestamp tolerance, mode checks, provider retrieval, amount/currency/destination/fee matching, deduplication and protection from foreign application checkouts.
- Verified live payments create purchases, licenses, library entries and immutable sale/fee records. Sandbox orders create none of those live entitlements or earnings.
- Premium files require a valid current player session, active user and live license on every file read. Public-path and revoked-license bypasses are denied. This is access control, not DRM against authorized copying.
- Refunds/disputes revoke access and hold obligations. Refund ledger adjustments are cumulative and preserve history. Actual live refund/transfer-reversal operations still use Stripe's reviewed workflow; dispute fees, won-dispute access restoration and bank payout reconciliation remain additional operational work.
- Buy/return/status pages, creator Payments page, price form and owner Stripe readiness page are wired.
- This sells **browser access**. Native downloadable game packages and protected downloads remain separate work.

## Verification completed

- Full platform regression suite: **656 passed, 0 failed, 1 skipped** after final changes; the skipped test is an existing live Blender check. Record the actual final run result if it differs.
- 16 Stripe tests cover split/rounding, server pricing, one-order concurrency, sandbox isolation, mocked live fulfillment, deduplication, partial/full refunds, refund-before-completion, disputes, bad amounts/signatures/modes, foreign apps, pending/expired states, unverified sellers, missing acceptance/flags, owner MFA, foreign order access, pricing locks, cross-origin requests, tampering and network retry.
- Premium delivery test checks authorized read, public-path denial, revoked license, suspended user, expired/ended sessions and HEAD checks.
- Real Stripe sandbox hosted Checkout paid successfully with Stripe's 4242 test card: **$9.99 gross; $7.99 creator; $2.00 platform; $0.59 processing fee**. Provider status complete/paid. No real money moved.
- Real Express account creation and Stripe-hosted onboarding-link generation succeeded; completion of that account's onboarding was not claimed.
- Real full sandbox refund succeeded with transfer reversal and application-fee refund. Stripe automatically delivered `charge.refunded` to the live CrateShip backend; remote D1 records the sandbox order as refunded for all 999 cents. No live licenses or purchases were created.
- A hidden internal sandbox fixture exists in D1 to verify this webhook. Its game is **draft**, version quarantined/scan pending, users have **no sessions or roles**, and it never appears in the public catalog. Preserve accounting evidence without treating it as a real game or revenue.
- Live config HTTP 200 confirms sandbox connected. Unsigned webhook HTTP 400; genuine provider completion payload replay HTTP 200 twice, deduplicated.
- Production frontend build and Pages Functions compile passed. Public browser checks and final deployment URL are recorded below.
- Physical device QA, real live transactions, bank payouts, full live seller onboarding, upload→scan→publish and actual premium browser play remain unverified.

## Remaining go-live work

1. Owner completes Stripe identity verification, then required live Connect integration confirmation/terms. Do not accept financial activation or binding provider terms for the owner.
2. Owner activates Cloudflare Workers Paid (currently starts at $5/month plus usage); deploy publisher/scanner, check service bindings/internal secrets and run a real owned game through upload→review→publish. Do not enable upload controls against unavailable infrastructure.
3. Complete final buyer/seller policies, birthday/content-rating enforcement and applicable transaction-tax configuration. Confirm business contact address separately; do not publish a personal address without instruction. Assigned agreements require actual acceptance.
4. Connect live provider credentials/webhook securely, verify the live account and delivery configuration, set a final non-draft policy version and activate the three payment flags with recent owner MFA. The owner has approved moving toward live operation after verification; obtain any required specific credential transmission/terms approval at the actual step.
5. Verify the first real release's supported devices, listing, price, delivery and refund workflow. Real transactions/payouts require owner-controlled actions.
6. Add protected native downloads, automatic operational reconciliation and Google ad integration only after their prerequisites are met.

## Ads

H5 application **submitted** by the owner; Google's confirmation was seen. AdSense site review and H5 access await approval. ads.txt is live. No ads are serving. Do not restart the blog/low-content investigation: owner chose to wait for Google's decision.

## Primary references

- https://docs.stripe.com/connect/destination-charges
- https://docs.stripe.com/connect/hosted-onboarding
- https://docs.stripe.com/connect/testing
- https://docs.stripe.com/checkout/fulfillment
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods
- https://developers.cloudflare.com/workers/platform/pricing/
