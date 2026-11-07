# RaceUp.com-Backend — Knowledge Pack API

> Hono + TypeScript | Cloudflare Workers + D1 (SQLite) + R2 (fichiers)
> URL: raceup-backend-api.jacqueslucas-m2101.workers.dev

## ⚡ Protocole d'efficacité tokens (lire en premier)

Ce fichier est ta **carte**. Sers-t'en pour aller droit au but au lieu d'explorer.

1. **Ne jamais lire/scanner** : `node_modules/`, `.wrangler/`, `dist/`, `package-lock.json`. Aucune valeur, coût énorme.
2. **Localise via cette carte** (sections Architecture / Routes / Schema) **avant** tout Glob/Grep. La réponse est presque toujours déjà ici.
3. **Lis ciblé** : `offset`/`limit` sur les gros fichiers, Grep le symbole précis plutôt que lire un fichier entier.
4. **Détail exhaustif** → `docs/architecture.md` (source de vérité), à lire **à la demande seulement**, jamais par défaut.
5. **Ne relis pas** un fichier déjà lu/édité dans la session (le harness suit l'état).
6. **Réutilise** les services/validators/middlewares listés ci-dessous — ne réécris pas ce qui existe.
7. Va à l'essentiel : pas de récap inutile, réponses concises.

## Consignes

- Mettre a jour `docs/architecture.md` a chaque modification (routes, tables, logique metier)
- Securiser tous les endpoints admin cote backend
- Pagination + filtrage pour toute nouvelle fonctionnalite
- Commenter brievement tout bloc complexe
- Migrations SQL dans `db/migrations/`, appliquees via Wrangler

## Conventions de commit (IMPORTANT)

- **Commits groupés par thème** : ne jamais tout committer en un seul bloc. Découper en plusieurs commits atomiques, **un par thème fonctionnel** (ex : un commit pour une route + son validator + sa doc, un autre pour une migration, un autre pour le dashboard…). Même sur un gros changeset, séparer par sujet.
- **Format conventionnel** : préfixer le message — `feat:` (fonctionnalité), `fix:` (correctif), `refactor:`, `docs:`, `style:`, `chore:`, `perf:`, `test:`.
- **Jamais de co-auteur** : message simple et conventionnel, **sans** ligne `Co-Authored-By` ni mention d'un outil/IA.

## Stack

- Hono 4.7+, Zod 3.24+ (@hono/zod-validator), TypeScript 5.7+, Stripe SDK 22 (API `2026-03-25.dahlia`, client fetch + SubtleCrypto)
- Cloudflare Workers (wrangler 4.0+)
- D1 Database: `RaceUp-User-Data` (SQLite)
- R2 Bucket: `raceup-project-files`
- Secrets: `JWT_SECRET` (signature JWT) + `CONSENT_SALT` (hash IP RGPD) + `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (optionnels : sans eux paiement désactivé) + `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` (optionnels : sans eux emails désactivés proprement) — via `wrangler secret put` (Stripe : `npm run stripe:setup`)
- Emails: **Resend** (API REST en `fetch`, pas de SDK). Domaine d'envoi vérifié `race-up.net` (DKIM/SPF/DMARC sur Cloudflare). ⚠️ Impossible d'envoyer depuis `@gmail.com` (Google n'autorise pas DKIM/SPF sur son domaine) — `raceup.co@gmail.com` est **destinataire** des notifications internes, pas expéditeur

## Architecture Fichiers

```
src/
├── index.ts              Point d'entree, security headers, CORS, error handlers
├── types.ts              Bindings, Variables, User, Project, Ticket, etc.
├── routes/
│   ├── auth.ts           Auth endpoints (register, login, OAuth, refresh, me, logout, delete) + security logging
│   ├── projects.ts       CRUD projets + tickets + fichiers
│   ├── admin.ts          Dashboard stats + gestion users/projects (CRUD+delete+patch) + support tickets + security logging
│   ├── support.ts        Support ticket endpoint (public POST)
│   ├── tracking.ts       Page views (public)
│   ├── consent.ts        Consentement cookies RGPD (post, status, policy, withdraw, my-consents)
│   ├── maintenance.ts    Statut mode maintenance (GET public)
│   ├── payments.ts       Paiements Stripe (config, checkout acompte, statut, commandes, échéances, webhook)
│   └── emails.ts         Webhook Resend : statuts de livraison (signature Svix vérifiée en WebCrypto)
├── emails/               Gabarits d'emails (HTML inline + version texte, bilingues fr/en)
│   ├── layout.ts         renderEmail() + helpers (esc, table, button, callout, textBlock)
│   ├── auth.ts           Bienvenue/vérification, mot de passe, alertes sécurité, inscription (interne)
│   ├── orders.ts         Reçu, en traitement, échec, remboursement, échéance (+ 3 internes)
│   ├── support.ts        Accusé de réception, alerte interne (reply-to demandeur), clôture
│   └── projects.ts       Projet ouvert, livrable déposé, réponse ticket, projet terminé
├── data/
│   └── catalog.ts        Catalogue tarifaire du configurateur — SOURCE DE VÉRITÉ des prix (miroir front : src/data/pricing-catalog.ts)
├── dashboard/
│   ├── styles.ts             CSS template string
│   ├── session.ts            HMAC cookie sign/verify/middleware
│   ├── layout.tsx            HTML layout (head, sidebar, main) + LoginLayout
│   ├── components/
│   │   ├── nav.tsx           Sidebar navigation
│   │   ├── stat-card.tsx     Stat card (value + delta)
│   │   ├── table.tsx         Reusable DataTable + Pagination
│   │   ├── payments.tsx      OrdersTable (JSX échappé), badges statut, suggestNextMilestone (40/40/20)
│   │   └── chart.tsx         SVG BarChart
│   └── routes/
│       ├── auth.tsx          Login/logout pages
│       ├── overview.tsx      Stats, charts, top endpoints
│       ├── logs.tsx          Request logs with filters
│       ├── errors.tsx        Error list + grouped view
│       ├── users.tsx         User list, detail, edit profile, role mgmt, delete with confirmation
│       ├── projects.tsx      Project list (active+archived), detail (+ paiements + demande d'échéance), edit all fields, archive/restore
│       ├── payments.tsx      Paiements : stats encaissement, liste filtrable, demande/annulation d'échéance
│       ├── database.tsx      MPD schema (SVG), tables explorer, SQL query (super_admin)
│       ├── docs.tsx          API documentation + tester
│       ├── config.tsx        Placeholder
│       ├── consent.tsx       Consentements RGPD (liste, filtres, stats, graphiques, repartitions, registre, export CSV/JSON, withdraw)
│       └── emails.tsx        Journal des emails : taux de livraison, rebonds, filtres (statut/gabarit/destinataire)
├── middleware/
│   ├── auth.ts           Bearer JWT verification → injecte jwtPayload
│   ├── admin.ts          Role check (admin/super_admin) → injecte currentUser
│   ├── logger.ts         Request logging → D1 request_logs (fire-and-forget)
│   └── rate-limit.ts     rateLimit(limiter, scope) : 429 RATE_LIMITED par IP (AUTH 10/min, FORMS 5/min)
├── services/
│   ├── password.ts       PBKDF2-SHA-256 hash + timing-safe verify
│   ├── token.ts          JWT HS256 (access) + opaque 64-byte (refresh) + SHA-256 hash
│   ├── user.ts           CRUD users + refresh tokens D1
│   ├── project.ts        CRUD projets (create, get, rename, archive/soft-delete)
│   ├── ticket.ts         CRUD tickets + messages
│   ├── file.ts           CRUD fichiers metadata D1 + helpers R2
│   ├── analytics.ts      Stats admin (inscriptions, pages vues, dashboard overview)
│   ├── security.ts       Security event logging → D1 security_events (fire-and-forget)
│   ├── oauth.ts          Verification Google (userinfo API) + Apple (JWKS RS256)
│   ├── cookies.ts        Cookie HttpOnly raceup_session (refresh token)
│   ├── support.ts        CRUD support tickets (create, list, getById, close)
│   ├── consent.ts        Consentement RGPD (create, getCurrent, withdraw, list, stats, timeSeries, breakdown, exportCsv, exportJson)
│   ├── maintenance.ts    Etat maintenance (get/set + isMaintenanceActive fenetre horaire)
│   ├── order.ts          CRUD orders + transitions idempotentes (fulfillOrder = batch UPDATE + INSERT OR IGNORE projet) + stats + toPublicOrder
│   ├── payment.ts        Orchestration Stripe : createDepositCheckout, createMilestoneCheckout, syncCheckoutSession, handleChargeRefunded
│   ├── stripe.ts         getStripe (Workers), constructWebhookEvent, isPaymentsEnabled, getOrCreateStripeCustomer
│   ├── email.ts          sendEmail (Resend) + journal email_deliveries + listEmailDeliveries/getEmailStats
│   ├── email-token.ts    Jetons email à usage unique (SHA-256, verrou sur used_at) + markEmailVerified
│   └── notify.ts         **Point d'entrée des emails** : les routes appellent notifyX(), jamais sendEmail
├── validators/
│   ├── auth.ts           Schemas Zod (register, login, OAuth)
│   ├── admin.ts          Schemas Zod (projets, role update)
│   ├── support.ts        Schemas Zod (support ticket creation, filters)
│   ├── consent.ts        Schemas Zod (consent input, withdraw, status query)
│   └── payments.ts       Schemas Zod paiements + validationHook (erreurs au format standard)
├── utils/
│   ├── hash.ts           hashIP (SHA-256 + sel CONSENT_SALT, RGPD) + getClientIP (headers CF)
│   ├── origins.ts        Origines du site : isCorsAllowedOrigin (CORS) + resolveSiteOrigin (retour Stripe)
│   ├── money.ts          formatEuros / formatFileSize (partagé paiements + emails)
│   └── background.ts     background(c, task) : envoi après la réponse HTTP (executionCtx.waitUntil)
scripts/
└── stripe-setup.mjs      npm run stripe:setup : webhook Stripe + secrets wrangler (saisie masquée)
db/
├── schema.sql            Tables initiales
└── migrations/           Evolutions schema (appliquees via wrangler d1 execute)
    ├── 006-security-events.sql  Table security_events + index
    ├── 007-cookie-consents.sql  Table cookie_consents (preuve RGPD) + index
    ├── 008-maintenance.sql      Table maintenance_state (mono-ligne, mode maintenance)
    ├── 009-orders.sql           Tables orders (paiements Stripe) + stripe_customers
    └── 010-emails.sql           users.email_verified_at + tables email_tokens, email_deliveries
docs/
├── architecture.md       Documentation complete (source de verite)
└── TODO.md               Roadmap
```

## Routes API

### Auth `/api/auth` (public sauf indique)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /register | - | Cree compte (email, password, username, first_name, last_name) |
| POST | /login | - | Connexion email/password |
| POST | /google | - | OAuth Google (access_token) |
| POST | /apple | - | OAuth Apple (id_token, first_name?, last_name?) |
| POST | /refresh | - | Renouvelle tokens (rotation: ancien invalide) |
| POST | /refresh-session | - | Refresh via cookie HttpOnly |
| GET | /me | JWT | Profil utilisateur courant |
| PATCH | /me | JWT | Update profil (first_name, last_name, username, birth_date) |
| POST | /change-password | JWT | Changer mot de passe |
| POST | /change-email | JWT | Demande de changement d'email (mot de passe requis -> lien vers la nouvelle adresse) |
| POST | /change-email/confirm | - | Applique le changement via le jeton |
| POST | /verify-email | - | Confirme l'adresse via le jeton |
| POST | /verify-email/resend | JWT | Renvoie un lien (max 3/h par compte) |
| POST | /forgot-password | - | Demande un lien de reset (réponse TOUJOURS identique : anti-énumération) |
| POST | /reset-password | - | Applique le nouveau mot de passe (révoque toutes les sessions) |
| POST | /logout | JWT | Supprime tous refresh tokens + cookie |
| DELETE | /account | JWT | Supprime compte (cascade: projets, tickets, fichiers, tokens) |

### Projects `/api/projects` (JWT requis)

| Method | Route | Description |
|--------|-------|-------------|
| POST | / | Cree projet (service_type, name, tier?) |
| GET | / | Liste projets user (non archives) |
| GET | /:id | Detail projet (owner ou admin) |
| PATCH | /:id | Renomme (name) |
| DELETE | /:id | **Soft delete** (is_archived=1) |

### Tickets `/api/projects/:id/tickets` (JWT + acces projet)

| Method | Route | Description |
|--------|-------|-------------|
| GET | / | Liste tickets (avec messages_count) |
| POST | / | Cree ticket + 1er message (subject, message) |
| GET | /:ticketId | Detail + messages (avec author_name, author_role) |
| PATCH | /:ticketId | Change status (open/resolved) |
| POST | /:ticketId/messages | Ajoute message (content) |

### Files `/api/projects/:id/files` (JWT + acces projet)

| Method | Route | Description |
|--------|-------|-------------|
| GET | / | Liste fichiers |
| POST | / | Upload (multipart) — max 25Mo/fichier, 100Mo/projet (non-admin) |
| GET | /:fileId/download | Telecharge depuis R2 |
| DELETE | /:fileId | Supprime R2 + D1 |

MIME autorises: PDF, PNG, JPG, WEBP, GIF, ZIP, RAR, 7Z, DOC(X), XLS(X), TXT, CSV
R2 key: `projects/{projectId}/{uuid}.ext`

### Admin `/api/admin` (JWT + role admin/super_admin)

| Method | Route | Description |
|--------|-------|-------------|
| GET | /dashboard/overview | Stats: totalUsers, totalProjects, activeProjects, totalRevenue, pendingPurchases |
| GET | /dashboard/signups?days=30 | Inscriptions/jour (time series) |
| GET | /dashboard/visits?days=30 | Pages vues/jour (time series) |
| GET | /users?q=&page=1&limit=50 | Liste users (search, pagination, project_count) |
| GET | /users/:id | Detail user + ses projets non archives |
| PATCH | /users/:id/role | Change role — **super_admin only** (+ security log) |
| DELETE | /users/:id | Supprimer user — **super_admin only** (+ R2 cleanup + security log) |
| GET | /projects?status=&page=1&limit=50&archived=0\|1 | Projets avec pagination et filtres |
| POST | /projects | Cree projet pour un user (user_id, name, service_type, start_date...) |
| PATCH | /projects/:id | Modifier un projet (tous les attributs editables) |
| GET | /purchases?status=&page=1&limit=50 | Paiements clients paginés (customer_email inclus) |

### Paiements `/api/payments`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /config | - | `{enabled, deposit_rate}` (front : paiement ou devis) |
| POST | /checkout | JWT | Acompte 40 % (service_type, base, options[], expected_total, lang, accept_terms:true) → `{url, order_id}` |
| GET | /checkout/:sessionId | JWT | Statut pour la page de confirmation (sync Stripe, proprio ou admin) |
| GET | /orders?project_id= | JWT | Paiements visibles du user |
| POST | /orders/:id/checkout | JWT | Régler une échéance → `{url}` |
| POST | /webhook | Signature Stripe | checkout.session.(completed/async_payment_succeeded/async_payment_failed/expired), charge.refunded |

Erreurs : `PAYMENTS_UNAVAILABLE`(503), `INVALID_CONFIGURATION`(400), `TERMS_NOT_ACCEPTED`(400), `PRICE_MISMATCH`(409), `INVALID_STATE`/`ALREADY_PAID`(409), `PAYMENT_PROVIDER_ERROR`(502), `INVALID_SIGNATURE`(400).
Prix TOUJOURS recalculés serveur (`data/catalog.ts`). Confirmation idempotente (webhook + page de confirmation). Détail : `docs/architecture.md` § Paiements Stripe.

### Support `/api/support` (public)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | / | - | Cree un ticket support (email, name, category, message, metadata?) — catégorie `quote_request` = demande de devis (priorité urgent, metadata company/service/budget/configuration) |

### Admin Support `/api/admin/support-tickets` (JWT + admin)

| Method | Route | Description |
|--------|-------|-------------|
| GET | /?status=&category=&priority=&page=1&limit=20 | Liste tickets (filtres + pagination) |
| GET | /:id | Detail ticket |
| PATCH | /:id | Fermer ticket (status: closed) |

### Tracking `/api/track` (public)

| Method | Route | Description |
|--------|-------|-------------|
| POST | /pageview | Enregistre page vue (path, referrer?, user_agent, country CF) |

### Consent / RGPD `/api/consent`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | / | JWT optionnel | Enregistre un consentement (categories, policy_version, consent_method). Bearer présent → lié au user_id. Requiert `CONSENT_SALT` |
| GET | /status?consent_id= | - | Validité d'un consent + catégories (raisons: not_found/withdrawn/outdated_policy/expired) |
| GET | /policy | - | Version politique courante + description des 4 catégories |
| POST | /withdraw | - | Retrait d'un consentement (consent_id, reason?) — preuve conservée |
| GET | /my-consents | JWT | Droit d'accès RGPD : liste les consents du user connecté |

`categories`: { functional, analytics, marketing } (necessary toujours vrai). `consent_method`: accept_all | reject_all | custom. Durée ~13 mois. IP **jamais en clair** (hash SHA-256 + sel).

### Maintenance `/api/maintenance` (public)

| Method | Route | Description |
|--------|-------|-------------|
| GET | / | Statut effectif `{active, is_enabled, starts_at, ends_at, message}` — toujours 200, front fail-open |

`active` = `is_enabled` ET dans la fenetre `[starts_at, ends_at]` (bornes nullables). Edite via `/dashboard/config`.

### Health

| GET | /api/health | `{status:"ok", timestamp}` |

### Dashboard `/dashboard` (Cookie session HMAC, admin/super_admin)

| Method | Route | Description |
|--------|-------|-------------|
| GET | /login | Page de connexion |
| POST | /login | Authentification (email, password) → cookie HMAC |
| GET | /logout | Deconnexion (supprime cookie) |
| GET | / | Overview — stats, graphiques, top endpoints |
| GET | /logs | Request logs — filtres, pagination |
| GET | /errors | Erreurs — vue liste et groupee |
| GET | /users | Liste utilisateurs — recherche, filtre role, pagination |
| GET | /users/:id | Detail utilisateur + edition profil + projets + logs |
| POST | /users/:id/edit | Modifier profil utilisateur |
| POST | /users/:id/role | Changer role (super_admin only) |
| GET | /users/:id/delete | Page confirmation suppression (super_admin only) |
| POST | /users/:id/delete | Supprimer utilisateur hard delete + R2 (super_admin only) |
| GET | /projects | Liste projets actifs/archives — filtre status, pagination |
| GET | /projects/:id | Detail projet + edition tous attributs + tickets + fichiers |
| POST | /projects/:id/edit | Modifier projet (tous les champs) |
| POST | /projects/:id/archive | Archiver projet |
| POST | /projects/:id/restore | Restaurer projet archive |
| POST | /projects/:id/payments | Demander une échéance au client (libellé + montant, pré-rempli 40/20 %) |
| GET | /payments | Paiements : stats (CA, 30 j, à encaisser, remboursé) + liste filtrable |
| POST | /payments/:id/cancel | Annuler une échéance payable |
| GET | /database?tab=schema | Schema MPD visuel SVG (super_admin only) |
| GET | /database?tab=tables | Tables explorer + structure + FK + index (super_admin only) |
| GET | /database?tab=query | Interface requete SQL (super_admin only) |
| POST | /database/query | Executer SQL (super_admin only) |
| GET | /docs | Documentation API + testeur integre |
| GET | /config | Mode maintenance — formulaire (interrupteur + dates debut/fin + message) |
| POST | /config/maintenance | Enregistre l'etat de maintenance (validation fin > debut) |
| GET | /consent | Consentements RGPD — liste + stats + graphiques (serie temporelle, top pays, categories %) + repartitions (actifs/retires/expires) + filtres (dont country) |
| GET | /consent/search | Recherche par consent_id (historique des versions) |
| GET | /consent/export | Export CSV (streaming) |
| GET | /consent/export-json | Export JSON (streaming, usage interne/audit RGPD) |
| GET | /consent/register | Registre RGPD presentable (synthese conformite pour controle CNIL) |
| GET | /consent/:id | Detail d'un consentement + historique |
| POST | /consent/:id/withdraw | Retirer un consentement |

**Auth**: Cookie HMAC-SHA256 signe (`dashboard_session`), HttpOnly, Secure(prod), SameSite=Strict, 2h expiry.
**Middleware chain**: Security headers → `loggerMiddleware` → `dashboardAuthMiddleware` → route handler (+ `superAdminDashboardMiddleware` pour /database).
**Rendering**: Hono JSX SSR (server-side), pas de framework frontend.

## Database Schema D1

```sql
users (id PK, email UNIQUE, password_hash, username UNIQUE, first_name, last_name,
       birth_date?, auth_provider['email'|'google'|'apple'], role['user'|'admin'|'super_admin'],
       email_verified_at?, created_at, updated_at)
  IDX: email, username, role

refresh_tokens (id PK, user_id FK→users CASCADE, token_hash, expires_at, created_at)
  IDX: user_id, token_hash

projects (id PK, user_id FK→users CASCADE, name, description, status['in_progress'|'completed'|'paused'],
          service_type, tier?, start_date, end_date?, progress[0-100], last_update?,
          deliverables_url?, is_archived[0|1], created_by['user'|'admin'], created_at, updated_at)
  IDX: user_id, status

tickets (id PK, project_id FK→projects CASCADE, subject, status['open'|'resolved'],
         created_by FK→users, created_at, updated_at)

ticket_messages (id PK, ticket_id FK→tickets CASCADE, author_id FK→users, content, created_at)

project_files (id PK, project_id FK→projects CASCADE, uploaded_by FK→users,
               filename, original_filename, file_size, mime_type, r2_key, created_at)

page_views (id AUTOINCREMENT, path, referrer?, user_agent?, country?, created_at)
  IDX: created_at, path

request_logs (id AUTOINCREMENT, method, path, status_code, duration_ms, user_id?,
              ip?, country?, user_agent?, error?, created_at)
  IDX: created_at, path, status_code

support_tickets (id PK, email, name, category, priority['urgent'|'normal'|'low'],
                 subject, message, metadata JSON?, status['open'|'closed'],
                 created_at, closed_at?)
  IDX: status, category, priority, created_at

security_events (id AUTOINCREMENT, event_type['login_failed'|'login_success'|'account_deleted'|
                 'role_changed'|'password_changed'|'email_changed'|'admin_user_deleted'],
                 user_id?, target_user_id?, ip?, details?, created_at)
  IDX: created_at, event_type, user_id

cookie_consents (id PK, consent_id, user_id? FK→users SET NULL, ip_hash, user_agent?, country?,
                 necessary[1], functional[0|1], analytics[0|1], marketing[0|1],
                 policy_version, consent_method['accept_all'|'reject_all'|'custom'], source_url?,
                 created_at, expires_at, withdrawn_at?, withdrawn_reason?)  -- preuve immuable RGPD
  IDX: consent_id, user_id, created_at, policy_version, expires_at

maintenance_state (id PK CHECK(id=1), is_enabled[0|1], starts_at?, ends_at?, message?,
                   updated_at?, updated_by?)  -- mono-ligne, mode maintenance du site public

orders (id PK, user_id? FK→users SET NULL, customer_email, customer_name?, project_id?,
        kind['deposit'|'milestone'], service_type?, config? JSON, description, amount_cents,
        project_total_cents?, currency, status['awaiting_payment'|'pending'|'processing'|'paid'|
        'failed'|'expired'|'refunded'|'canceled'], stripe_session_id UNIQUE?, stripe_payment_intent_id?,
        receipt_url?, lang, terms_accepted_at?, created_by['user'|'admin'], created_at, updated_at,
        paid_at?, refunded_at?)  -- registre des paiements (survit à la suppression du compte)
  IDX: session(unique), (user_id, created_at), (status, created_at), project_id, payment_intent

stripe_customers (user_id FK→users CASCADE, livemode[0|1], customer_id UNIQUE, created_at)  PK(user_id, livemode)

email_tokens (id PK, user_id FK→users CASCADE, purpose['email_verification'|'password_reset'|
              'email_change'], token_hash UNIQUE (SHA-256), new_email?, expires_at, used_at?, created_at)
  Usage unique, jamais en clair. TTL : vérif 48h, reset 1h, changement d'email 24h.

email_deliveries (id PK, resend_id UNIQUE?, template, recipient, user_id?, subject,
                  status['sent'|'delivered'|'delivery_delayed'|'bounced'|'complained'|'failed'|'skipped'],
                  error?, created_at, updated_at)  -- pas de FK : survit à la suppression du compte
```

Relations: users 1→N projects 1→N tickets 1→N ticket_messages
                              1→N project_files
           users 1→N refresh_tokens
           page_views: standalone
           support_tickets: standalone (pas de FK vers users)
           cookie_consents: user_id nullable (FK→users SET NULL — consent anonyme possible)

## Patterns importants

**Soft Delete**: projects.is_archived = 0|1. DELETE = UPDATE is_archived=1. Toutes les requetes filtrent `WHERE is_archived = 0`.

**Token Rotation**: Chaque refresh invalide l'ancien token. Refresh tokens stockes haches SHA-256. Jamais en clair.

**Acces Projet**: Owner OU admin/super_admin. Sinon 403.

**Erreurs standardisees**: `{success:false, error:{code:"ERROR_CODE", message:"..."}}`
Codes: UNAUTHORIZED(401), FORBIDDEN(403), NOT_FOUND(404), EMAIL_ALREADY_EXISTS(409), USERNAME_ALREADY_EXISTS(409), INVALID_FILE(400), FILE_TOO_LARGE(400), STORAGE_LIMIT(400)

**Validation Zod**: Tous les inputs valides cote serveur. Password: min 8, 1 maj, 1 min, 1 chiffre. Username: 3-30, alphanum.

**IDs**: UUID v4 (crypto.randomUUID). Timestamps: ISO8601.

**Securite Auth**:
- Access token: JWT HS256, 15min, en memoire client
- Refresh token: 64 bytes opaque, 7 jours, localStorage + cookie HttpOnly
- Cookie: raceup_session, HttpOnly, Secure(prod), SameSite=Lax, domain .raceup.com(prod)
- Password: PBKDF2-SHA-256, 50K iterations, salt 16 bytes, verify timing-safe

**Anti brute-force**: limiteur par IP (Workers Rate Limiting, approximatif) + verrou déterministe par email : 10 échecs / 15 min → 429 (`isLoginLocked`, services/security.ts), partagé API + dashboard. Les échecs de login sont journalisés avec `await` (alimentent le verrou).

**Dashboard anti-XSS**: `DataTable` échappe toute chaîne ; HTML dans une cellule UNIQUEMENT via `html\`...\`` (hono/html, auto-échappement). Jamais de HTML par concaténation (noms de projets, erreurs journalisées, consent_id = données tierces). Login dashboard : `?error=` = codes connus seulement.

**Paiements**: acompte = commande `pending` avec `project_id` réservé → au paiement, batch D1 (`UPDATE orders` conditionnel + `INSERT OR IGNORE INTO projects`) : jamais de projet en double. Échéance = commande `awaiting_payment` créée par un admin, payable depuis l'espace projet. Statuts et flux : `docs/architecture.md` § Paiements Stripe.

**Emails**: les routes appellent `services/notify.ts` (`notifyOrderPaid`, `notifySupportTicket`...), **jamais `sendEmail` directement** — c'est là que vivent le choix du destinataire, la langue et la clé d'idempotence. Envoi **après** la réponse HTTP via `background(c, ...)`. Un email ne doit JAMAIS faire échouer une action métier : tout est capturé, rien n'est propagé. Les emails de paiement sont conditionnés à la réussite de la transition en base (`changes > 0`) **et** portent une clé d'idempotence Resend : le webhook Stripe et la page de confirmation synchronisent la même commande en parallèle, et Stripe rejoue ses événements 3 jours. Les notifications internes portent un `reply_to` sur l'adresse du client. Vérification d'email **non bloquante** sauf pour payer (`403 EMAIL_NOT_VERIFIED`). Détail : `docs/architecture.md` § Emails transactionnels.

**Consent RGPD**: preuve immuable (jamais de DELETE ; le retrait = marquage `withdrawn_at`). IP hachée SHA-256 + sel (`CONSENT_SALT`), jamais en clair. Consent valide si non retiré + non expiré (~13 mois) + `policy_version` à jour. Bump `POLICY_VERSION` → re-consentement forcé.

## Config Wrangler

```toml
name = "raceup-backend-api"
D1: binding=DB, database=RaceUp-User-Data
R2: binding=R2, bucket=raceup-project-files
vars: ENVIRONMENT=production, ACCESS_TOKEN_EXPIRY=900, REFRESH_TOKEN_EXPIRY=604800,
      POLICY_VERSION=v1.0.0, GOOGLE_CLIENT_ID, APPLE_CLIENT_ID,
      SITE_URL=https://race-up.net, STRIPE_INVOICE_CREATION=true
secrets: JWT_SECRET, CONSENT_SALT (hash IP RGPD), STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (optionnels) — via wrangler secret put
ratelimits: AUTH_RATE_LIMITER (10/60s), FORMS_RATE_LIMITER (5/60s) — bindings Workers Rate Limiting
```

## Commandes

```bash
npm run dev               # wrangler dev (localhost:8787)
npm run deploy            # wrangler deploy
npm run db:setup:local    # init + migrations + seed admin (BDD locale)
npm run db:migrate:local  # applique les migrations 002→009 en local
npm run stripe:setup      # active Stripe : webhook + secrets STRIPE_* (clé demandée, saisie masquée)
npx wrangler d1 execute RaceUp-User-Data --file=db/migrations/xxx.sql  # migration manuelle
npx wrangler secret put JWT_SECRET    # secret signature JWT
npx wrangler secret put CONSENT_SALT  # secret hash IP (RGPD)
npx wrangler secret put RESEND_API_KEY        # emails transactionnels (sinon désactivés)
npx wrangler secret put RESEND_WEBHOOK_SECRET # statuts de livraison Resend (Svix)
```
