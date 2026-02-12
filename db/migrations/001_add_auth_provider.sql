-- Migration: Ajoute le support OAuth (Google, Apple)
-- Exécuter avec: wrangler d1 execute RaceUp-User-Data --file=db/migrations/001_add_auth_provider.sql
-- Pour local: wrangler d1 execute RaceUp-User-Data --local --file=db/migrations/001_add_auth_provider.sql

-- Ajoute la colonne auth_provider (email, google, apple)
-- Les utilisateurs existants gardent 'email' par défaut
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'email';
