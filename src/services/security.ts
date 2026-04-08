// Security event types
export type SecurityEventType =
  | 'login_failed'
  | 'login_success'
  | 'account_deleted'
  | 'role_changed'
  | 'password_changed'
  | 'email_changed'
  | 'admin_user_deleted';

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
