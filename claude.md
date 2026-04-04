# RaceUp.com-Backend — Knowledge Pack API

> Hono + TypeScript | Cloudflare Workers + D1 (SQLite) + R2 (fichiers)
> URL: raceup-backend-api.jacqueslucas-m2101.workers.dev

## Consignes

- Mettre a jour `docs/architecture.md` a chaque modification (routes, tables, logique metier)
- Securiser tous les endpoints admin cote backend
- Pagination + filtrage pour toute nouvelle fonctionnalite
- Commenter brievement tout bloc complexe
- Migrations SQL dans `db/migrations/`, appliquees via Wrangler

## Stack

- Hono 4.7+, Zod 3.24+ (@hono/zod-validator), TypeScript 5.7+
- Cloudflare Workers (wrangler 4.0+)
- D1 Database: `RaceUp-User-Data` (SQLite)
- R2 Bucket: `raceup-project-files`
- Secrets: JWT_SECRET (via wrangler secret)

## Architecture Fichiers

```
src/
├── index.ts              Point d'entree, CORS, error handlers
├── types.ts              Bindings, Variables, User, Project, Ticket, etc.
├── routes/
│   ├── auth.ts           Auth endpoints (register, login, OAuth, refresh, me, logout, delete)
│   ├── projects.ts       CRUD projets + tickets + fichiers
│   ├── admin.ts          Dashboard stats + gestion users/projects
│   └── tracking.ts       Page views (public)
├── dashboard/
│   ├── styles.ts             CSS template string
│   ├── session.ts            HMAC cookie sign/verify/middleware
│   ├── layout.tsx            HTML layout (head, sidebar, main) + LoginLayout
│   ├── components/
│   │   ├── nav.tsx           Sidebar navigation
│   │   ├── stat-card.tsx     Stat card (value + delta)
│   │   ├── table.tsx         Reusable DataTable + Pagination
│   │   └── chart.tsx         SVG BarChart
│   └── routes/
│       ├── auth.tsx          Login/logout pages
│       ├── overview.tsx      Stats, charts, top endpoints
│       ├── logs.tsx          Request logs with filters
│       ├── errors.tsx        Error list + grouped view
│       ├── users.tsx         User list, detail, role mgmt
│       ├── projects.tsx      Project list + detail
│       ├── database.tsx      SQL explorer (super_admin)
│       ├── docs.tsx          API documentation + tester
│       └── config.tsx        Placeholder
├── middleware/
│   ├── auth.ts           Bearer JWT verification → injecte jwtPayload
│   ├── admin.ts          Role check (admin/super_admin) → injecte currentUser
│   └── logger.ts         Request logging → D1 request_logs (fire-and-forget)
├── services/
│   ├── password.ts       PBKDF2-SHA-256 hash + timing-safe verify
│   ├── token.ts          JWT HS256 (access) + opaque 64-byte (refresh) + SHA-256 hash
│   ├── user.ts           CRUD users + refresh tokens D1
│   ├── project.ts        CRUD projets (create, get, rename, archive/soft-delete)
│   ├── ticket.ts         CRUD tickets + messages
│   ├── file.ts           CRUD fichiers metadata D1 + helpers R2
│   ├── analytics.ts      Stats admin (inscriptions, pages vues, dashboard overview)
│   ├── oauth.ts          Verification Google (userinfo API) + Apple (JWKS RS256)
│   └── cookies.ts        Cookie HttpOnly raceup_session (refresh token)
├── validators/
│   ├── auth.ts           Schemas Zod (register, login, OAuth)
│   └── admin.ts          Schemas Zod (projets, role update)
db/
├── schema.sql            Tables initiales
└── migrations/           Evolutions schema (appliquees via wrangler d1 execute)
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
| POST | /change-email | JWT | Changer email |
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
| PATCH | /users/:id/role | Change role — **super_admin only** |
| GET | /projects | Tous les projets non archives |
| POST | /projects | Cree projet pour un user (user_id, name, service_type, start_date...) |

### Tracking `/api/track` (public)

| Method | Route | Description |
|--------|-------|-------------|
| POST | /pageview | Enregistre page vue (path, referrer?, user_agent, country CF) |

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
| GET | /users | Liste utilisateurs — recherche, pagination |
| GET | /users/:id | Detail utilisateur + projets + logs |
| POST | /users/:id/role | Changer role (super_admin only) |
| GET | /projects | Liste projets — filtre status |
| GET | /projects/:id | Detail projet + tickets + fichiers |
| GET | /database | SQL explorer — tables, structure (super_admin only) |
| POST | /database/query | Executer SQL (super_admin only) |
| GET | /docs | Documentation API + testeur integre |
| GET | /config | Placeholder — bientot disponible |

**Auth**: Cookie HMAC-SHA256 signe (`dashboard_session`), HttpOnly, Secure(prod), SameSite=Strict, 2h expiry.
**Middleware chain**: `loggerMiddleware` → `dashboardAuthMiddleware` → route handler (+ `superAdminDashboardMiddleware` pour /database).
**Rendering**: Hono JSX SSR (server-side), pas de framework frontend.

## Database Schema D1

```sql
users (id PK, email UNIQUE, password_hash, username UNIQUE, first_name, last_name,
       birth_date?, auth_provider['email'|'google'|'apple'], role['user'|'admin'|'super_admin'],
       created_at, updated_at)
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
```

Relations: users 1→N projects 1→N tickets 1→N ticket_messages
                              1→N project_files
           users 1→N refresh_tokens
           page_views: standalone

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

## Config Wrangler

```toml
name = "raceup-backend-api"
D1: binding=DB, database=RaceUp-User-Data
R2: binding=R2, bucket=raceup-project-files
vars: ENVIRONMENT=production, ACCESS_TOKEN_EXPIRY=900, REFRESH_TOKEN_EXPIRY=604800
secrets: JWT_SECRET (wrangler secret put)
```

## Commandes

```bash
npm run dev      # wrangler dev (localhost:8787)
npm run deploy   # wrangler deploy
npx wrangler d1 execute RaceUp-User-Data --file=db/migrations/xxx.sql  # Appliquer migration
npx wrangler secret put JWT_SECRET  # Configurer secret
```
