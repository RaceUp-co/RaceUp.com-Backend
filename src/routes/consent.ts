/**
 * Routes de gestion des consentements cookies (RGPD)
 * 
 * Ces routes permettent de :
 * - Enregistrer le consentement d'un utilisateur (POST /consent)
 * - Récupérer l'historique des consentements (GET /consent)
 * 
 * Les données sont stockées dans Cloudflare KV avec un TTL de 3 ans
 * (conformité RGPD : conserver la preuve de consentement)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppType } from '../types';

const consent = new Hono<AppType>();

// Schéma de validation pour l'enregistrement du consentement
const consentSchema = z.object({
  userId: z.string().optional(), // Optionnel si utilisateur non connecté
  anonymousId: z.string().optional(), // ID anonyme pour les utilisateurs non connectés
  choices: z.object({
    necessary: z.boolean().default(true), // Toujours true, cookies essentiels
    preferences: z.boolean().optional(),
    statistics: z.boolean().optional(),
    marketing: z.boolean().optional(),
  }),
  bannerVersion: z.string().default('1.0'),
});

// TTL de 3 ans en secondes (conformité RGPD)
const CONSENT_TTL = 60 * 60 * 24 * 365 * 3;

/**
 * POST /api/consent - Enregistre le consentement d'un utilisateur
 * 
 * Body attendu :
 * - userId?: string (ID utilisateur si connecté)
 * - anonymousId?: string (ID anonyme si non connecté)
 * - choices: { necessary: true, preferences?: boolean, statistics?: boolean, marketing?: boolean }
 * - bannerVersion: string (version du bandeau pour traçabilité)
 */
consent.post('/', zValidator('json', consentSchema), async (c) => {
  const { userId, anonymousId, choices, bannerVersion } = c.req.valid('json');

  // Identifiant unique pour ce consentement
  const identifier = userId || anonymousId || 'anonymous';
  const timestamp = Date.now();
  const key = `consent:${identifier}:${timestamp}`;

  // Données à stocker
  const consentData = {
    userId: userId || null,
    anonymousId: anonymousId || null,
    choices,
    bannerVersion,
    timestamp: new Date().toISOString(),
    ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
    userAgent: c.req.header('User-Agent') || 'unknown',
    country: c.req.header('CF-IPCountry') || 'unknown',
  };

  try {
    await c.env.KV_CONSENT.put(key, JSON.stringify(consentData), {
      expirationTtl: CONSENT_TTL,
    });

    // Stocke aussi le dernier consentement pour accès rapide
    const latestKey = `consent:${identifier}:latest`;
    await c.env.KV_CONSENT.put(latestKey, JSON.stringify(consentData), {
      expirationTtl: CONSENT_TTL,
    });

    return c.json({
      success: true,
      data: {
        message: 'Consentement enregistré.',
        consentId: key,
      },
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du consentement:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CONSENT_STORAGE_ERROR',
          message: 'Erreur lors de l\'enregistrement du consentement.',
        },
      },
      500
    );
  }
});

/**
 * GET /api/consent - Récupère l'historique des consentements d'un utilisateur
 * 
 * Query params :
 * - userId: string (ID utilisateur)
 * - limit?: number (nombre max de résultats, défaut 10)
 * 
 * Utile pour les demandes d'export RGPD
 */
consent.get('/', async (c) => {
  const userId = c.req.query('userId');
  const anonymousId = c.req.query('anonymousId');
  const limit = parseInt(c.req.query('limit') || '10', 10);

  const identifier = userId || anonymousId;

  if (!identifier) {
    return c.json(
      {
        success: false,
        error: {
          code: 'MISSING_IDENTIFIER',
          message: 'userId ou anonymousId requis.',
        },
      },
      400
    );
  }

  try {
    // Récupère le dernier consentement
    const latestKey = `consent:${identifier}:latest`;
    const latest = await c.env.KV_CONSENT.get(latestKey);

    // Liste tous les consentements de cet utilisateur
    const listResult = await c.env.KV_CONSENT.list({
      prefix: `consent:${identifier}:`,
      limit: limit + 1, // +1 pour exclure "latest"
    });

    const consents = [];
    for (const key of listResult.keys) {
      if (key.name.endsWith(':latest')) continue;
      const value = await c.env.KV_CONSENT.get(key.name);
      if (value) {
        consents.push({
          key: key.name,
          ...JSON.parse(value),
        });
      }
    }

    return c.json({
      success: true,
      data: {
        latest: latest ? JSON.parse(latest) : null,
        history: consents,
        total: consents.length,
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des consentements:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CONSENT_FETCH_ERROR',
          message: 'Erreur lors de la récupération des consentements.',
        },
      },
      500
    );
  }
});

/**
 * GET /api/consent/latest - Récupère le dernier consentement d'un utilisateur
 * 
 * Query params :
 * - userId ou anonymousId: string
 */
consent.get('/latest', async (c) => {
  const userId = c.req.query('userId');
  const anonymousId = c.req.query('anonymousId');

  const identifier = userId || anonymousId;

  if (!identifier) {
    return c.json(
      {
        success: false,
        error: {
          code: 'MISSING_IDENTIFIER',
          message: 'userId ou anonymousId requis.',
        },
      },
      400
    );
  }

  try {
    const latestKey = `consent:${identifier}:latest`;
    const latest = await c.env.KV_CONSENT.get(latestKey);

    if (!latest) {
      return c.json({
        success: true,
        data: null,
      });
    }

    return c.json({
      success: true,
      data: JSON.parse(latest),
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du consentement:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CONSENT_FETCH_ERROR',
          message: 'Erreur lors de la récupération du consentement.',
        },
      },
      500
    );
  }
});

export default consent;
