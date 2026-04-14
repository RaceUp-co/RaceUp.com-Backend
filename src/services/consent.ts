import type { Consent, ConsentCategories, ConsentMethod, ConsentFilters, ConsentStats, WithdrawReason } from '../types';
import type { ConsentInput } from '../validators/consent';
import { hashIP } from '../utils/hash';

const CONSENT_DURATION_DAYS = 13 * 30; // ~13 mois

/**
 * Cree un nouveau consentement (nouvelle ligne, historique immuable).
 * Si consent_id est fourni, on cree une nouvelle version liee au meme consent_id.
 */
export async function createConsent(
  db: D1Database,
  input: ConsentInput,
  meta: { ip: string; salt: string; userAgent: string | null; country: string | null; userId: string | null }
): Promise<Consent> {
  const id = crypto.randomUUID();
  const consent_id = input.consent_id ?? crypto.randomUUID();
  const ip_hash = await hashIP(meta.ip, meta.salt);
  const now = new Date();
  const expires = new Date(now.getTime() + CONSENT_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const row: Consent = {
    id,
    consent_id,
    user_id: meta.userId,
    ip_hash,
    user_agent: meta.userAgent,
    country: meta.country,
    necessary: 1,
    functional: input.categories.functional ? 1 : 0,
    analytics: input.categories.analytics ? 1 : 0,
    marketing: input.categories.marketing ? 1 : 0,
    policy_version: input.policy_version,
    consent_method: input.consent_method,
    source_url: input.source_url ?? null,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    withdrawn_at: null,
    withdrawn_reason: null,
  };

  await db.prepare(
    `INSERT INTO cookie_consents
     (id, consent_id, user_id, ip_hash, user_agent, country,
      necessary, functional, analytics, marketing,
      policy_version, consent_method, source_url,
      created_at, expires_at, withdrawn_at, withdrawn_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id, row.consent_id, row.user_id, row.ip_hash, row.user_agent, row.country,
    row.necessary, row.functional, row.analytics, row.marketing,
    row.policy_version, row.consent_method, row.source_url,
    row.created_at, row.expires_at, row.withdrawn_at, row.withdrawn_reason
  ).run();

  return row;
}

/**
 * Recupere la version la plus recente d'un consent_id (celle qui fait foi actuellement).
 */
export async function getCurrentConsent(db: D1Database, consentId: string): Promise<Consent | null> {
  const result = await db.prepare(
    `SELECT * FROM cookie_consents
     WHERE consent_id = ?
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(consentId).first<Consent>();
  return result ?? null;
}

/**
 * Recupere tout l'historique d'un consent_id (pour audit RGPD).
 */
export async function getConsentHistory(db: D1Database, consentId: string): Promise<Consent[]> {
  const result = await db.prepare(
    `SELECT * FROM cookie_consents
     WHERE consent_id = ?
     ORDER BY created_at DESC`
  ).bind(consentId).all<Consent>();
  return result.results ?? [];
}

/**
 * Recupere un consentement par son id (row id, pas consent_id).
 */
export async function getConsentById(db: D1Database, id: string): Promise<Consent | null> {
  const result = await db.prepare(`SELECT * FROM cookie_consents WHERE id = ?`).bind(id).first<Consent>();
  return result ?? null;
}

/**
 * Recupere tous les consentements d'un utilisateur connecte (droit d'acces RGPD).
 */
export async function getUserConsents(db: D1Database, userId: string): Promise<Consent[]> {
  const result = await db.prepare(
    `SELECT * FROM cookie_consents
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).bind(userId).all<Consent>();
  return result.results ?? [];
}

/**
 * Verifie si un consentement est valide (non expire, non retire, policy version actuelle).
 */
export function isConsentValid(consent: Consent, currentPolicyVersion: string): boolean {
  if (consent.withdrawn_at) return false;
  if (new Date(consent.expires_at) < new Date()) return false;
  if (consent.policy_version !== currentPolicyVersion) return false;
  return true;
}

/**
 * Convertit une ligne Consent vers un objet ConsentCategories pour le front.
 */
export function consentToCategoriesPayload(consent: Consent) {
  return {
    necessary: true as const,
    functional: consent.functional === 1,
    analytics: consent.analytics === 1,
    marketing: consent.marketing === 1,
  };
}

/**
 * Marque un consent comme retire (RGPD : on ne supprime pas, on marque).
 * On cree une nouvelle ligne marquee comme retrait pour garder l'historique.
 */
export async function withdrawConsent(
  db: D1Database,
  consentId: string,
  reason: WithdrawReason = 'user_request'
): Promise<void> {
  const now = new Date().toISOString();
  // On update TOUTES les lignes du meme consent_id pour marquer le retrait
  await db.prepare(
    `UPDATE cookie_consents
     SET withdrawn_at = ?, withdrawn_reason = ?
     WHERE consent_id = ? AND withdrawn_at IS NULL`
  ).bind(now, reason, consentId).run();
}

/**
 * Liste paginee avec filtres (pour dashboard admin).
 */
export async function listConsents(
  db: D1Database,
  filters: ConsentFilters
): Promise<{ items: Consent[]; total: number; page: number; limit: number }> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.policy_version) {
    conditions.push('policy_version = ?');
    params.push(filters.policy_version);
  }
  if (filters.user_id) {
    conditions.push('user_id = ?');
    params.push(filters.user_id);
  }
  if (filters.consent_method) {
    conditions.push('consent_method = ?');
    params.push(filters.consent_method);
  }
  if (filters.date_from) {
    conditions.push('created_at >= ?');
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push('created_at <= ?');
    params.push(filters.date_to);
  }
  if (filters.status === 'active') {
    conditions.push('withdrawn_at IS NULL AND expires_at > ?');
    params.push(new Date().toISOString());
  } else if (filters.status === 'withdrawn') {
    conditions.push('withdrawn_at IS NOT NULL');
  } else if (filters.status === 'expired') {
    conditions.push('expires_at <= ?');
    params.push(new Date().toISOString());
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM cookie_consents ${where}`
  ).bind(...params).first<{ cnt: number }>();
  const total = countResult?.cnt ?? 0;

  const items = await db.prepare(
    `SELECT * FROM cookie_consents ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all<Consent>();

  return { items: items.results ?? [], total, page, limit };
}

/**
 * Statistiques agregees pour le dashboard.
 */
export async function getConsentStats(db: D1Database, days: number = 30): Promise<ConsentStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const result = await db.prepare(
    `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN consent_method = 'accept_all' THEN 1 ELSE 0 END) as accept_all,
        SUM(CASE WHEN consent_method = 'reject_all' THEN 1 ELSE 0 END) as reject_all,
        SUM(CASE WHEN consent_method = 'custom' THEN 1 ELSE 0 END) as custom,
        SUM(functional) as functional_accepted,
        SUM(analytics) as analytics_accepted,
        SUM(marketing) as marketing_accepted
     FROM cookie_consents
     WHERE created_at >= ?
       AND withdrawn_at IS NULL`
  ).bind(since).first<{
    total: number;
    accept_all: number;
    reject_all: number;
    custom: number;
    functional_accepted: number;
    analytics_accepted: number;
    marketing_accepted: number;
  }>();

  const total = result?.total ?? 0;
  const accept_all = result?.accept_all ?? 0;

  return {
    total,
    accept_all,
    reject_all: result?.reject_all ?? 0,
    custom: result?.custom ?? 0,
    functional_accepted: result?.functional_accepted ?? 0,
    analytics_accepted: result?.analytics_accepted ?? 0,
    marketing_accepted: result?.marketing_accepted ?? 0,
    acceptance_rate: total > 0 ? accept_all / total : 0,
    period_days: days,
  };
}

/**
 * Generator async pour streamer un export CSV (evite timeout Worker).
 */
export async function* exportConsentsCsv(
  db: D1Database,
  filters: ConsentFilters
): AsyncGenerator<string> {
  // Header CSV
  yield [
    'id','consent_id','user_id','ip_hash','country','user_agent',
    'necessary','functional','analytics','marketing',
    'policy_version','consent_method','source_url',
    'created_at','expires_at','withdrawn_at','withdrawn_reason'
  ].join(',') + '\n';

  const pageSize = 500;
  let page = 1;
  while (true) {
    const { items } = await listConsents(db, { ...filters, page, limit: pageSize });
    if (items.length === 0) break;

    for (const c of items) {
      const esc = (v: string | number | null) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      yield [
        c.id, c.consent_id, c.user_id, c.ip_hash, c.country, c.user_agent,
        c.necessary, c.functional, c.analytics, c.marketing,
        c.policy_version, c.consent_method, c.source_url,
        c.created_at, c.expires_at, c.withdrawn_at, c.withdrawn_reason
      ].map(esc).join(',') + '\n';
    }

    if (items.length < pageSize) break;
    page++;
  }
}
