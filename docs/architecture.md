# Architecture - RaceUp Backend API

## Vue d'ensemble

API REST d'authentification pour le site race-up.net, deployee sur Cloudflare Workers avec une base de donnees Cloudflare D1.

```
Client (race-up.net)
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
│  │   (password,token) │  │
│  └─────────┬──────────┘  │
│            │              │
│  ┌─────────▼──────────┐  │
│  │   Cloudflare D1    │  │
│  │   (SQLite)         │  │
│  └────────────────────┘  │
└──────────────────────────┘
```

## Stack technique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Runtime | Cloudflare Workers (free tier) | Edge computing, 0ms cold start |
| Framework | Hono v4 | Ultra-leger (~14kB), natif Workers |
| BDD | Cloudflare D1 | SQLite manage, gratuit, co-localise |
| Hachage MDP | PBKDF2-SHA-256 (Web Crypto) | Natif, zero dependance externe |
| JWT | hono/jwt (HS256) | Inclus dans Hono |
| Validation | Zod + @hono/zod-validator | Typage automatique, messages clairs |

**Dependances runtime : 3** — `hono`, `zod`, `@hono/zod-validator`

## Structure des fichiers

```
src/
├── index.ts                 Point d'entree, CORS, error handlers, montage routes
├── types.ts                 Types TS : Bindings, Variables, AppType, User, RefreshToken
├── routes/
│   └── auth.ts              5 endpoints : register, login, refresh, logout, delete
├── middleware/
│   └── auth.ts              Verification Bearer JWT, injection du payload dans le contexte
├── services/
│   ├── password.ts          hashPassword / verifyPassword (PBKDF2, comparaison timing-safe)
│   ├── token.ts             Generation JWT access + refresh token opaque + hash SHA-256
│   └── user.ts              CRUD D1 : users + refresh_tokens (requetes parametrees)
└── validators/
    └── auth.ts              Schemas Zod pour chaque endpoint

db/
└── schema.sql               Tables users + refresh_tokens, index, FK cascade
```

## Schema de base de donnees

```
┌─────────────────────────┐       ┌──────────────────────────────┐
│         users            │       │       refresh_tokens          │
├─────────────────────────┤       ├──────────────────────────────┤
│ id TEXT PK (UUID v4)     │◄──┐  │ id TEXT PK (UUID v4)          │
│ email TEXT UNIQUE         │   │  │ user_id TEXT FK ──────────────┘
│ password_hash TEXT        │   │  │ token_hash TEXT (SHA-256)     │
│ created_at TEXT           │   │  │ expires_at TEXT               │
│ updated_at TEXT           │   │  │ created_at TEXT               │
└─────────────────────────┘   │  └──────────────────────────────┘
                               │         ON DELETE CASCADE
                               └──────────────────────────────────
```

## Flux d'authentification

### Tokens

| Token | Type | Duree | Stockage client | Contenu |
|-------|------|-------|-----------------|---------|
| Access | JWT HS256 | 15 min | Memoire JS | `{ sub, email, iat, exp }` |
| Refresh | Opaque (64 bytes hex) | 7 jours | localStorage / cookie | Aucun (chaine aleatoire) |

Le refresh token est stocke **hashe en SHA-256** dans D1 — jamais en clair.

### Flux Register / Login

```
1. Client envoie email + password
2. Server valide (Zod), hash le password (PBKDF2)
3. Server cree/verifie le user en D1
4. Server genere access JWT + refresh token opaque
5. Server hash le refresh token (SHA-256) et le stocke en D1
6. Server retourne { user, access_token, refresh_token }
```

### Flux Refresh (rotation)

```
1. Client envoie le refresh_token
2. Server hash le token recu → cherche en D1
3. Server SUPPRIME l'ancien token (rotation)
4. Server genere une nouvelle paire access + refresh
5. Server stocke le nouveau refresh hash en D1
6. Server retourne les nouveaux tokens
```

La rotation garantit qu'un refresh token ne peut etre utilise qu'une seule fois.

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
| CORS | Limite a `race-up.net` + localhost en dev |
| Limite MDP | 8-128 chars, 1 majuscule, 1 minuscule, 1 chiffre |
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

## Contraintes Workers (free tier)

- **CPU** : 10ms par requete — PBKDF2 a 50K iterations respecte cette limite
- **Requetes** : 100K/jour
- **D1** : 5M lignes lues/jour, 100K ecrites/jour
- **Taille Worker** : 1 MB compresse apres bundling
