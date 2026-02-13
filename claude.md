# RaceUp.com-Backend — Consignes Claude Code

Bienvenue sur le backend de RaceUp.net !

**Présentation du projet :**
Ce dossier contient l’API complète du site RaceUp.net, développée en TypeScript et hébergée sur Cloudflare (Workers + D1 Database). L’API gère l’authentification, les utilisateurs, les projets, les statistiques, etc. Le frontend (Next.js) consomme cette API.

**Règles pour Claude Code :**
- À chaque modification de l’architecture (routes, tables, logique métier, endpoints, etc.), tu dois impérativement tenir à jour le fichier `docs/architecture.md`.
- L’API est hébergée sur Cloudflare Workers et utilise D1 comme base de données.
- Les migrations SQL sont dans `db/migrations/` et doivent être appliquées via Wrangler.
- Les tokens JWT incluent le rôle utilisateur (user/admin) et sont utilisés pour sécuriser les endpoints.
- Respecte la structure des fichiers et les conventions existantes.
- Commente brièvement tout bloc complexe ou toute logique métier non triviale.

**À savoir :**
- Les endpoints sont versionnés et documentés dans `docs/architecture.md`.
- Les accès admin doivent toujours être sécurisés côté backend.
- Toute nouvelle fonctionnalité doit être pensée pour la scalabilité (pagination, filtrage, etc.).

Merci de suivre ces consignes pour garantir la cohérence et la maintenabilité du projet.
