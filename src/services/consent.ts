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
