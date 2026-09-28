-- Separate PLATFORM_DB only. No credentials or model defaults are seeded.
CREATE TABLE IF NOT EXISTS platform_model_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  provider TEXT NOT NULL CHECK (provider IN ('openai','anthropic','openrouter')),
  label TEXT NOT NULL,
  model TEXT NOT NULL,
  key_ciphertext TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_tested_at INTEGER,
  last_test_status TEXT CHECK (last_test_status IN ('verified','failed'))
);
CREATE INDEX IF NOT EXISTS platform_model_connections_user ON platform_model_connections(user_id);

-- A reservation is committed BEFORE a provider request. It is never automatically
-- retried: a timeout or a Worker crash can leave provider billing uncertain.
-- Only the input digest is stored; prompts/scene summaries are not stored here.
CREATE TABLE IF NOT EXISTS platform_model_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  request_id TEXT NOT NULL,
  connection_id TEXT REFERENCES platform_model_connections(id) ON DELETE SET NULL,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','billing_unknown')),
  reserved_output_tokens INTEGER NOT NULL CHECK (reserved_output_tokens >= 128 AND reserved_output_tokens <= 4096),
  response_json TEXT,
  error_code TEXT,
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS platform_model_requests_user_time ON platform_model_requests(user_id,created_at);
INSERT OR IGNORE INTO platform_feature_flags(key,enabled,updated_at) VALUES('ENGINE_AI_ENABLED',0,0);
