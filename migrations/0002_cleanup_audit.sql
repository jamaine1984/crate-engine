CREATE TABLE IF NOT EXISTS cleanup_audit (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  persisted_at TEXT NOT NULL,
  worker TEXT NOT NULL,
  source TEXT,
  ok INTEGER DEFAULT 0,
  error TEXT,
  reason TEXT,
  dry_run INTEGER DEFAULT 1,
  delete_enabled INTEGER DEFAULT 0,
  limit_count INTEGER DEFAULT 0,
  scanned INTEGER DEFAULT 0,
  orphaned INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  errors_json TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER DEFAULT 0,
  cron TEXT,
  scheduled_time INTEGER DEFAULT 0,
  admin_name TEXT,
  admin_role TEXT
);

CREATE INDEX IF NOT EXISTS idx_cleanup_audit_persisted_at
  ON cleanup_audit (persisted_at DESC);

CREATE INDEX IF NOT EXISTS idx_cleanup_audit_reason_persisted_at
  ON cleanup_audit (reason, persisted_at DESC);
