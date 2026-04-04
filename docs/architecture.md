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
│  │  CORS ─► Routes    │  │
│  │          │         │  │
│  │     Middleware JWT  │  │
│  │          │         │  │
│  │     Services       │  │
│  │   (password,token, │  │
│  │    project,ticket, │  │
│  │    file,analytics) │  │
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
├── index.ts                 Point d'entree, CORS, error handlers, montage routes
├── types.ts                 Types TS : Bindings, Variables, AppType, User, Project, Ticket, etc.
├── routes/
│   ├── auth.ts              Endpoints auth : register, login, refresh, logout, delete, me
│   ├── admin.ts             Endpoints admin : dashboard, users, projects (admin only)
│   ├── projects.ts          Endpoints projets : CRUD projets, tickets, fichiers (user auth)
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
│       ├── users.tsx        Users: list, detail, role change
│       ├── projects.tsx     Projects: list, detail
│       ├── database.tsx     SQL explorer (super_admin)
│       ├── docs.tsx         API docs + testeur fetch()
│       └── config.tsx       Placeholder
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
│   ├── oauth.ts             OAuth Google/Apple
│   └── cookies.ts           Gestion cookies refresh token
└── validators/
    ├── auth.ts              Schemas Zod pour auth
    └── admin.ts             Schemas Zod pour admin

db/
├── schema.sql               Tables: users, refresh_tokens, projects, page_views
└── migrations/
    ├── 002_tickets_files.sql Tables: tickets, ticket_messages, project_files + colonnes projects
    └── 002_request_logs.sql  Table: request_logs + index (dashboard monitoring)
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
```

## Endpoints API

### Auth (`/api/auth`)

| Methode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | /register | Inscription | Non |
| POST | /login | Connexion | Non |
| POST | /refresh | Rafraichir tokens | Non |
| POST | /logout | Deconnexion | Oui |
| DELETE | /delete | Supprimer compte | Oui |
| GET | /me | Profil utilisateur | Oui |

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
| GET | /users | Liste utilisateurs |
| PATCH | /users/:id/role | Changer role (super_admin) |
| GET | /projects | Tous les projets |
| POST | /projects | Creer projet pour un user |

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
| GET | /users | Liste utilisateurs, recherche | Admin |
| GET | /users/:id | Detail utilisateur + projets + logs | Admin |
| POST | /users/:id/role | Changer role | Super Admin |
| GET | /projects | Liste projets, filtre status | Admin |
| GET | /projects/:id | Detail projet + tickets + fichiers | Admin |
| GET | /database | SQL explorer: tables, structure | Super Admin |
| POST | /database/query | Executer requete SQL | Super Admin |
| GET | /docs | Documentation API + testeur integre | Admin |
| GET | /config | Placeholder (bientot disponible) | Admin |

**Authentification dashboard:**
- Cookie `dashboard_session` signe HMAC-SHA256 avec `JWT_SECRET`
- Payload: `{ userId, email, role, exp }` (base64url + signature)
- HttpOnly, Secure (production), SameSite=Strict, Path=/dashboard, 2h expiry
- Independant du systeme JWT de l'API

**Middleware chain:**
1. `loggerMiddleware` (toutes les requetes → D1 `request_logs`, fire-and-forget)
2. `dashboardAuthMiddleware` (verifie le cookie, redirige vers /login si absent)
3. `superAdminDashboardMiddleware` (uniquement pour /database, bloque si non super_admin)

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
