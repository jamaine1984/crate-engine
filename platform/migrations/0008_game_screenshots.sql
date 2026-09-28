-- Up to three screenshots per game (images only; no video, to stay inside free storage).
CREATE TABLE IF NOT EXISTS platform_game_media (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES platform_games(id),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/webp','image/png','image/jpeg')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES platform_users(id),
  created_at INTEGER NOT NULL,
  UNIQUE (game_id, position)
);
CREATE INDEX IF NOT EXISTS platform_game_media_game ON platform_game_media(game_id, position);
