// Security event types
export type SecurityEventType =
  | 'login_failed'
  | 'login_success'
  | 'account_deleted'
  | 'role_changed'
  | 'password_changed'
  | 'email_changed'
  | 'email_verified'
  | 'admin_user_deleted';

// ---------- Verrou anti brute-force (connexion API + dashboard) ----------
// Les echecs sont journalises avec details = "email=<email> (...)". Le verrou compte les echecs
// par EMAIL (et non par IP) : il resiste a une attaque distribuee sur plusieurs IP. Les emails
// inexistants sont comptes de la meme facon, le verrou ne revele donc pas si un compte existe.
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_LOCK_MINUTES = 15;

export function loginFailureDetails(email: string, reason: string): string {
  return `email=${email} (${reason})`;
}

export async function isLoginLocked(db: D1Database, email: string): Promise<boolean> {
  const prefix = `email=${email} (`;
  const since = new Date(Date.now() - LOGIN_LOCK_MINUTES * 60_000).toISOString();
  try {
    const row = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM security_events WHERE event_type = 'login_failed' AND created_at > ? AND substr(details, 1, ?) = ?"
      )
      .bind(since, prefix.length, prefix)
      .first<{ n: number }>();
    return (row?.n ?? 0) >= LOGIN_MAX_FAILURES;
  } catch {
    // Table absente (BDD locale non migree) : on ne bloque pas la connexion
    return false;
  }
}

export async function logSecurityEvent(
  db: D1Database,
  event: {
    event_type: SecurityEventType;
    user_id?: string | null;
    target_user_id?: string | null;
    ip?: string | null;
    details?: string | null;
  }
): Promise<void> {
  try {
    await db.prepare(
      'INSERT INTO security_events (event_type, user_id, target_user_id, ip, details, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      event.event_type,
      event.user_id ?? null,
      event.target_user_id ?? null,
      event.ip ?? null,
      event.details ?? null,
      new Date().toISOString()
    ).run();
  } catch (_) {
    // Fire-and-forget — ne pas casser le flux si la table n'existe pas encore
    console.error('Failed to log security event:', event.event_type);
  }
}
