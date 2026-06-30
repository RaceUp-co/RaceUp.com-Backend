# RaceUp.com-Backend — API

API REST de **[raceup.com](https://raceup.com)**, déployée sur Cloudflare Workers.
Gère l'authentification, les projets clients, les tickets, les fichiers, la conformité RGPD et le monitoring.

Pour la carte technique complète (routes, schéma BDD, patterns), voir [claude.md](claude.md) et [docs/architecture.md](docs/architecture.md).

## Stack

- **Cloudflare Workers** — runtime edge (TypeScript)
- **Hono** — framework web ultra-léger (+ JSX SSR pour le Moniteur)
- **Cloudflare D1** — base de données SQLite managée
- **Cloudflare R2** — stockage objet (fichiers de projets)
- **Zod** — validation des entrées
- **Web Crypto API** — JWT, hachage PBKDF2 (mots de passe) et SHA-256 (IP RGPD), natifs

## Moniteur (dashboard admin)

Interface d'administration SSR (stats, utilisateurs, projets, logs, erreurs, base de données, consentements).

```
Admin local :
  Email    : admin@raceup.com
  Password : Admin1234!
  Rôle     : super_admin
```

- **Local** : http://localhost:8787/dashboard/login (API démarrée)
- **Production** : https://raceup-backend-api.jacqueslucas-m2101.workers.dev/dashboard/login

> ⚠️ Selon la configuration Wrangler, `wrangler dev` peut accéder à la **D1 et au bucket R2 de production**. Vérifie l'environnement avant toute opération destructive.

## Prérequis

- Node.js ≥ 18 et npm
- Un compte Cloudflare (gratuit) — Wrangler est installé en devDependency

## Installation

```bash
git clone https://github.com/RaceUp-co/RaceUp.com-Backend.git
cd RaceUp.com-Backend
npm install
```

## Développement local

```bash
# 1. Base de données locale : init + migrations + admin de test
npm run db:setup:local

# 2. Secret local : créer .dev.vars (non commité)
#    JWT_SECRET=dev-secret-change-me-minimum-32-chars
#    CONSENT_SALT=dev-salt-change-me

# 3. Lancer le serveur (http://localhost:8787)
npm run dev
```

## Endpoints (vue d'ensemble)

Format de réponse uniforme : `{ "success": true, "data": {...} }` ou `{ "success": false, "error": { "code", "message" } }`.

| Préfixe | Auth | Description |
|---------|------|-------------|
| `GET /api/health` | — | Health check |
| `/api/auth/*` | mixte | Inscription, connexion, OAuth Google/Apple, refresh, profil, logout, suppression |
| `/api/projects/*` | JWT | CRUD projets + tickets + fichiers (R2) |
| `/api/admin/*` | JWT + admin | Stats dashboard, gestion users/projets, tickets support |
| `/api/support` | — | Création d'un ticket de support (public) |
| `/api/consent/*` | mixte | Consentement cookies RGPD (preuve, statut, retrait, droit d'accès) |
| `/api/track/pageview` | — | Enregistrement d'une page vue |
| `/dashboard/*` | Cookie HMAC | Moniteur admin (SSR) |

> Liste exhaustive des routes, payloads et codes d'erreur : [claude.md](claude.md#routes-api).

### Exemples (curl)

```bash
# Inscription
curl -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@raceup.com","password":"MonTest123","username":"dev","first_name":"Dev","last_name":"Test"}'

# Connexion
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@raceup.com","password":"MonTest123"}'

# Route protégée (profil courant)
curl http://localhost:8787/api/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## Déploiement en production

```bash
# 1. Créer la base D1 et reporter le database_id dans wrangler.toml
npx wrangler d1 create RaceUp-User-Data

# 2. Créer le bucket R2
npx wrangler r2 bucket create raceup-project-files

# 3. Configurer les secrets (≥ 32 caractères aléatoires)
npx wrangler secret put JWT_SECRET
npx wrangler secret put CONSENT_SALT

# 4. Initialiser le schéma distant
npm run db:init:remote

# 5. Déployer
npm run deploy
```

## Scripts disponibles

| Script | Description |
|--------|-------------|
| `npm run dev` | Serveur de dev local (`wrangler dev`, port 8787) |
| `npm run deploy` | Déploiement production (`wrangler deploy`) |
| `npm run db:init:local` / `db:init:remote` | Crée le schéma (local / production) |
| `npm run db:migrate:local` | Applique les migrations (002 → 007) en local |
| `npm run db:seed:local` | Crée l'admin de test local |
| `npm run db:setup:local` | Init + migrations + seed en une commande |

## Structure du projet

```
src/
├── index.ts          Point d'entrée : security headers, CORS, montage des routes, erreurs
├── types.ts          Bindings, Variables et modèles TypeScript
├── routes/           Endpoints API : auth, projects, admin, support, consent, tracking
├── dashboard/        Moniteur admin SSR (layout, components, routes, session HMAC)
├── middleware/       auth (JWT), admin (rôles), logger (request_logs)
├── services/         Logique métier : password, token, user, project, ticket, file (R2),
│                     analytics, security, oauth, cookies, support, consent
├── validators/       Schémas Zod (auth, admin, support, consent)
└── utils/            hash.ts (SHA-256 + sel pour les IP, RGPD)

db/
├── schema.sql        Tables initiales
└── migrations/       Évolutions du schéma (appliquées via wrangler d1 execute)
docs/
├── architecture.md   Documentation technique détaillée (source de vérité)
└── TODO.md           Roadmap
```

## Sécurité

- **Mots de passe** : PBKDF2-SHA-256 (50 000 itérations, sel 16 octets, vérification timing-safe)
- **Tokens** : access JWT HS256 (15 min) + refresh opaque 64 octets (7 j, rotation à chaque refresh, stocké haché)
- **RGPD** : IP jamais stockée en clair (hachée SHA-256 + `CONSENT_SALT`), consentement à preuve immuable
- **Admin** : tous les endpoints sensibles vérifient le rôle côté serveur + journalisation des événements de sécurité

## Documentation

- [claude.md](claude.md) — Carte technique complète (routes, schéma D1, patterns)
- [docs/architecture.md](docs/architecture.md) — Référence détaillée
- [docs/TODO.md](docs/TODO.md) — Roadmap

---

© 2026 RaceUp. Tous droits réservés.
