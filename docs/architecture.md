# Architecture - RaceUp Backend API

## Vue d'ensemble

API REST pour le site raceup.com, deployee sur Cloudflare Workers avec Cloudflare D1 (base de donnees) et R2 (stockage fichiers).

```
Client (raceup.com)
       |
       | HTTPS
       v
┌──────────────────────────┐
│   Cloudflare Workers     │
│                          │
│  ┌────────────────────┐  │
│  │   Hono Framework   │  │
│  │                    │  │
│  │  Security Headers  │  │
│  │  CORS ─► Routes    │  │
│  │          │         │  │
│  │     Middleware JWT  │  │
│  │          │         │  │
│  │     Services       │  │
│  │   (password,token, │  │
│  │    project,ticket, │  │
│  │    file,analytics, │  │
│  │    security)       │  │
│  └─────────┬──────────┘  │
│            │              │
│  ┌─────────▼──────────┐  │
│  │   Cloudflare D1    │  │
│  │   (SQLite)         │  │
│  └────────────────────┘  │
│            │              │
│  ┌─────────▼──────────┐  │
│  │   Cloudflare R2    │  │
│  │   (Object Storage) │  │
│  └────────────────────┘  │
└──────────────────────────┘
```

## Stack technique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Runtime | Cloudflare Workers (free tier) | Edge computing, 0ms cold start |
| Framework | Hono v4 | Ultra-leger (~14kB), natif Workers |
| BDD | Cloudflare D1 | SQLite manage, gratuit, co-localise |
| Stockage | Cloudflare R2 | S3-compatible, 0 frais d'egress |
| Hachage MDP | PBKDF2-SHA-256 (Web Crypto) | Natif, zero dependance externe |
| JWT | hono/jwt (HS256) | Inclus dans Hono |
| Validation | Zod + @hono/zod-validator | Typage automatique, messages clairs |

**Dependances runtime : 3** — `hono`, `zod`, `@hono/zod-validator`

## Structure des fichiers

```
src/
├── index.ts                 Point d'entree, security headers, CORS, error handlers, montage routes
├── types.ts                 Types TS : Bindings, Variables, AppType, User, Project, Ticket, etc.
├── routes/
│   ├── auth.ts              Endpoints auth : register, login, refresh, logout, delete, me + security logging
│   ├── admin.ts             Endpoints admin : dashboard, users (CRUD+delete), projects (CRUD+patch) + support tickets + consents
│   ├── projects.ts          Endpoints projets : CRUD projets, tickets, fichiers (user auth)
│   ├── support.ts           Endpoints support tickets : creation publique
│   ├── consent.ts           Endpoints consent cookies (public) : POST /api/consent, status, policy, withdraw, my-consents
│   └── tracking.ts          Endpoints tracking : page views (public)
├── dashboard/
│   ├── styles.ts            CSS template string (dark theme monospace)
│   ├── session.ts           HMAC cookie sign/verify + auth middleware
│   ├── layout.tsx           Layout HTML (sidebar + main) + LoginLayout
│   ├── components/
│   │   ├── nav.tsx          Sidebar navigation (liens conditionnels par role)
│   │   ├── stat-card.tsx    Carte statistique (label, value, delta)
│   │   ├── table.tsx        DataTable generique + Pagination
│   │   └── chart.tsx        BarChart SVG inline
│   └── routes/
│       ├── auth.tsx         Login/logout (GET/POST)
│       ├── overview.tsx     Overview: stats, charts, tables
│       ├── logs.tsx         Request logs: filtres, pagination
│       ├── errors.tsx       Erreurs: vue liste + groupee
│       ├── users.tsx        Users: list, detail, edit profil, role change, delete with confirmation
│       ├── projects.tsx     Projects: list (actifs+archives), detail, edit all fields, archive/restore
│       ├── consent.tsx      Consentement: liste filtrable + KPIs, detail + historique, recherche, export CSV, withdraw admin
│       ├── database.tsx     Schema MPD (SVG), tables explorer, SQL query (super_admin)
│       ├── docs.tsx         API docs + testeur fetch()
│       └── config.tsx       Placeholder
├── utils/
│   └── hash.ts              hashIP (SHA-256 + CONSENT_SALT) pour pseudonymiser les IPs dans cookie_consents
├── middleware/
│   ├── auth.ts              Verification Bearer JWT, injection du payload dans le contexte
│   ├── admin.ts             Verification role admin/super_admin
│   └── logger.ts            Request logging → D1 request_logs (fire-and-forget)
├── services/
│   ├── password.ts          hashPassword / verifyPassword (PBKDF2, comparaison timing-safe)
│   ├── token.ts             Generation JWT access + refresh token opaque + hash SHA-256
│   ├── user.ts              CRUD D1 : users + refresh_tokens
│   ├── project.ts           CRUD D1 : projects (create, get, rename, archive)
│   ├── ticket.ts            CRUD D1 : tickets + ticket_messages
│   ├── file.ts              CRUD D1 : project_files (metadata) + R2 storage helpers
│   ├── analytics.ts         Stats admin : inscriptions, pages vues
│   ├── support.ts           CRUD D1 : support_tickets (public, sans FK users)
│   ├── security.ts          Security event logging → D1 security_events (fire-and-forget)
│   ├── oauth.ts             OAuth Google/Apple
│   ├── cookies.ts           Gestion cookies refresh token
│   └── consent.ts           Logique metier consent : create, get, history, withdraw, list, stats, exportCsv (async gen)
└── validators/
    ├── auth.ts              Schemas Zod pour auth
    ├── admin.ts             Schemas Zod pour admin
    ├── support.ts           Schemas Zod pour support tickets
    └── consent.ts           Schemas Zod pour consent (create, withdraw, list filters)

db/
├── schema.sql               Tables: users, refresh_tokens, projects, page_views
└── migrations/
    ├── 002_tickets_files.sql    Tables: tickets, ticket_messages, project_files + colonnes projects
    ├── 002_request_logs.sql     Table: request_logs + index (dashboard monitoring)
    ├── 005-support-tickets.sql  Table: support_tickets + index (system ticketing public)
    ├── 006-security-events.sql  Table: security_events + index (audit logging)
    └── 007-cookie-consents.sql  Table: cookie_consents + index (registre RGPD des consentements)
```

