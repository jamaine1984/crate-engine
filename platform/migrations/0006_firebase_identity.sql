-- Firebase Authentication handles passwords, email verification, resets and Google sign-in.
-- A verified Firebase user (uid) links to exactly one platform account; roles, sessions and MFA stay here.
CREATE TABLE IF NOT EXISTS platform_firebase_accounts (
  uid TEXT PRIMARY KEY CHECK (length(uid) BETWEEN 1 AND 128),
  user_id TEXT NOT NULL UNIQUE REFERENCES platform_users(id),
  sign_in_provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
