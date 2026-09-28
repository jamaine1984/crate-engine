-- Whole small games drawn as vector art need more than 4,096 output tokens.
-- SQLite cannot change a CHECK constraint in place, so the reservation table is
-- rebuilt with the new ceiling (32,768 per request). Nothing references it, and
-- every existing row is copied unchanged.
PRAGMA defer_foreign_keys = true;
CREATE TABLE platform_model_requests_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_users(id),
  request_id TEXT NOT NULL,
  connection_id TEXT REFERENCES platform_model_connections(id) ON DELETE SET NULL,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','billing_unknown')),
  reserved_output_tokens INTEGER NOT NULL CHECK (reserved_output_tokens >= 128 AND reserved_output_tokens <= 32768),
  response_json TEXT,
  error_code TEXT,
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE(user_id,request_id)
);
INSERT INTO platform_model_requests_v2(id,user_id,request_id,connection_id,input_hash,status,reserved_output_tokens,response_json,error_code,input_tokens,output_tokens,created_at,finished_at)
  SELECT id,user_id,request_id,connection_id,input_hash,status,reserved_output_tokens,response_json,error_code,input_tokens,output_tokens,created_at,finished_at FROM platform_model_requests;
DROP TABLE platform_model_requests;
ALTER TABLE platform_model_requests_v2 RENAME TO platform_model_requests;
CREATE INDEX IF NOT EXISTS platform_model_requests_user_time ON platform_model_requests(user_id,created_at);
