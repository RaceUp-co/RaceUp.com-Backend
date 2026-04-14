-- Migration 007 : Table cookie_consents
-- Preuve legale RGPD/CNIL (historique immuable)

CREATE TABLE IF NOT EXISTS cookie_consents (
  id TEXT PRIMARY KEY,
  consent_id TEXT NOT NULL,
  user_id TEXT,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  country TEXT,

  necessary INTEGER NOT NULL DEFAULT 1,
  functional INTEGER NOT NULL,
  analytics INTEGER NOT NULL,
  marketing INTEGER NOT NULL,

  policy_version TEXT NOT NULL,
  consent_method TEXT NOT NULL,
  source_url TEXT,

  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  withdrawn_at TEXT,
  withdrawn_reason TEXT,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_consents_consent_id ON cookie_consents(consent_id);
CREATE INDEX IF NOT EXISTS idx_consents_user_id ON cookie_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_consents_created_at ON cookie_consents(created_at);
CREATE INDEX IF NOT EXISTS idx_consents_policy_version ON cookie_consents(policy_version);
CREATE INDEX IF NOT EXISTS idx_consents_expires_at ON cookie_consents(expires_at);
