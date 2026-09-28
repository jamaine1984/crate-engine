-- Private editor imports only; these are not published marketplace/game assets.
CREATE TABLE IF NOT EXISTS platform_engine_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  name TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  size INTEGER NOT NULL CHECK(size>0 AND size<=33554432),
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','ready')),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,sha256)
);
CREATE INDEX IF NOT EXISTS platform_engine_assets_user ON platform_engine_assets(user_id,status);

-- Retain private object keys until physical R2 deletion succeeds. Account erasure
-- inserts this queue and removes access rows in one D1 transaction.
CREATE TABLE IF NOT EXISTS platform_engine_asset_purge_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  not_before INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_engine_asset_purge_due ON platform_engine_asset_purge_queue(not_before);
