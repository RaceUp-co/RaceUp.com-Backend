# Dashboard Admin RaceUp — Spec de design

> Date: 2026-04-02
> Statut: Approuve
> Auteur: Lucas Jacques + Claude

## Resume

Dashboard d'administration interne pour l'API RaceUp, integre directement dans le Worker Cloudflare existant (`raceup-backend-api`). Server-side rendered avec Hono JSX. Acces restreint aux roles `admin` et `super_admin` via cookie signe HMAC independant de l'auth API.

Objectif : moniteur interne efficace, pas d'interface "belle" — au plus simple, au plus fonctionnel.

---

## Decisions de design

| Decision | Choix | Raison |
|----------|-------|--------|
| Hebergement | Meme Worker, prefixe `/dashboard/*` | Un seul deploiement, acces direct D1/R2 |
| Rendu | Hono JSX server-side | Pas de build frontend, pas de SPA, ultra leger |
| Auth dashboard | Cookie HMAC signe (2h) | Independant de l'auth API JWT, adapte au SSR |
| Stockage metriques | Table D1 `request_logs` | Simple, requetable, suffisant pour trafic modere |
| Documentation API | Registre statique + testeur inline | Meilleur ratio effort/utilite |
| SQL Explorer | Requetes SQL libres, super_admin only | Outil debug puissant, restreint au role max |
| Feature flags / API keys | TODO futur | Scope deja consequent, ajout ulterieur sans casser l'archi |
| Migration Analytics Engine | TODO futur | Quand le volume de trafic le justifiera |

---

## Architecture

### Flux de requetes

```
Client → Cloudflare Worker (raceup-backend-api)
         ├── /api/*          → API JSON existante (inchangee)
         └── /dashboard/*    → Pages HTML (Hono JSX server-side)
                              ├── /dashboard/login    (public)
                              └── /dashboard/*         (cookie session requis)
```

### Structure fichiers ajoutee

```
src/
├── dashboard/
│   ├── layout.tsx          # Layout HTML commun (head, nav, scripts inline)
│   ├── auth.ts             # Login page + session middleware (cookie HMAC)
│   ├── routes/
│   │   ├── overview.tsx    # Stats temps reel, graphiques, top endpoints
│   │   ├── logs.tsx        # Request logs (table paginee, filtres)
│   │   ├── users.tsx       # Gestion utilisateurs (liste, detail, role change)
│   │   ├── projects.tsx    # Gestion projets (liste, detail, tickets, fichiers)
│   │   ├── database.tsx    # SQL explorer (super_admin only)
│   │   ├── docs.tsx        # Documentation API + testeur integre
│   │   └── errors.tsx      # Logs d'erreurs filtres + groupement
│   ├── components/
│   │   ├── nav.tsx         # Sidebar navigation
│   │   ├── table.tsx       # Composant table reutilisable (pagination, tri)
│   │   ├── stat-card.tsx   # Carte statistique (valeur + variation)
│   │   └── chart.tsx       # Graphiques SVG inline
│   └── styles.ts           # CSS inline (template string, design minimal)
├── middleware/
│   └── logger.ts           # NOUVEAU: intercepte chaque requete → insere dans request_logs
```

---

## Base de donnees

### Nouvelle table : `request_logs`

```sql
CREATE TABLE request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_id TEXT,
  ip TEXT,
  country TEXT,
  user_agent TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX idx_request_logs_path ON request_logs(path);
CREATE INDEX idx_request_logs_status_code ON request_logs(status_code);
```

### Cleanup automatique

Les logs de plus de 30 jours sont purges automatiquement a chaque chargement de la page overview :

```sql
DELETE FROM request_logs WHERE created_at < datetime('now', '-30 days');
```

---

## Authentification dashboard

### Mecanisme : Cookie HMAC signe

