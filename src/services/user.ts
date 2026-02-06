import type { User, RefreshToken } from '../types';

export async function createUser(
  db: D1Database,
  email: string,
  passwordHash: string
): Promise<User> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(id, email, passwordHash, now, now)
    .run();

  return { id, email, password_hash: passwordHash, created_at: now, updated_at: now };
}

export async function getUserByEmail(
  db: D1Database,
  email: string
): Promise<User | null> {
  const result = await db
    .prepare('SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = ?')
    .bind(email)
    .first<User>();

  return result ?? null;
}

export async function getUserById(
  db: D1Database,
  id: string
): Promise<User | null> {
  const result = await db
    .prepare('SELECT id, email, password_hash, created_at, updated_at FROM users WHERE id = ?')
    .bind(id)
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
