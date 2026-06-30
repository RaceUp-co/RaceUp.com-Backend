-- Migration 008 : Mode maintenance du site officiel
-- Table mono-ligne (id = 1) pilotee depuis le dashboard admin.
-- is_enabled = interrupteur maitre. starts_at / ends_at = fenetre optionnelle (ISO ou datetime-local).
-- Le site est effectivement en maintenance si is_enabled = 1 ET on est dans la fenetre.

CREATE TABLE IF NOT EXISTS maintenance_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_enabled INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  message TEXT,
  updated_at TEXT,
  updated_by TEXT
);

-- Ligne unique par defaut (maintenance desactivee)
INSERT OR IGNORE INTO maintenance_state (id, is_enabled) VALUES (1, 0);
