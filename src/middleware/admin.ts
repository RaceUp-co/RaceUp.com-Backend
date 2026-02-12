import type { Context, Next } from 'hono';
import type { AppType } from '../types';
import { getUserById } from '../services/user';

export async function adminMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const payload = c.get('jwtPayload');

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || user.role !== 'admin') {
    return c.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Accès réservé aux administrateurs.',
        },
      },
      403
    );
  }

  await next();
}
