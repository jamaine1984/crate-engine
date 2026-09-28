-- Live game updates: a published game keeps serving active_version_id while a
-- new build waits in pending_version_id for review. Releasing the update swaps
-- it in; rejecting it leaves the live version untouched.
ALTER TABLE platform_games ADD COLUMN pending_version_id TEXT;
ALTER TABLE platform_games ADD COLUMN update_status TEXT CHECK (update_status IS NULL OR update_status IN ('submitted','changes_requested','rejected','approved'));
CREATE INDEX IF NOT EXISTS platform_games_update_review ON platform_games(update_status, updated_at DESC);
