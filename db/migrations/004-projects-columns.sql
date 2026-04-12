-- Colonnes manquantes sur la table projects (tier, is_archived, created_by)
ALTER TABLE projects ADD COLUMN tier TEXT;
ALTER TABLE projects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN created_by TEXT NOT NULL DEFAULT 'user';