## Schema de base de donnees

```
┌─────────────────────────┐       ┌──────────────────────────────┐
│         users            │       │       refresh_tokens          │
├─────────────────────────┤       ├──────────────────────────────┤
│ id TEXT PK (UUID v4)     │◄──┐  │ id TEXT PK (UUID v4)          │
│ email TEXT UNIQUE         │   │  │ user_id TEXT FK ──────────────┘
│ password_hash TEXT        │   │  │ token_hash TEXT (SHA-256)     │
│ username TEXT UNIQUE      │   │  │ expires_at TEXT               │
│ first_name TEXT           │   │  │ created_at TEXT               │
│ last_name TEXT            │   │  └──────────────────────────────┘
│ birth_date TEXT           │   │
│ auth_provider TEXT        │   │
│ role TEXT                 │   │
│ created_at TEXT           │   │
│ updated_at TEXT           │   │
└─────────────────────────┘   │
          │                    │
          │                    │
┌─────────▼───────────────┐   │
│       projects           │   │
├─────────────────────────┤   │
│ id TEXT PK               │   │
│ user_id TEXT FK ─────────┘   │
│ name TEXT                 │      ┌──────────────────────────────┐
│ description TEXT          │      │       tickets                 │
│ status TEXT               │      ├──────────────────────────────┤
│ service_type TEXT         │◄──┐  │ id TEXT PK                    │
│ tier TEXT                 │   │  │ project_id TEXT FK ───────────┘
│ start_date TEXT           │   │  │ subject TEXT                  │
│ end_date TEXT             │   │  │ status TEXT (open/resolved)   │
│ progress INTEGER          │   │  │ created_by TEXT FK → users    │
│ last_update TEXT          │   │  │ created_at TEXT               │
│ deliverables_url TEXT     │   │  │ updated_at TEXT               │
│ is_archived INTEGER       │   │  └──────────┬───────────────────┘
│ created_by TEXT           │   │             │
│ created_at TEXT           │   │  ┌──────────▼───────────────────┐
│ updated_at TEXT           │   │  │    ticket_messages            │
└─────────────────────────┘   │  ├──────────────────────────────┤
                               │  │ id TEXT PK                    │
                               │  │ ticket_id TEXT FK → tickets   │
┌─────────────────────────┐   │  │ author_id TEXT FK → users     │
│     project_files        │   │  │ content TEXT                  │
├─────────────────────────┤   │  │ created_at TEXT               │
│ id TEXT PK               │   │  └──────────────────────────────┘
│ project_id TEXT FK ──────┘   │
│ uploaded_by TEXT FK → users  │
│ filename TEXT             │
│ original_filename TEXT    │
│ file_size INTEGER         │
│ mime_type TEXT             │
│ r2_key TEXT               │
│ created_at TEXT           │
└─────────────────────────┘

┌──────────────────────────────┐
│      security_events          │
├──────────────────────────────┤
│ id INTEGER PK AUTOINCREMENT   │
│ event_type TEXT                │
│ user_id TEXT                   │
│ target_user_id TEXT            │
│ ip TEXT                        │
│ details TEXT                   │
│ created_at TEXT                │
└──────────────────────────────┘
  IDX: created_at, event_type, user_id

┌──────────────────────────────┐
│      cookie_consents          │   Registre RGPD immuable
├──────────────────────────────┤
│ id TEXT PK (UUID v4)           │
│ consent_id TEXT                │   UUID stable stocke dans cookie raceup_consent
│ user_id TEXT FK→users NULL     │   null si anonyme
│ ip_hash TEXT                   │   SHA-256(ip + CONSENT_SALT)
│ user_agent TEXT                │
│ country TEXT                   │   CF-IPCountry
│ necessary INTEGER              │   toujours 1
│ functional INTEGER             │   0|1
│ analytics INTEGER              │   0|1
│ marketing INTEGER              │   0|1
│ policy_version TEXT            │   vX.Y.Z
│ consent_method TEXT            │   accept_all|reject_all|custom|banner_dismiss
│ source_url TEXT                │
│ created_at TEXT                │
│ expires_at TEXT                │   created_at + 13 mois
│ withdrawn_at TEXT              │   null tant que valide
│ withdrawn_reason TEXT          │   user_request|policy_change|expired
└──────────────────────────────┘
  IDX: consent_id, user_id, created_at, policy_version

Immutabilite : un changement = nouvelle ligne (meme consent_id). Retrait = UPDATE withdrawn_at, pas DELETE (preuve CNIL).
```

