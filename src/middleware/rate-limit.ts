import type { Context, Next } from 'hono';
import type { AppType, RateLimiterName } from '../types';
import { getClientIP } from '../utils/hash';

// Limitation de debit par IP (binding Workers Rate Limiting, cf. wrangler.toml [[ratelimits]]) :
// anti brute-force (connexion, suppression de compte) et anti-spam (formulaires publics).
// `scope` separe les compteurs par endpoint. Sans binding (dev local, tests) : aucune limite.
export function rateLimit(
  limiter: RateLimiterName,
  scope: string,
  onLimited?: (c: Context<AppType>) => Response | Promise<Response>
) {
  return async (c: Context<AppType>, next: Next): Promise<Response | void> => {
    const binding = c.env[limiter];
    if (binding) {
      const { success } = await binding.limit({ key: `${scope}:${getClientIP(c.req.raw.headers)}` });
      if (!success) {
        if (onLimited) return onLimited(c);
        return c.json(
          {
            success: false,
            error: { code: 'RATE_LIMITED', message: 'Trop de tentatives. Réessayez dans une minute.' },
          },
          429
        );
      }
    }
    await next();
  };
}
