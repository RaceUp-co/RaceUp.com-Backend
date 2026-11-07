-- Migration 011 : Avis clients
--
-- Le front appelait deja /api/reviews/* (carrousel de temoignages, onglet Avis de l'espace
-- client, onglet Avis du dashboard admin) alors qu'aucune route ni table n'existait :
-- ces trois ecrans tombaient en 404. Cette migration et les routes associees les reparent.
--
-- Un avis = un client + un projet TERMINE. La contrainte UNIQUE(project_id, user_id) garantit
-- qu'un client ne peut pas empiler plusieurs avis sur le meme projet (le front propose
-- d'ailleurs « modifier » plutot que « creer » quand un avis existe deja).
--
-- is_visible = 0 par defaut : un avis est MODERE avant d'apparaitre sur le site public.
-- Personne ne doit pouvoir publier du texte sur la page d'accueil sans relecture.

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  -- Snapshot au moment de l'avis : la societe et le role du client peuvent changer
  -- ensuite, le temoignage doit rester fidele a ce qui a ete ecrit.
  author_company TEXT NOT NULL,
  author_role TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment_fr TEXT NOT NULL,
  comment_en TEXT,
  link TEXT,                              -- lien externe optionnel (site du client)
  is_visible INTEGER NOT NULL DEFAULT 0,  -- 0 = en attente de moderation
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (project_id, user_id)
);

-- Carrousel public : filtre sur is_visible, trie par date
CREATE INDEX IF NOT EXISTS idx_reviews_visible ON reviews(is_visible, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
