-- AI app connections: people connect their own AI (Claude, ChatGPT, Cursor and other
-- MCP apps, on a subscription or an API key) to https://<site>/mcp. OAuth 2.1 with PKCE
-- issues tokens bound to that resource; tool calls are relayed to the user's open editor tab.

-- OAuth clients registered through Dynamic Client Registration, or cached Client ID
-- Metadata Documents (client_id is then the document's https URL).
CREATE TABLE IF NOT EXISTS platform_oauth_clients (
  client_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('registered','metadata_document')),
  client_name TEXT NOT NULL,
  client_uri TEXT,
  redirect_uris_json TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none' CHECK (token_endpoint_auth_method IN ('none','client_secret_basic','client_secret_post')),
  client_secret_hash TEXT,
  created_at INTEGER NOT NULL,
  refreshed_at INTEGER NOT NULL
);

-- One-time authorization codes (stored hashed, ten minutes).
CREATE TABLE IF NOT EXISTS platform_oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

-- A grant is one approved AI app for one user. Revoking it kills every token in it.
CREATE TABLE IF NOT EXISTS platform_oauth_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_oauth_grants_user ON platform_oauth_grants(user_id, revoked_at);

-- Access and refresh tokens (hashed). Refresh tokens rotate on every use.
CREATE TABLE IF NOT EXISTS platform_oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES platform_oauth_grants(id),
  kind TEXT NOT NULL CHECK (kind IN ('access','refresh')),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_oauth_tokens_grant ON platform_oauth_tokens(grant_id);

-- The editor tab a user has opened for AI apps. One live link per user.
CREATE TABLE IF NOT EXISTS platform_ai_editor_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL DEFAULT '',
  allow_writes INTEGER NOT NULL DEFAULT 0 CHECK (allow_writes IN (0,1)),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_ai_editor_links_user ON platform_ai_editor_links(user_id, closed_at, last_seen_at DESC);

-- Tool calls waiting for, or answered by, the editor tab.
CREATE TABLE IF NOT EXISTS platform_ai_commands (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES platform_ai_editor_links(id),
  grant_id TEXT NOT NULL,
  command TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','delivered','completed','failed','expired')),
  result_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_ai_commands_link ON platform_ai_commands(link_id, status, created_at);

-- On by default: it costs the platform nothing (people bring their own AI). The owner can pause it.
INSERT OR IGNORE INTO platform_feature_flags(key, enabled, updated_at) VALUES ('AI_APP_CONNECTIONS_ENABLED', 1, 0);
