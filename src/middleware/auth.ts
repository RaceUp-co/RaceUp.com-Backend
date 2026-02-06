import type { Context, Next } from 'hono';
import type { AppType } from '../types';
import { verifyAccessToken } from '../services/token';

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
