CREATE TABLE IF NOT EXISTS moderation_audit (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT,
  admin_id TEXT,
  admin_name TEXT,
  admin_role TEXT,
  action TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  changes_json TEXT NOT NULL,
  note TEXT,
  title TEXT,
  visibility TEXT,
  moderation_status TEXT,
  featured INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_slug_at
  ON moderation_audit (slug, at DESC);
