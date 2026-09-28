-- Creator access is now instant for any verified account (owner decision, 2026-09-28).
-- The waitlist flag becomes the owner's on/off switch for creator sign-up.
-- Every game still needs owner review before it can be published.
INSERT OR IGNORE INTO platform_feature_flags(key,enabled,updated_at)
  SELECT 'CREATOR_SIGNUP_ENABLED',1,0;
DELETE FROM platform_feature_flags WHERE key='CREATOR_WAITLIST_ENABLED';
