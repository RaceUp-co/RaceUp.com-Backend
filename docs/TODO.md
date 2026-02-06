# TODO - RaceUp Backend API

## En cours

- [ ] Deployer en production sur Cloudflare Workers
  - [ ] Creer la base D1 distante (`wrangler d1 create raceup-db`)
  - [ ] Reporter le `database_id` dans `wrangler.toml`
  - [ ] Configurer le secret JWT (`wrangler secret put JWT_SECRET`)
  - [ ] Initialiser le schema distant (`npm run db:init:remote`)
  - [ ] Deployer (`npm run deploy`)

## Priorite haute

- [ ] Ajouter un endpoint `GET /api/auth/me` pour recuperer le profil utilisateur connecte
- [ ] Ajouter un endpoint `PUT /api/auth/password` pour changer le mot de passe
- [ ] Configurer un custom domain Cloudflare pour l'API (ex: `api.race-up.net`)
- [ ] Mettre en place des tests automatises (vitest + miniflare)

## Priorite moyenne

- [ ] Ajouter un systeme de rate limiting (via D1 ou passage au plan Workers Paid)
- [ ] Ajouter la verification email (envoi d'un lien de confirmation a l'inscription)
- [ ] Ajouter la fonctionnalite "mot de passe oublie" (reset par email)
- [ ] Logger les evenements de securite (tentatives de login echouees, suppressions de compte)
- [ ] Ajouter des headers de securite supplementaires (X-Content-Type-Options, X-Frame-Options)

## Priorite basse

- [ ] Ajouter le support OAuth (Google, GitHub) comme methode de connexion alternative
- [ ] Mettre en place un systeme de roles/permissions (admin, user)
- [ ] Ajouter la pagination pour les futures routes de listing
- [ ] Creer un endpoint d'admin pour lister/gerer les utilisateurs
- [ ] Ajouter des metriques et monitoring (Cloudflare Analytics)

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
