import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import {
  consentInputSchema,
  withdrawInputSchema,
  consentStatusQuerySchema,
} from '../validators/consent';
import {
  createConsent,
  getCurrentConsent,
  withdrawConsent,
  isConsentValid,
  consentToCategoriesPayload,
  getUserConsents,
} from '../services/consent';
import { hashIP, getClientIP } from '../utils/hash';
import { authMiddleware } from '../middleware/auth';

const consent = new Hono<AppType>();

/**
 * POST /api/consent — Enregistre un nouveau consentement.
 * Optionnellement authentifie (si JWT present, lie au user_id).
 */
consent.post('/', zValidator('json', consentInputSchema), async (c) => {
  const input = c.req.valid('json');
  const db = c.env.DB;
  const salt = c.env.CONSENT_SALT;

  if (!salt) {
    return c.json({ success: false, error: { code: 'MISSING_SECRET', message: 'CONSENT_SALT not set' } }, 500);
  }

  const ip = getClientIP(c.req.raw.headers);
  const userAgent = c.req.header('user-agent') ?? null;
  const country = c.req.header('CF-IPCountry') ?? null;

  // Si JWT present, extraire user_id (optionnel)
  let userId: string | null = null;
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { verifyAccessToken } = await import('../services/token');
      const payload = await verifyAccessToken(authHeader.slice(7), c.env.JWT_SECRET);
      userId = payload?.sub ?? null;
    } catch {
      // token invalide → ignore, reste anonyme
    }
  }

  const row = await createConsent(db, input, { ip, salt, userAgent, country, userId });

  return c.json({
    success: true,
    data: {
      consent_id: row.consent_id,
      expires_at: row.expires_at,
      policy_version: row.policy_version,
    },
  });
});

/**
 * GET /api/consent/status?consent_id=xxx
 * Verifie si un consent est valide + retourne les categories.
 */
consent.get('/status', zValidator('query', consentStatusQuerySchema), async (c) => {
  const { consent_id } = c.req.valid('query');
  const db = c.env.DB;
  const currentPolicy = c.env.POLICY_VERSION ?? 'v1.0.0';

  const row = await getCurrentConsent(db, consent_id);
  if (!row) {
    return c.json({ success: true, data: { valid: false, reason: 'not_found' } });
  }

  const valid = isConsentValid(row, currentPolicy);
  return c.json({
    success: true,
    data: {
      valid,
      reason: valid
        ? null
        : row.withdrawn_at
          ? 'withdrawn'
          : row.policy_version !== currentPolicy
            ? 'outdated_policy'
            : 'expired',
      categories: consentToCategoriesPayload(row),
      expires_at: row.expires_at,
      policy_version: row.policy_version,
      current_policy_version: currentPolicy,
    },
  });
});

/**
 * GET /api/consent/policy
 * Retourne la version actuelle de la politique + description des categories.
 */
consent.get('/policy', (c) => {
  return c.json({
    success: true,
    data: {
      version: c.env.POLICY_VERSION ?? 'v1.0.0',
      categories: [
        { id: 'necessary', label: 'Necessaires', required: true,
          description: 'Cookies indispensables au fonctionnement du site (authentification, preferences linguistiques, cookie de consentement).' },
        { id: 'functional', label: 'Fonctionnels', required: false,
          description: 'Cookies qui ameliorent votre experience (memorisation de vos preferences UI).' },
        { id: 'analytics', label: 'Analytics', required: false,
          description: 'Cookies qui nous aident a comprendre comment vous utilisez le site (Google Analytics, suivi interne).' },
        { id: 'marketing', label: 'Marketing', required: false,
          description: 'Cookies utilises par nos partenaires publicitaires (Meta Pixel, etc.).' },
      ],
    },
  });
});

/**
 * POST /api/consent/withdraw
 * L'utilisateur retire son consentement (sans supprimer la preuve).
 */
consent.post('/withdraw', zValidator('json', withdrawInputSchema), async (c) => {
  const { consent_id, reason } = c.req.valid('json');
  const db = c.env.DB;
  await withdrawConsent(db, consent_id, reason ?? 'user_request');
  return c.json({ success: true });
});

/**
 * GET /api/consent/my-consents
 * Droit d'acces RGPD — liste les consents d'un user connecte.
 */
consent.get('/my-consents', authMiddleware, async (c) => {
  const db = c.env.DB;
  const payload = c.get('jwtPayload');
  const consents = await getUserConsents(db, payload.sub);
  return c.json({ success: true, data: consents });
});

export default consent;
