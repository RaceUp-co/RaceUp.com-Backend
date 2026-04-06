/**
 * Service de gestion des cookies de session
 * Cookie essentiel pour la persistance de connexion (HttpOnly, Secure)
 */

import type { Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

// Durée du cookie : 7 jours (même durée que le refresh token)
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Vérifie si l'environnement est en production
 */
function isProduction(env: { ENVIRONMENT?: string }, c?: Context): boolean {
  if (c) {
    const hostname = new URL(c.req.url).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  }
  return env.ENVIRONMENT === 'production';
}

/**
 * Détermine le domaine du cookie en fonction du hostname de l'API.
 * Retourne undefined si le domaine est un sous-domaine workers.dev (pas de cookie domain nécessaire).
 */
function getCookieDomain(c: Context): string | undefined {
  const hostname = new URL(c.req.url).hostname;
  // Sur workers.dev, ne pas forcer de domaine — le navigateur utilisera le domaine exact
  if (hostname.endsWith('.workers.dev') || hostname === 'localhost' || hostname === '127.0.0.1') {
    return undefined;
  }
  // Sur un domaine custom (ex: api.race-up.net), utiliser le domaine parent
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return '.' + parts.slice(-2).join('.');
  }
  return undefined;
}

/**
 * Configure le cookie de session contenant le refresh token
 * - HttpOnly : non accessible via JavaScript (protection XSS)
 * - Secure + SameSite=None en production (cross-origin workers.dev → frontend)
 * - SameSite=Lax en local (même origine)
 */
export function setSessionCookie(
  c: Context,
  refreshToken: string,
  env: { ENVIRONMENT?: string }
): void {
  const prod = isProduction(env, c);
  const domain = getCookieDomain(c);

  setCookie(c, 'raceup_session', refreshToken, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'None' : 'Lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
    ...(domain && { domain }),
  });
}

/**
 * Récupère le refresh token depuis le cookie de session
 */
export function getSessionCookie(c: Context): string | undefined {
  return getCookie(c, 'raceup_session');
}

/**
 * Supprime le cookie de session (logout)
 */
export function clearSessionCookie(c: Context, env: { ENVIRONMENT?: string }): void {
  const secure = isProduction(env, c);
  
  const domain = getCookieDomain(c);

  deleteCookie(c, 'raceup_session', {
    path: '/',
    ...(domain && { domain }),
  });
}
