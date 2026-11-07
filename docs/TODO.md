# TODO - RaceUp Backend API

## En cours

- [ ] Redeployer l'API apres le module emails (`npm run deploy`). Le code et la migration 010
      sont prets, et les secrets `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` et
      `STRIPE_WEBHOOK_SECRET` sont deja poses sur le Worker.

  Note : l'infrastructure est deja en production (Workers `raceup` + `raceup-backend-api`,
  base D1 `RaceUp-User-Data` migree jusqu'a 010, buckets R2). L'ancienne liste de mise en
  place initiale de cette section etait obsolete.

## Priorite haute

- [ ] Activer le paiement en ligne : poser `STRIPE_SECRET_KEY` (`npx wrangler secret put STRIPE_SECRET_KEY`). Le webhook Stripe de test et `STRIPE_WEBHOOK_SECRET` sont deja en place ; pour la production, `npm run stripe:setup` avec la cle live refait les deux
- [ ] Configurer un custom domain Cloudflare pour l'API (ex: `api.raceup.com`)
- [ ] Mettre en place des tests automatises (vitest + miniflare)

## Priorite moyenne

- [ ] Traiter les emails entrants de l'inbox Resend `support@race-up.net` (webhook `inbox.email.received` → rattacher la reponse au ticket support correspondant)
- [ ] Suppression automatique des contacts en rebond dur (table de suppression Resend) pour ne pas degrader la reputation d'envoi


## Priorite basse

- [ ] Ajouter le support OAuth (Google, GitHub) comme methode de connexion alternative
- [ ] Ajouter des metriques et monitoring (Cloudflare Analytics)

## Paiements - evolutions

- [ ] Abonnement de maintenance mensuel (Stripe Billing) en complement du module "Maintenance 12 mois"
- [ ] Bouton "Rembourser" dans le dashboard (aujourd'hui : depuis le dashboard Stripe, statut synchronise par webhook)

## Dashboard - Fonctionnalites futures

- [ ] Systeme de feature flags pour activer/desactiver des routes API (table D1 + middleware check). Ajouter un onglet "Configuration" dans le dashboard.
- [ ] Systeme de cles API (generation, revocation, rate limiting par cle). Table D1 `api_keys` + middleware d'authentification par cle.
- [ ] Migrer le stockage des request_logs de D1 vers Cloudflare Analytics Engine (quand le volume de trafic le justifiera). Raison : D1 suffit pour un trafic modere mais Analytics Engine est concu pour les metriques haute frequence et ne surcharge pas la DB.
- [ ] Ajouter une vue des security_events dans le dashboard (filtre par type, date, user)

## Fait

- [x] Avis clients : table + routes publiques/client/admin (migration 011). Le front appelait
      `/api/reviews/*` depuis des mois alors qu'aucune route n'existait : le carrousel de
      temoignages, l'onglet Avis de l'espace client et l'onglet admin tombaient tous en 404.

- [x] Emails transactionnels Resend : domaine `race-up.net` verifie (DKIM/SPF/DMARC sur Cloudflare), 25 gabarits bilingues, journal de livraison + webhook Svix, page `/dashboard/emails` (migration 010)
- [x] Verification d'email non bloquante (exigee pour payer uniquement), mot de passe oublie, `PATCH /api/auth/me`, `change-password`, `change-email` + confirmation
- [x] Email au client quand une echeance est demandee
- [x] Notifications internes vers `raceup.co@gmail.com` a chaque commande, echec, remboursement, demande de support et inscription (reply-to = client)
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
- [x] Paiements Stripe Checkout : acompte 40 % (configurateur), echeances, webhook signe, factures, remboursements synchronises (migration 009)
- [x] `GET /api/admin/purchases` + CA reel dans `/dashboard/overview`
- [x] Dashboard : page Paiements + demande/annulation d'echeance depuis la fiche projet
- [x] Support : categorie `quote_request` (demandes de devis de la page contact)
- [x] Securite : XSS stockee du dashboard corrigee (cellules echappees par defaut), rate limiting par IP (Workers Rate Limiting), CORS resserre, login dashboard sans texte arbitraire, middleware super_admin limite a /database, Hono mis a jour (advisories)
- [x] Migration 006 (security_events) appliquee en production
