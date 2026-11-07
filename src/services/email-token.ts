import { hashRefreshToken as sha256Hex } from './token';

// Jetons email a usage unique : verification d'adresse, mot de passe oublie, changement
// d'email. Memes garanties que les refresh tokens : valeur opaque (32 octets aleatoires),
// seul le HACHE SHA-256 est stocke, usage unique, duree de vie courte.

export type EmailTokenPurpose = 'email_verification' | 'password_reset' | 'email_change';

export const TOKEN_TTL_HOURS: Record<EmailTokenPurpose, number> = {
  email_verification: 48, // large : le client peut confirmer le lendemain
  password_reset: 1, // court : c'est une prise de controle de compte
  email_change: 24,
};

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Cree un jeton et renvoie sa valeur EN CLAIR (seule occasion de la lire : elle n'est
 * jamais stockee). Les jetons precedents non utilises du meme usage sont invalides :
 * demander un nouveau lien doit annuler l'ancien.
 */
export async function createEmailToken(
  db: D1Database,
  userId: string,
  purpose: EmailTokenPurpose,
  newEmail?: string
): Promise<{ token: string; expiresAt: string; expiresHours: number }> {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const hours = TOKEN_TTL_HOURS[purpose];
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

  await db.batch([
    db
      .prepare(
        `UPDATE email_tokens SET used_at = ?
         WHERE user_id = ? AND purpose = ? AND used_at IS NULL`
      )
      .bind(now.toISOString(), userId, purpose),
    db
      .prepare(
        `INSERT INTO email_tokens (id, user_id, purpose, token_hash, new_email, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(crypto.randomUUID(), userId, purpose, tokenHash, newEmail ?? null, expiresAt, now.toISOString()),
  ]);

  return { token, expiresAt, expiresHours: hours };
}

/**
 * Consomme un jeton : le marque utilise et renvoie son contexte. Renvoie `null` si le
 * jeton est inconnu, deja utilise, expire ou d'un autre usage.
 *
 * L'UPDATE conditionnel sert de verrou : deux clics simultanes sur le meme lien ne
 * peuvent pas reussir tous les deux (`changes = 0` pour le second).
 */
export async function consumeEmailToken(
  db: D1Database,
  token: string,
  purpose: EmailTokenPurpose
): Promise<{ userId: string; newEmail: string | null } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();

  const row = await db
    .prepare(
      `SELECT id, user_id, new_email FROM email_tokens
       WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`
    )
    .bind(tokenHash, purpose, now)
    .first<{ id: string; user_id: string; new_email: string | null }>();

  if (!row) return null;

  const claimed = await db
    .prepare('UPDATE email_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .bind(now, row.id)
    .run();

  if ((claimed.meta?.changes ?? 0) === 0) return null;

  return { userId: row.user_id, newEmail: row.new_email };
}

/** Nombre de jetons emis recemment : garde-fou anti-spam en complement du rate limit IP. */
export async function countRecentTokens(
  db: D1Database,
  userId: string,
  purpose: EmailTokenPurpose,
  withinMinutes: number
): Promise<number> {
  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM email_tokens WHERE user_id = ? AND purpose = ? AND created_at >= ?')
    .bind(userId, purpose, since)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** Purge des jetons expires ou utilises (appelee au fil de l'eau, best effort). */
export async function purgeStaleEmailTokens(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare('DELETE FROM email_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)')
    .bind(new Date().toISOString(), cutoff)
    .run();
}

// ---------- Verification d'email cote utilisateur ----------

export async function markEmailVerified(db: D1Database, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
    .bind(now, now, userId)
    .run();
}

export async function isEmailVerified(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT email_verified_at FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email_verified_at: string | null }>();
  return Boolean(row?.email_verified_at);
}

/**
 * Applique un changement d'email confirme. Renvoie `false` si l'adresse a ete prise
 * entre-temps par un autre compte (contrainte UNIQUE sur users.email).
 */
export async function applyEmailChange(
  db: D1Database,
  userId: string,
  newEmail: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const taken = await db
    .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
    .bind(newEmail, userId)
    .first<{ id: string }>();
  if (taken) return false;

  // La nouvelle adresse est verifiee par construction : le lien a ete clique dedans.
  await db
    .prepare('UPDATE users SET email = ?, email_verified_at = ?, updated_at = ? WHERE id = ?')
    .bind(newEmail, now, now, userId)
    .run();
  return true;
}
