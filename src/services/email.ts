import type { Bindings } from '../types';

// Envoi d'emails transactionnels via l'API REST Resend (fetch natif : pas de SDK, donc
// aucun poids supplementaire dans le bundle Worker).
//
// Deux regles non negociables :
//   1. Un email ne doit JAMAIS faire echouer l'action metier. Un paiement encaisse reste
//      encaisse meme si Resend est en panne -> toutes les erreurs sont capturees et
//      journalisees, jamais propagees.
//   2. Sans RESEND_API_KEY, tout est desactive proprement (statut 'skipped' dans le
//      journal) : l'API fonctionne en local et en test sans secret.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Expediteurs par defaut (surchargeables par les vars Wrangler).
const DEFAULTS = {
  fromName: 'RaceUp',
  from: 'no-reply@race-up.net',
  replyTo: 'support@race-up.net',
  admin: 'raceup.co@gmail.com',
} as const;

export type EmailConfig = {
  fromName: string;
  from: string; // adresse d'envoi (domaine verifie dans Resend)
  replyTo: string; // adresse de reponse proposee au client
  admin: string; // destinataire des notifications internes
};

export function getEmailConfig(env: Bindings): EmailConfig {
  return {
    fromName: env.EMAIL_FROM_NAME || DEFAULTS.fromName,
    from: env.EMAIL_FROM || DEFAULTS.from,
    replyTo: env.EMAIL_REPLY_TO || DEFAULTS.replyTo,
    admin: env.EMAIL_ADMIN || DEFAULTS.admin,
  };
}

export function isEmailEnabled(env: Bindings): boolean {
  return Boolean(env.RESEND_API_KEY);
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Identifiant du gabarit, pour le journal et les statistiques (ex: 'order_paid'). */
  template: string;
  /** Adresse de reponse. Par defaut : EMAIL_REPLY_TO. `null` pour ne pas en mettre. */
  replyTo?: string | string[] | null;
  /** Rattache l'envoi a un compte dans le journal. */
  userId?: string | null;
  /**
   * Cle d'idempotence Resend : deux appels avec la meme cle n'envoient qu'un email.
   * Indispensable sur les flux re-joues (Stripe retente un webhook jusqu'a 3 jours).
   */
  idempotencyKey?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'disabled' | 'error'; error?: string };

// Resend n'accepte dans les tags que [A-Za-z0-9_-].
function sanitizeTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
}

function formatFrom(config: EmailConfig): string {
  return `${config.fromName} <${config.from}>`;
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Envoie un email et consigne le resultat dans `email_deliveries`.
 * Ne leve jamais d'exception : verifier `result.ok` si le flux appelant en depend.
 */
export async function sendEmail(env: Bindings, input: SendEmailInput): Promise<SendEmailResult> {
  const config = getEmailConfig(env);
  const recipients = toArray(input.to).filter(Boolean);

  if (recipients.length === 0) {
    return { ok: false, reason: 'error', error: 'Aucun destinataire' };
  }

  if (!isEmailEnabled(env)) {
    // Mode desactive : on garde une trace pour comprendre, en relisant le journal,
    // quels emails AURAIENT du partir.
    await logDelivery(env, {
      resendId: null,
      template: input.template,
      recipient: recipients[0],
      userId: input.userId ?? null,
      subject: input.subject,
      status: 'skipped',
      error: 'RESEND_API_KEY absent',
    });
    return { ok: false, reason: 'disabled' };
  }

  const replyTo = input.replyTo === null ? undefined : toArray(input.replyTo ?? config.replyTo);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(input.idempotencyKey && { 'Idempotency-Key': input.idempotencyKey.slice(0, 256) }),
      },
      body: JSON.stringify({
        from: formatFrom(config),
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(replyTo && { reply_to: replyTo }),
        tags: [{ name: 'template', value: sanitizeTag(input.template) }],
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!response.ok || !payload?.id) {
      const error = `${response.status} ${payload?.message ?? payload?.name ?? 'reponse Resend illisible'}`;
      console.error('Resend send failed', input.template, error);
      await logDelivery(env, {
        resendId: null,
        template: input.template,
        recipient: recipients[0],
        userId: input.userId ?? null,
        subject: input.subject,
        status: 'failed',
        error: error.slice(0, 500),
      });
      return { ok: false, reason: 'error', error };
    }

    await logDelivery(env, {
      resendId: payload.id,
      template: input.template,
      recipient: recipients[0],
      userId: input.userId ?? null,
      subject: input.subject,
      status: 'sent',
      error: null,
    });

    return { ok: true, id: payload.id };
  } catch (err) {
    console.error('Resend send error', input.template, err);
    await logDelivery(env, {
      resendId: null,
      template: input.template,
      recipient: recipients[0],
      userId: input.userId ?? null,
      subject: input.subject,
      status: 'failed',
      error: String(err).slice(0, 500),
    });
    return { ok: false, reason: 'error', error: String(err) };
  }
}

