import type { Context, Next } from 'hono';
import type { AppType } from '../types';
import { verifyAccessToken } from '../services/token';
import { getSessionCookie } from '../services/cookies';
import { hashRefreshToken } from '../services/token';
import { getRefreshToken } from '../services/user';

/**
 * Middleware d'authentification via Bearer token (Authorization header)
 * Utilisé pour les requêtes API classiques
 */
export async function authMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token d\'authentification manquant.',
        },
      },
      401
    );
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
    c.set('jwtPayload', payload);
    await next();
  } catch {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token invalide ou expiré.',
        },
      },
      401
    );
  }
}

/**
 * Middleware d'authentification via cookie de session (session_token)
 * Utilisé pour les requêtes où l'access token n'est pas disponible (ex: logout)
 */
export async function cookieAuthMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const sessionToken = getSessionCookie(c);

  if (!sessionToken) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session invalide.',
        },
      },
      401
    );
  }

  try {
    const tokenHash = await hashRefreshToken(sessionToken);
    const storedToken = await getRefreshToken(c.env.DB, tokenHash);

    if (!storedToken) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Session expirée.',
          },
        },
        401
      );
    }

    c.set('cookieUserId', storedToken.user_id);
    await next();
  } catch {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Erreur de validation de session.',
        },
      },
      401
    );
  }
}