## Endpoints API

### Auth (`/api/auth`)

| Methode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | /register | Inscription | Non |
| POST | /login | Connexion (+ security log) | Non |
| POST | /google | OAuth Google | Non |
| POST | /apple | OAuth Apple | Non |
| POST | /refresh | Rafraichir tokens | Non |
| POST | /refresh-session | Refresh via cookie HttpOnly | Non |
| GET | /me | Profil utilisateur | Oui |
| PATCH | /me | Update profil | Oui |
| POST | /change-password | Changer mot de passe | Oui |
| POST | /change-email | Changer email | Oui |
| POST | /logout | Deconnexion | Oui |
| DELETE | /account | Supprimer compte (+ security log) | Oui |

### Projets (`/api/projects`) — Auth requise

| Methode | Route | Description | Acces |
|---------|-------|-------------|-------|
| GET | / | Liste projets du user | Owner |
| POST | / | Creer un projet | Owner |
| GET | /:id | Detail projet | Owner ou Admin |
| PATCH | /:id | Renommer | Owner ou Admin |
| DELETE | /:id | Archiver (soft delete) | Owner ou Admin |

### Tickets (`/api/projects/:id/tickets`) — Auth requise

| Methode | Route | Description | Acces |
|---------|-------|-------------|-------|
| GET | / | Liste tickets du projet | Owner ou Admin |
| POST | / | Creer un ticket | Owner ou Admin |
| GET | /:ticketId | Detail + messages | Owner ou Admin |
| PATCH | /:ticketId | Changer statut | Owner ou Admin |
| POST | /:ticketId/messages | Ajouter un message | Owner ou Admin |

### Fichiers (`/api/projects/:id/files`) — Auth requise

| Methode | Route | Description | Acces |
|---------|-------|-------------|-------|
| GET | / | Liste fichiers du projet | Owner ou Admin |
| POST | / | Upload fichier (multipart) | Owner ou Admin |
| GET | /:fileId/download | Telecharger fichier (stream) | Owner ou Admin |
| DELETE | /:fileId | Supprimer fichier | Owner ou Admin |

**Limites upload (non-admin uniquement) :**
- Taille max par fichier : 25 Mo
- Espace projet total : 100 Mo
- Types autorises : PDF, PNG, JPG, WEBP, GIF, ZIP, RAR, 7Z, DOC(X), XLS(X), TXT, CSV

### Admin (`/api/admin`) — Auth + Admin requise

| Methode | Route | Description |
|---------|-------|-------------|
| GET | /dashboard/overview | Stats globales |
| GET | /dashboard/signups | Inscriptions par jour |
| GET | /dashboard/visits | Pages vues par jour |
| GET | /users?q=&page=1&limit=50 | Liste utilisateurs (pagination) |
| GET | /users/:id | Detail utilisateur + projets |
| PATCH | /users/:id/role | Changer role (super_admin only, + security log) |
| DELETE | /users/:id | Supprimer utilisateur (super_admin only, + security log) |
| GET | /projects?status=&page=1&limit=50&archived=0|1 | Tous les projets (pagination, filtres) |
| POST | /projects | Creer projet pour un user |
| PATCH | /projects/:id | Modifier un projet (tous les attributs) |

