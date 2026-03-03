/**
 * Service de gestion des cookies de session
 * Cookie essentiel pour la persistance de connexion (HttpOnly, Secure)
 */

import type { Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

// Durée du cookie : 7 jours (même durée que le refresh token)
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

// Domaine en production
const COOKIE_DOMAIN_PRODUCTION = '.raceup.com';

/**
 * Vérifie si l'environnement est en production
 */
function isProduction(env: { ENVIRONMENT?: string }): boolean {
  return env.ENVIRONMENT === 'production';
}

/**
 * Configure le cookie de session contenant le refresh token
 * - HttpOnly : non accessible via JavaScript (protection XSS)
 * - Secure : HTTPS uniquement en production
 * - SameSite=Lax : envoyé sur les navigations normales, bloqué sur les requêtes cross-site POST
 */
export function setSessionCookie(
  c: Context,
  refreshToken: string,
  env: { ENVIRONMENT?: string }
): void {
  const secure = isProduction(env);
  
  setCookie(c, 'raceup_session', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
    ...(secure && { domain: COOKIE_DOMAIN_PRODUCTION }),
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
  const secure = isProduction(env);
  
  deleteCookie(c, 'raceup_session', {
    path: '/',
    ...(secure && { domain: COOKIE_DOMAIN_PRODUCTION }),
  });
}
