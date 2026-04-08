# TODO - RaceUp Backend API

## En cours

- [ ] Deployer en production sur Cloudflare Workers
  - [ ] Creer la base D1 distante (`wrangler d1 create raceup-db`)
  - [ ] Reporter le `database_id` dans `wrangler.toml`
  - [ ] Configurer le secret JWT (`wrangler secret put JWT_SECRET`)
  - [ ] Initialiser le schema distant (`npm run db:init:remote`)
  - [ ] Appliquer la migration security_events (`npx wrangler d1 execute RaceUp-User-Data --file=db/migrations/006-security-events.sql`)
  - [ ] Deployer (`npm run deploy`)

## Priorite haute

- [ ] Configurer un custom domain Cloudflare pour l'API (ex: `api.raceup.com`)
- [ ] Mettre en place des tests automatises (vitest + miniflare)

## Priorite moyenne

- [ ] Ajouter un systeme de rate limiting (via D1 ou passage au plan Workers Paid)
- [ ] Ajouter la verification email (envoi d'un lien de confirmation a l'inscription)
- [ ] Ajouter la fonctionnalite "mot de passe oublie" (reset par email)

## Priorite basse

- [ ] Ajouter le support OAuth (Google, GitHub) comme methode de connexion alternative
- [ ] Ajouter des metriques et monitoring (Cloudflare Analytics)

## Dashboard - Fonctionnalites futures

- [ ] Systeme de feature flags pour activer/desactiver des routes API (table D1 + middleware check). Ajouter un onglet "Configuration" dans le dashboard.
- [ ] Systeme de cles API (generation, revocation, rate limiting par cle). Table D1 `api_keys` + middleware d'authentification par cle.
- [ ] Migrer le stockage des request_logs de D1 vers Cloudflare Analytics Engine (quand le volume de trafic le justifiera). Raison : D1 suffit pour un trafic modere mais Analytics Engine est concu pour les metriques haute frequence et ne surcharge pas la DB.
- [ ] Ajouter une vue des security_events dans le dashboard (filtre par type, date, user)

## Fait

- [x] Structure du projet (Hono + TypeScript + D1)
- [x] Schema de base de donnees (users + refresh_tokens)
- [x] Service de hachage de mot de passe (PBKDF2-SHA-256)
- [x] Service de gestion de tokens (JWT access + refresh opaque)
- [x] Service CRUD utilisateur (D1)
- [x] Validation des entrees (Zod)
- [x] Middleware d'authentification JWT
- [x] Endpoint `POST /api/auth/register`
- [x] Endpoint `POST /api/auth/login`
- [x] Endpoint `POST /api/auth/refresh` (avec rotation)
- [x] Endpoint `POST /api/auth/logout`
- [x] Endpoint `DELETE /api/auth/account`
- [x] Endpoint `GET /api/health`
- [x] Configuration CORS (race-up.net + localhost dev)
- [x] Gestion d'erreur globale + 404
- [x] Endpoint `GET /api/auth/me` pour recuperer le profil utilisateur connecte
- [x] Endpoint `POST /api/auth/change-password` pour changer le mot de passe
- [x] Headers de securite supplementaires (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy)
- [x] Logger les evenements de securite (login echoues, suppressions de compte, changements de role) — table `security_events`
- [x] Pagination pour les routes de listing admin (projets)
- [x] Endpoint admin pour lister/gerer les utilisateurs
- [x] Systeme de roles/permissions (admin, super_admin) avec gestion via dashboard
- [x] Dashboard: gestion complete des utilisateurs (edition profil, changement role, suppression avec confirmation)
- [x] Dashboard: edition complete des projets (tous les attributs)
- [x] Dashboard: vue projets archives + restauration
- [x] Dashboard: schema MPD visuel de la base de donnees (SVG interactif)
- [x] API: `PATCH /api/admin/projects/:id` pour modifier un projet
- [x] API: `DELETE /api/admin/users/:id` pour supprimer un utilisateur (super_admin)