### Support Tickets (`/api/support`) — Public

| Methode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | / | Creer un ticket support | Non |

**Categories :** `account_issue`, `account_hacked`, `project_inaccessible`, `bug`, `billing`, `gdpr`, `question`, `other`

**Priorite automatique :** `urgent` (account_hacked, gdpr) | `normal` (account_issue, project_inaccessible, bug, billing) | `low` (question, other)

### Admin support (`/api/admin/support-tickets`) — Auth + Admin requise

| Methode | Route | Description |
|---------|-------|-------------|
| GET | /support-tickets | Liste tickets avec filtres (status, category, priority, page, limit) |
| GET | /support-tickets/:id | Detail d'un ticket |
| PATCH | /support-tickets/:id | Fermer un ticket (`{ status: "closed" }`) |

### Consent (`/api/consent`) — Public

| Methode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | / | Enregistre un consentement (cree ligne dans `cookie_consents`, pose cookie) | Non |
| GET | /status?consent_id=xxx | Verifie validite d'un `consent_id` (expire ? retire ? obsolete ?) | Non |
| GET | /policy | Renvoie `POLICY_VERSION` courante et libelles des categories | Non |
| POST | /withdraw | Retire un consentement (UPDATE `withdrawn_at`) | Non |
| GET | /my-consents | Historique des consentements de l'utilisateur connecte | JWT |

### Admin Consent (`/api/admin/consents`) — Auth + Admin requise

| Methode | Route | Description |
|---------|-------|-------------|
| GET | / | Liste paginee avec filtres (status, category, date_from, date_to, q) |
| GET | /stats?days=30 | Stats agregees (opt-in rate, par categorie, par methode) |
| GET | /export?... | Export CSV streaming (ReadableStream, async generator) |
| GET | /:id | Detail d'un consentement + historique des versions (meme consent_id) |
| POST | /:id/withdraw | Retrait admin force (preuve CNIL) |

### Tracking (`/api/track`) — Public

| Methode | Route | Description |
|---------|-------|-------------|
| POST | /pageview | Enregistrer page vue |

### Dashboard (`/dashboard`) — Cookie session HMAC, admin/super_admin

Interface d'administration server-rendered avec Hono JSX SSR, dans le meme Worker.

| Methode | Route | Description | Acces |
|---------|-------|-------------|-------|
| GET | /login | Page de connexion | Public |
| POST | /login | Authentification → cookie HMAC | Public |
| GET | /logout | Deconnexion | Public |
| GET | / | Overview: stats, graphiques, top endpoints | Admin |
| GET | /logs | Request logs avec filtres et pagination | Admin |
| GET | /errors | Erreurs: vue liste et groupee | Admin |
| GET | /users | Liste utilisateurs, recherche, filtre role | Admin |
| GET | /users/:id | Detail utilisateur + edition profil + projets + logs | Admin |
| POST | /users/:id/edit | Modifier profil utilisateur | Admin (super_admin pour admins) |
| POST | /users/:id/role | Changer role | Super Admin |
| GET | /users/:id/delete | Page de confirmation suppression | Super Admin |
| POST | /users/:id/delete | Supprimer utilisateur (hard delete + R2 cleanup) | Super Admin |
| GET | /projects | Liste projets actifs/archives, filtre status | Admin |
| GET | /projects/:id | Detail projet + edition tous attributs + tickets + fichiers | Admin |
| POST | /projects/:id/edit | Modifier projet (tous les champs) | Admin |
| POST | /projects/:id/archive | Archiver projet | Admin |
| POST | /projects/:id/restore | Restaurer projet archive | Admin |
| GET | /consent | Liste consentements paginee + KPIs + filtres (status, category, date, q) | Admin |
| GET | /consent/search?q=... | Recherche AJAX (email/ip_hash/country) | Admin |
| GET | /consent/export?... | Export CSV streaming des consentements filtres | Admin |
| GET | /consent/:id | Detail consentement + historique des versions | Admin |
| POST | /consent/:id/withdraw | Retrait admin force (preuve CNIL) | Admin |
| GET | /database?tab=schema | Schema MPD visuel (SVG interactif) | Super Admin |
| GET | /database?tab=tables | Tables explorer: structure, FK, index | Super Admin |
| GET | /database?tab=query | Interface requete SQL | Super Admin |
| POST | /database/query | Executer requete SQL | Super Admin |
| GET | /docs | Documentation API + testeur integre | Admin |
| GET | /config | Placeholder (bientot disponible) | Admin |

