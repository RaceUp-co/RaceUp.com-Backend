# RaceUp.com-Backend

API REST d'authentification pour **race-up.net**, deployee sur Cloudflare Workers + D1.

## Stack

- **Cloudflare Workers** — Runtime edge (TypeScript)
- **Hono** — Framework web ultra-leger
- **Cloudflare D1** — Base de donnees SQLite managee
- **Zod** — Validation des entrees
- **Web Crypto API** — Hachage PBKDF2 + JWT natifs

## Prerequis

- Node.js >= 18
- npm
- Un compte Cloudflare (gratuit)
- Wrangler CLI (installe en devDependency)

## Installation

```bash
git clone https://github.com/RaceUp-co/RaceUp.com-Backend.git
cd RaceUp.com-Backend
npm install
```

## Developpement local

### 1. Initialiser la base de donnees locale

```bash
npm run db:init:local
```

### 2. Lancer le serveur de dev

```bash
npm run dev
```

Le serveur demarre sur `http://localhost:8787`.

Les secrets locaux sont lus depuis `.dev.vars` (non commite). Le fichier contient :

```
JWT_SECRET=dev-secret-change-me-in-production-minimum-32-chars
```

## Endpoints

| Methode | Route | Auth | Description |
|---------|-------|------|-------------|
| `GET` | `/api/health` | Non | Health check |
| `POST` | `/api/auth/register` | Non | Inscription |
| `POST` | `/api/auth/login` | Non | Connexion |
| `POST` | `/api/auth/refresh` | Non | Renouvellement des tokens |
| `POST` | `/api/auth/logout` | Bearer JWT | Deconnexion (revoque les refresh tokens) |
| `DELETE` | `/api/auth/account` | Bearer JWT | Suppression du compte |

### Exemples

**Inscription :**
```bash
curl -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@raceup.com", "password": "MonTest123"}'
```

**Connexion :**
```bash
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@raceup.com", "password": "MonTest123"}'
```

**Refresh token :**
```bash
curl -X POST http://localhost:8787/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<REFRESH_TOKEN>"}'
```

**Logout (route protegee) :**
```bash
curl -X POST http://localhost:8787/api/auth/logout \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

**Suppression de compte (route protegee) :**
```bash
curl -X DELETE http://localhost:8787/api/auth/account \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"password": "MonTest123"}'
```

### Format de reponse

Toutes les reponses suivent ce format :

```json
// Succes
{ "success": true, "data": { ... } }

// Erreur
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

## Deploiement en production

### 1. Creer la base D1

```bash
npx wrangler d1 create raceup-db
```

Reporter le `database_id` affiche dans `wrangler.toml`.

### 2. Configurer le secret JWT

```bash
npx wrangler secret put JWT_SECRET
```

Utiliser une cle aleatoire d'au moins 32 caracteres.

### 3. Initialiser la base distante

```bash
npm run db:init:remote
```

### 4. Deployer

```bash
npm run deploy
```

## Scripts disponibles

| Script | Commande | Description |
|--------|----------|-------------|
| `npm run dev` | `wrangler dev` | Serveur de dev local |
| `npm run deploy` | `wrangler deploy` | Deploiement production |
| `npm run db:init:local` | `wrangler d1 execute --local` | Init BDD locale |
| `npm run db:init:remote` | `wrangler d1 execute --remote` | Init BDD production |

## Structure du projet

```
src/
├── index.ts              Point d'entree, CORS, error handlers
├── types.ts              Types TypeScript
├── routes/auth.ts        Endpoints d'authentification
├── middleware/auth.ts     Middleware verification JWT
├── services/
│   ├── password.ts       Hachage PBKDF2 (Web Crypto API)
│   ├── token.ts          Generation JWT + refresh tokens
│   └── user.ts           CRUD utilisateur (D1)
└── validators/auth.ts    Schemas de validation Zod

db/schema.sql             Schema SQLite (tables + index)
docs/architecture.md      Documentation technique detaillee
docs/TODO.md              Roadmap et taches restantes
```

## Documentation

- [Architecture detaillee](docs/architecture.md) — Stack, flux d'auth, securite, schema BDD
- [TODO / Roadmap](docs/TODO.md) — Taches restantes et prochaines etapes
