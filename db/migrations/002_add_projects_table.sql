-- Migration 002: Table des projets clients
-- Exécuter avec: wrangler d1 execute RaceUp-User-Data --remote --file=db/migrations/002_add_projects_table.sql

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'paused')),
    service_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
    last_update TEXT,
    deliverables_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
