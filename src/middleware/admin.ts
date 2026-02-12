import type { Context, Next } from 'hono';
import type { AppType } from '../types';
import { getUserById } from '../services/user';

// Autorise admin et super_admin
export async function adminMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const payload = c.get('jwtPayload');

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
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

  c.set('currentUser', user);
  await next();
}

// Autorise uniquement super_admin
export async function superAdminMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const payload = c.get('jwtPayload');

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || user.role !== 'super_admin') {
    return c.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Accès réservé aux super-administrateurs.',
        },
      },
      403
    );
  }

  c.set('currentUser', user);
  await next();
}
