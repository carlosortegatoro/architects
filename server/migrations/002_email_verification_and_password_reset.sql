ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMPTZ,
  ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;

-- Accounts created before email verification existed must keep working.
UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

CREATE TABLE auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_tokens_user_purpose ON auth_tokens(user_id, purpose, created_at DESC);
CREATE INDEX idx_auth_tokens_expires_at ON auth_tokens(expires_at);