**Authentification dashboard:**
- Cookie `dashboard_session` signe HMAC-SHA256 avec `JWT_SECRET`
- Payload: `{ userId, email, role, exp }` (base64url + signature)
- HttpOnly, Secure (production), SameSite=Strict, Path=/dashboard, 2h expiry
- Independant du systeme JWT de l'API

**Middleware chain:**
1. Security headers middleware (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy)
2. `loggerMiddleware` (toutes les requetes → D1 `request_logs`, fire-and-forget)
3. `dashboardAuthMiddleware` (verifie le cookie, redirige vers /login si absent)
4. `superAdminDashboardMiddleware` (uniquement pour /database, bloque si non super_admin)

**Composants:**
- `Layout` / `LoginLayout` — HTML shell avec sidebar
- `Nav` — Navigation laterale, liens conditionnels par role
- `StatCard` — Carte statistique avec valeur + delta
- `DataTable` / `Pagination` — Tableau generique avec rendu custom
- `BarChart` — Graphique SVG inline responsive

**Table `request_logs`:**
```sql
request_logs (id AUTOINCREMENT, method, path, status_code, duration_ms,
              user_id?, ip?, country?, user_agent?, error?, created_at)
  IDX: created_at, path, status_code
```
Purge automatique des logs > 30 jours a chaque visite de l'overview.

**Table `security_events`:**
```sql
security_events (id AUTOINCREMENT, event_type, user_id?, target_user_id?,
                 ip?, details?, created_at)
  IDX: created_at, event_type, user_id
```
Event types: `login_failed`, `login_success`, `account_deleted`, `role_changed`, `password_changed`, `email_changed`, `admin_user_deleted`

## Flux d'authentification

### Tokens

| Token | Type | Duree | Stockage client | Contenu |
|-------|------|-------|-----------------|---------|
| Access | JWT HS256 | 15 min | Memoire JS | `{ sub, email, username, iat, exp }` |
| Refresh | Opaque (64 bytes hex) | 7 jours | localStorage | Aucun (chaine aleatoire) |

Le refresh token est stocke **hashe en SHA-256** dans D1 — jamais en clair.

### Controle d'acces projets

Les endpoints `/api/projects` utilisent un helper `assertProjectAccess` qui verifie :
1. Le projet existe et n'est pas archive
2. L'utilisateur est soit le proprietaire (`user_id`), soit admin/super_admin

Cela permet aux admins de consulter et gerer tous les projets depuis le dashboard.

## Mesures de securite

| Mesure | Implementation |
|--------|---------------|
| Security Headers | X-Content-Type-Options: nosniff, X-Frame-Options: DENY, X-XSS-Protection, Referrer-Policy, Permissions-Policy |
| Hachage MDP | PBKDF2-SHA-256, 50K iterations, salt 16 bytes |
| Timing-safe | Comparaison XOR bit-a-bit (anti timing attack) |
| Anti-enumeration | Message identique pour email/MDP incorrect |
| Refresh rotation | Chaque usage invalide l'ancien token |
| Tokens hashes | Refresh tokens stockes en SHA-256, pas en clair |
| SQL injection | Requetes parametrees exclusivement (`prepare().bind()`) |
| Validation | Toutes les entrees validees par Zod avant traitement |
| CORS | Limite a `raceup.com` + localhost en dev |
| Upload validation | MIME type + taille verifie cote serveur (non-admin) |
| IDs | UUID v4 non predictibles (`crypto.randomUUID()`) |
| Security audit | Logging des login, suppressions, changements de role dans `security_events` |

## Format de reponse standardise

**Succes :**
```json
{
  "success": true,
  "data": { ... }
}
```

**Erreur :**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Description lisible."
  }
}
```

## Bindings Cloudflare

| Binding | Type | Usage |
|---------|------|-------|
| DB | D1 Database | Base de donnees principale |
| R2 | R2 Bucket | Stockage fichiers projets |
| JWT_SECRET | Secret | Cle de signature JWT |
| CONSENT_SALT | Secret | Sel pour hash SHA-256 des IPs dans `cookie_consents` (min 32 chars aleatoires) |
| POLICY_VERSION | Env var | Version courante de la politique cookies (ex: `v1.0.0`). Synchronisee avec `NEXT_PUBLIC_POLICY_VERSION` cote frontend |