**Flow :**
1. Acces a `/dashboard/*` → middleware verifie cookie `dashboard_session`
2. Pas de cookie valide → redirect `302` vers `/dashboard/login`
3. Page login : formulaire email + mot de passe (HTML form POST)
4. `POST /dashboard/login` :
   - Verifie credentials en D1 (email + password hash PBKDF2)
   - Verifie `role IN ('admin', 'super_admin')`
   - Si OK : cree payload `{userId, email, role, exp}` (exp = now + 2h)
   - Signe avec HMAC-SHA256 via `JWT_SECRET`
   - Set cookie `dashboard_session`
   - Redirect vers `/dashboard/`
   - Si KO : re-affiche login avec message d'erreur
5. Chaque page : middleware decode cookie, verifie signature + expiration
6. `GET /dashboard/logout` : supprime le cookie, redirect vers login

### Proprietes du cookie

| Propriete | Valeur |
|-----------|--------|
| Nom | `dashboard_session` |
| HttpOnly | `true` |
| Secure | `true` en production, `false` en dev |
| SameSite | `Strict` |
| Path | `/dashboard` |
| Max-Age | 7200 (2 heures) |

### Restrictions d'acces

- `role = 'user'` → 403 "Acces reserve aux administrateurs"
- SQL Explorer (`/dashboard/database/*`) → verifie en plus `role === 'super_admin'`

---

## Pages du dashboard

### 1. Overview (`/dashboard/`)

**Cartes statistiques (haut) :**
- Requetes 24h (total + % variation vs veille)
- Temps de reponse moyen (ms) 24h
- Taux d'erreurs (% status >= 400) 24h
- Utilisateurs actifs 24h (users avec >= 1 requete authentifiee)
- Total utilisateurs inscrits
- Total projets actifs

**Graphiques (milieu) :**
- Requetes par heure (24h) — barres SVG inline
- Temps de reponse moyen par heure — ligne SVG inline
- Repartition status codes (2xx/3xx/4xx/5xx) — barres empilees

**Tableaux (bas) :**
- 10 dernieres erreurs (timestamp, method, path, status, error)
- Top 10 endpoints (path, count, avg duration_ms)
- Top 5 pays (country, count)

**Parametre :** `?period=24h|7d|30d` (defaut: 24h)

### 2. Logs (`/dashboard/logs`)

- Table paginee (50/page) de tous les request_logs
- Colonnes : timestamp, method, path, status, duration_ms, user_id, country, ip
- Filtres : method (select), status (select 2xx/4xx/5xx), path (texte), periode (select)
- Lignes status >= 400 surlignees en rouge
- user_id cliquable → lien vers `/dashboard/users/:id`

### 3. Erreurs (`/dashboard/errors`)

- Sous-ensemble de request_logs avec `status_code >= 400`
- Table : timestamp, method, path, status, error, user_id
- Vue groupee : path + status → compteur "occurrences 24h"
- Utile pour reperer les erreurs recurrentes

### 4. Utilisateurs (`/dashboard/users`)

- Table : email, username, role, auth_provider, created_at, project_count
- Recherche par email/username
- Pagination (50/page)
- Clic → page detail `/dashboard/users/:id` avec liste de ses projets
- Bouton "Changer role" (super_admin only) : select inline user/admin/super_admin

### 5. Projets (`/dashboard/projects`)

- Table : name, user (email), service_type, status, progress, created_at
- Filtre par status (in_progress/completed/paused)
- Pagination (50/page)
- Clic → detail avec tickets et fichiers associes

### 6. Base de donnees (`/dashboard/database`) — SUPER_ADMIN ONLY

- Liste des tables avec nombre de lignes (cliquable → structure)
- Vue structure : colonnes, types, index pour chaque table
- Champ `<textarea>` pour SQL libre
- Bouton "Executer" → `POST /dashboard/database/query`
- Resultat en table HTML (limite 500 lignes)
- Chaque requete executee est loggee (tracabilite)
- Timeout : 5 secondes max par requete

### 7. Documentation (`/dashboard/docs`)

