-- Apply only to a NEW, isolated PLATFORM_DB. No legacy user import or production writes.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  auth_version INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS platform_user_roles (
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  role TEXT NOT NULL CHECK (role IN ('PLAYER', 'DEVELOPER', 'PARTNER_DEVELOPER', 'MODERATOR',
    'CONTENT_MANAGER', 'FINANCE_ADMIN', 'PLATFORM_ADMIN', 'OWNER')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, role)
);
CREATE TABLE IF NOT EXISTS platform_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  auth_time INTEGER NOT NULL,
  mfa_time INTEGER,
  revoked_at INTEGER,
  user_agent TEXT NOT NULL,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_sessions_user ON platform_sessions(user_id, expires_at);
CREATE TABLE IF NOT EXISTS platform_auth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password', 'mfa_login')),
  auth_version INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_auth_tokens_user ON platform_auth_tokens(user_id, purpose);
CREATE TABLE IF NOT EXISTS platform_rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_rate_limits_expiry ON platform_rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS platform_mfa (
  user_id TEXT PRIMARY KEY REFERENCES platform_users(id),
  secret_ciphertext TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  pending_session_id TEXT,
  pending_expires_at INTEGER,
  last_counter INTEGER NOT NULL DEFAULT -1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_oauth_states (
  state_hash TEXT PRIMARY KEY,
  payload_ciphertext TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_oauth_accounts (
  provider TEXT NOT NULL CHECK (provider = 'google'),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(provider, subject),
  UNIQUE(provider, user_id)
);
CREATE TABLE IF NOT EXISTS platform_feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
INSERT OR IGNORE INTO platform_feature_flags (key, enabled, updated_at)
VALUES ('PUBLIC_REGISTRATION_ENABLED', 0, 0);
CREATE TABLE IF NOT EXISTS platform_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_audit_time ON platform_audit(created_at);
CREATE INDEX IF NOT EXISTS platform_audit_actor ON platform_audit(actor_id, created_at);
-- Application credentials do not receive routes that rewrite/delete audit history.
