-- Migration 010 : Emails transactionnels (Resend)
--
-- 1. Verification d'adresse email (non bloquante : le compte fonctionne sans, mais le
--    paiement en ligne l'exige -> on ne facture jamais une adresse injoignable).
-- 2. Jetons a usage unique : verification d'email, mot de passe oublie, changement d'email.
--    Seul le HACHE du jeton est stocke (SHA-256) : une fuite de la base ne permet pas de
--    prendre la main sur un compte, exactement comme pour les refresh_tokens.
-- 3. Journal d'envoi : etat de chaque email (livre, rebond, plainte) alimente par le webhook
--    Resend. Permet de voir dans le dashboard qu'un client n'a jamais recu sa facture.

-- ---------- 1. Verification d'email ----------

ALTER TABLE users ADD COLUMN email_verified_at TEXT;

-- Les comptes crees AVANT cette migration sont consideres verifies : ils existaient deja
-- (certains ont deja paye) et il serait absurde de leur bloquer le paiement du jour au
-- lendemain pour une fonctionnalite qui n'existait pas a leur inscription.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- ---------- 2. Jetons email a usage unique ----------

CREATE TABLE IF NOT EXISTS email_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset', 'email_change')),
  token_hash TEXT NOT NULL UNIQUE,
  -- purpose = 'email_change' : adresse demandee, appliquee seulement a la confirmation
  new_email TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Recherche par hache (consommation d'un jeton) et purge des jetons expires
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, purpose, created_at);
CREATE INDEX IF NOT EXISTS idx_email_tokens_expiry ON email_tokens(expires_at);

-- ---------- 3. Journal des envois ----------

CREATE TABLE IF NOT EXISTS email_deliveries (
  id TEXT PRIMARY KEY,               -- id Resend si l'envoi a abouti, sinon UUID local
  resend_id TEXT,                    -- id Resend (NULL si l'appel a echoue)
  template TEXT NOT NULL,            -- ex: 'order_paid', 'password_reset'
  recipient TEXT NOT NULL,
  user_id TEXT,                      -- pas de FK : le journal survit a la suppression du compte
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'skipped')),
  error TEXT,                        -- message d'erreur Resend / raison du rebond
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_created ON email_deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_recipient ON email_deliveries(recipient, created_at);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_status ON email_deliveries(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_deliveries_resend ON email_deliveries(resend_id);