- Registre statique TypeScript : tableau decrivant chaque endpoint
  - method, path, description, parametres, body attendu, exemple de reponse
- Affichage groupe par section : Auth, Projects, Tickets, Files, Admin, Tracking
- Accordeons depliables par endpoint
- **Testeur integre** dans chaque accordion :
  - Formulaire pre-rempli avec les champs du body
  - Champ Bearer token
  - Bouton "Envoyer" → `fetch()` cote client (script inline)
  - Reponse JSON dans un `<pre>`
  - URL de base determinee par `c.env.ENVIRONMENT` : `http://localhost:8787` si != production, sinon `https://raceup-backend-api.jacqueslucas-m2101.workers.dev`

### 8. Configuration (`/dashboard/config`) — PLACEHOLDER

- Message "Bientot disponible"
- Prevu pour : feature flags (activer/desactiver routes), gestion cles API

---

## Navigation

Sidebar gauche presente sur toutes les pages :

```
├── Overview          /dashboard/
├── Logs              /dashboard/logs
├── Erreurs           /dashboard/errors
├── Utilisateurs      /dashboard/users
├── Projets           /dashboard/projects
├── Base de donnees   /dashboard/database     ← visible si super_admin
├── Documentation     /dashboard/docs
├── Configuration     /dashboard/config       ← placeholder
└── Deconnexion       /dashboard/logout
```

"Base de donnees" n'apparait que pour `super_admin`.

---

## Middleware logger

Intercepte TOUTES les requetes entrantes (API + dashboard) :

```
Requete arrive → enregistre timestamp debut
                → execute le handler
                → calcule duration_ms = fin - debut
                → INSERT INTO request_logs (method, path, status_code, duration_ms, user_id, ip, country, user_agent, error)
```

- `user_id` : extrait du JWT payload si present, sinon NULL
- `ip` : header `CF-Connecting-IP`
- `country` : header `CF-IPCountry`
- `error` : body de la reponse si status >= 400 (tronque a 500 chars)
- Le logger ne doit JAMAIS bloquer la reponse (fire-and-forget avec `c.executionCtx.waitUntil()`)

---

## Style / CSS

Design minimal, efficace, pas esthetique :
- Couleurs : fond sombre (#1a1a2e), texte clair (#e0e0e0), accents bleu (#0066ff)
- Police : `monospace` partout (c'est un outil interne)
- Tables : bordures simples, alternance de couleurs de ligne
- Pas d'animations, pas de transitions
- CSS inline dans un template string (`styles.ts`), injecte dans le `<head>` du layout
- Responsive : non prioritaire (usage desktop uniquement)

---

## Securite

- **Auth isolee** : cookie dashboard completement separe des JWT API
- **SameSite=Strict** : protection CSRF native
- **Path=/dashboard** : cookie jamais envoye sur `/api/*`
- **Expiration 2h** : reconnexion reguliere forcee
- **SQL Explorer** : super_admin only + chaque requete loggee
- **CORS** : les pages dashboard sont server-rendered, pas de CORS necessaire
- **CSP** : `Content-Security-Policy: default-src 'self'; script-src 'unsafe-inline'` (necessaire pour les scripts du testeur)
- **Pas d'info sensible dans les logs** : pas de body de requete, pas de tokens, pas de mots de passe

---

## Ce qui ne change PAS

- Tous les endpoints `/api/*` restent identiques
- L'auth JWT de l'API n'est pas modifiee
- Les tables existantes ne sont pas alterees
- Le CORS existant n'est pas impacte
- Le `wrangler.toml` n'a besoin d'aucun nouveau binding

---

## TODO futur (hors scope)

- Feature flags pour activer/desactiver des routes API
- Systeme de cles API (generation, revocation, rate limiting)
- Migration request_logs vers Cloudflare Analytics Engine
- Alerting (notification si taux d'erreur depasse un seuil)
- Export des logs (CSV)
- 2FA/OTP pour le login dashboard
