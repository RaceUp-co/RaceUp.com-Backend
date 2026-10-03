-- Migration 009 : Commandes & paiements Stripe
-- Une ligne = un paiement :
--   - kind = 'deposit'   : acompte de 40 % payé depuis le configurateur d'un service (crée le projet a la confirmation)
--   - kind = 'milestone' : echeance (40 % beta, 20 % mise en ligne...) demandee par un admin sur un projet existant
-- Montants en centimes (INTEGER) pour eviter toute erreur d'arrondi.
-- Registre comptable : les paiements survivent a la suppression du compte (user_id -> NULL,
-- email/nom du client conserves en snapshot). Conservation legale des pieces comptables (10 ans).

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  -- deposit : id du projet RESERVE a la creation, le projet est insere a la confirmation du paiement (idempotent)
  -- milestone : projet existant concerne par l'echeance
  project_id TEXT,
  kind TEXT NOT NULL DEFAULT 'deposit' CHECK (kind IN ('deposit', 'milestone')),
  service_type TEXT,
  config TEXT,                       -- JSON {"base":"...","options":["..."]} (acompte uniquement)
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  project_total_cents INTEGER,       -- prix total du projet (acompte = 40 % de ce montant)
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('awaiting_payment', 'pending', 'processing', 'paid', 'failed', 'expired', 'refunded', 'canceled')),
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  receipt_url TEXT,                  -- facture Stripe (hosted invoice) ou recu de paiement
  lang TEXT NOT NULL DEFAULT 'fr',
  terms_accepted_at TEXT,            -- preuve d'acceptation des CGV (acompte)
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  refunded_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_session ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_project ON orders(project_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent ON orders(stripe_payment_intent_id);

-- Client Stripe associe a un utilisateur (reutilise a chaque paiement :
-- factures, adresse de facturation et moyens de paiement regroupes cote Stripe).
-- livemode distingue les clients de test et de production (un id de test n'existe pas en live).
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id TEXT NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 1,
  customer_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, livemode),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
