import type { User, RefreshToken } from '../types';

const USER_COLUMNS =
  'id, email, password_hash, username, first_name, last_name, birth_date, auth_provider, role, email_verified_at, created_at, updated_at';

export async function createUser(
  db: D1Database,
  email: string,
  passwordHash: string,
  username: string,
  firstName: string,
  lastName: string,
  birthDate?: string
): Promise<User> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO users (id, email, password_hash, username, first_name, last_name, birth_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, email, passwordHash, username, firstName, lastName, birthDate ?? null, now, now)
    .run();

  return {
    id,
    email,
    password_hash: passwordHash,
    username,
    first_name: firstName,
    last_name: lastName,
    birth_date: birthDate ?? null,
    auth_provider: 'email',
    role: 'user',
    email_verified_at: null,
    created_at: now,
    updated_at: now,
  };
}

// Crée un utilisateur OAuth (sans mot de passe)
export async function createOAuthUser(
  db: D1Database,
  email: string,
  username: string,
  firstName: string,
  lastName: string,
  authProvider: string
): Promise<User> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Google et Apple ne delivrent un jeton que pour une adresse qu'ils ont eux-memes
  // verifiee : inutile de redemander une confirmation au client.
  await db
    .prepare(
      'INSERT INTO users (id, email, password_hash, username, first_name, last_name, auth_provider, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, email, '', username, firstName, lastName, authProvider, now, now, now)
    .run();

  return {
    id,
    email,
    password_hash: '',
    username,
    first_name: firstName,
    last_name: lastName,
    birth_date: null,
    auth_provider: authProvider,
    role: 'user',
    email_verified_at: now,
    created_at: now,
    updated_at: now,
  };
}

// Trouve un utilisateur par email ou le crée via OAuth
export async function findOrCreateOAuthUser(
  db: D1Database,
  email: string,
  firstName: string,
  lastName: string,
  authProvider: string
): Promise<User> {
  const existing = await getUserByEmail(db, email);
  if (existing) return existing;

  // Génère un username unique à partir de l'email
  const emailPrefix = email
    .split('@')[0]
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 20);
  const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  let username = `${emailPrefix}_${randomSuffix}`;

  // Vérifie l'unicité (très improbable mais par sécurité)
  while (await getUserByUsername(db, username)) {
    const newSuffix = Array.from(crypto.getRandomValues(new Uint8Array(2)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    username = `${emailPrefix}_${newSuffix}`;
  }

  return createOAuthUser(db, email, username, firstName, lastName, authProvider);
}

export async function getUserByEmail(
  db: D1Database,
  email: string
): Promise<User | null> {
  const result = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`)
    .bind(email)
    .first<User>();

  return result ?? null;
}

export async function getUserById(
  db: D1Database,
  id: string
): Promise<User | null> {
  const result = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first<User>();

  return result ?? null;
}

export async function getUserByUsername(
  db: D1Database,
  username: string
): Promise<User | null> {
  const result = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`)
    .bind(username)
    .first<User>();

  return result ?? null;
}

export async function deleteUser(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
}

export async function saveRefreshToken(
  db: D1Database,
  userId: string,
  tokenHash: string,
  expiresAt: string
): Promise<void> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    )
    .bind(id, userId, tokenHash, expiresAt)
    .run();
}

export async function getRefreshToken(
  db: D1Database,
  tokenHash: string
): Promise<RefreshToken | null> {
  const result = await db
    .prepare(
      "SELECT id, user_id, token_hash, expires_at, created_at FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')"
    )
    .bind(tokenHash)
    .first<RefreshToken>();

  return result ?? null;
}

export async function deleteRefreshToken(
  db: D1Database,
  tokenHash: string
): Promise<void> {
  await db
    .prepare('DELETE FROM refresh_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .run();
}

export async function deleteUserRefreshTokens(
  db: D1Database,
  userId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM refresh_tokens WHERE user_id = ?')
    .bind(userId)
    .run();
}

export async function cleanExpiredTokens(
  db: D1Database,
  userId: string
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at <= datetime('now')"
    )
    .bind(userId)
    .run();
}

// ---------- Mise a jour du profil (PATCH /api/auth/me) ----------

export type ProfileUpdate = {
  first_name?: string;
  last_name?: string;
  username?: string;
  birth_date?: string | null;
};

/**
 * Met a jour les champs fournis uniquement (UPDATE partiel) : une requete qui ne
 * contient que `first_name` ne doit pas effacer la date de naissance.
 */
export async function updateUserProfile(
  db: D1Database,
  userId: string,
  data: ProfileUpdate
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (data.first_name !== undefined) {
    sets.push('first_name = ?');
    params.push(data.first_name);
  }
  if (data.last_name !== undefined) {
    sets.push('last_name = ?');
    params.push(data.last_name);
  }
  if (data.username !== undefined) {
    sets.push('username = ?');
    params.push(data.username);
  }
  if (data.birth_date !== undefined) {
    sets.push('birth_date = ?');
    params.push(data.birth_date);
  }
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  params.push(new Date().toISOString(), userId);

  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
}

export async function updateUserPassword(
  db: D1Database,
  userId: string,
  passwordHash: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, now, userId)
    .run();
}