// ---------- Journal des envois ----------

type DeliveryLog = {
  resendId: string | null;
  template: string;
  recipient: string;
  userId: string | null;
  subject: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
};

// Le journal ne doit jamais casser un envoi : en cas d'echec D1 (table absente avant
// migration, base indisponible), on se contente d'un log console.
async function logDelivery(env: Bindings, log: DeliveryLog): Promise<void> {
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO email_deliveries
         (id, resend_id, template, recipient, user_id, subject, status, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        log.resendId ?? crypto.randomUUID(),
        log.resendId,
        log.template,
        log.recipient,
        log.userId,
        log.subject.slice(0, 300),
        log.status,
        log.error,
        now,
        now
      )
      .run();
  } catch (err) {
    console.error('email_deliveries insert failed', err);
  }
}

export type EmailDelivery = {
  id: string;
  resend_id: string | null;
  template: string;
  recipient: string;
  user_id: string | null;
  subject: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const DELIVERY_COLUMNS =
  'id, resend_id, template, recipient, user_id, subject, status, error, created_at, updated_at';

export async function listEmailDeliveries(
  db: D1Database,
  filters: { page: number; limit: number; status?: string; template?: string; q?: string }
): Promise<{ deliveries: EmailDelivery[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.template) {
    conditions.push('template = ?');
    params.push(filters.template);
  }
  if (filters.q) {
    conditions.push('recipient LIKE ?');
    params.push(`%${filters.q}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;

  const [rows, count] = await Promise.all([
    db
      .prepare(
        `SELECT ${DELIVERY_COLUMNS} FROM email_deliveries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...params, filters.limit, offset)
      .all<EmailDelivery>(),
    db.prepare(`SELECT COUNT(*) AS total FROM email_deliveries ${where}`).bind(...params).first<{ total: number }>(),
  ]);

  return { deliveries: rows.results ?? [], total: count?.total ?? 0 };
}

export type EmailStats = {
  sent_30d: number;
  delivered_30d: number;
  bounced_30d: number;
  failed_30d: number;
};

export async function getEmailStats(db: D1Database): Promise<EmailStats> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('sent','delivered','delivery_delayed','bounced','complained') THEN 1 END), 0) AS sent_30d,
         COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 END), 0) AS delivered_30d,
         COALESCE(SUM(CASE WHEN status IN ('bounced','complained') THEN 1 END), 0) AS bounced_30d,
         COALESCE(SUM(CASE WHEN status IN ('failed','skipped') THEN 1 END), 0) AS failed_30d
       FROM email_deliveries WHERE created_at >= ?`
    )
    .bind(since)
    .first<EmailStats>();

  return {
    sent_30d: row?.sent_30d ?? 0,
    delivered_30d: row?.delivered_30d ?? 0,
    bounced_30d: row?.bounced_30d ?? 0,
    failed_30d: row?.failed_30d ?? 0,
  };
}

// Mise a jour depuis le webhook Resend (email.delivered, email.bounced...).
// `id` = identifiant Resend de l'email.
export async function updateDeliveryStatus(
  db: D1Database,
  resendId: string,
  status: 'delivered' | 'delivery_delayed' | 'bounced' | 'complained' | 'failed',
  error: string | null
): Promise<void> {
  await db
    .prepare(
      `UPDATE email_deliveries SET status = ?, error = COALESCE(?, error), updated_at = ?
       WHERE resend_id = ?`
    )
    .bind(status, error, new Date().toISOString(), resendId)
    .run();
}
