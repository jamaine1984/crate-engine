-- Provider records are separate for sandbox and live. Sandbox purchases never grant live licenses.
CREATE TABLE IF NOT EXISTS platform_stripe_accounts (
 user_id TEXT NOT NULL REFERENCES platform_users(id), mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 account_id TEXT NOT NULL UNIQUE, charges_enabled INTEGER NOT NULL DEFAULT 0,
 payouts_enabled INTEGER NOT NULL DEFAULT 0, details_submitted INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,mode)
);
CREATE TABLE IF NOT EXISTS platform_stripe_orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES platform_users(id), game_id TEXT NOT NULL REFERENCES platform_games(id),
 request_key TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 agreement_version_id TEXT NOT NULL REFERENCES platform_agreement_versions(id), creator_id TEXT REFERENCES platform_users(id),
 destination_account TEXT, gross_minor INTEGER NOT NULL CHECK(gross_minor>0), creator_minor INTEGER NOT NULL CHECK(creator_minor>=0),
 platform_minor INTEGER NOT NULL CHECK(platform_minor>=0), currency TEXT NOT NULL CHECK(currency='USD'),
 session_id TEXT UNIQUE, payment_intent_id TEXT UNIQUE, checkout_url TEXT,
 status TEXT NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','pending','paid','expired','failed','refunded','disputed')),
 refunded_minor INTEGER NOT NULL DEFAULT 0, fees_minor INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(user_id,mode,request_key), CHECK(creator_minor+platform_minor=gross_minor)
);
CREATE INDEX IF NOT EXISTS platform_stripe_orders_user ON platform_stripe_orders(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS platform_stripe_one_open_checkout ON platform_stripe_orders(user_id,game_id,mode) WHERE status IN ('creating','pending');
CREATE TABLE IF NOT EXISTS platform_stripe_events (
 event_id TEXT PRIMARY KEY, mode TEXT NOT NULL, type TEXT NOT NULL, processed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_seller_acceptances (
 user_id TEXT NOT NULL REFERENCES platform_users(id), agreement_version_id TEXT NOT NULL REFERENCES platform_agreement_versions(id),
 policy_version TEXT NOT NULL, accepted_at INTEGER NOT NULL, PRIMARY KEY(user_id,agreement_version_id,policy_version)
);
