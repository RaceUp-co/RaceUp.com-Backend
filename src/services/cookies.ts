/**
 * Services de gestion des cookies
 * 
 * Cookies créés :
 * - session_token : Cookie de session principal (HttpOnly, Secure, SameSite=Strict, 7 jours)
 * - csrf_token : Token CSRF pour protection des requêtes POST/PUT/DELETE (non HttpOnly, 7 jours)
 * - user_prefs : Préférences utilisateur (non HttpOnly, 1 an)
 * 
 * Note : Le cookie CookieConsent est géré automatiquement par Cookiebot
 */

import type { Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

// Durée des cookies en secondes
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours
const USER_PREFS_MAX_AGE = 60 * 60 * 24 * 365; // 1 an

// Domaines autorisés pour les cookies
const COOKIE_DOMAIN_PRODUCTION = '.raceup.com';

/**
 * Génère un token CSRF aléatoire (32 caractères hex)
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Détermine si on est en production (pour les options Secure)
 */
function isProduction(env: { ENVIRONMENT?: string }): boolean {
  return env.ENVIRONMENT === 'production';
}

/**
 * Configure le cookie de session (HttpOnly, Secure, SameSite=Strict)
 * Contient le refresh_token hashé pour identifier la session
 */
export function setSessionCookie(
  c: Context,
  refreshToken: string,
  env: { ENVIRONMENT?: string }
): void {
  const secure = isProduction(env);
  
  setCookie(c, 'session_token', refreshToken, {
    httpOnly: true, // Non accessible via JavaScript (protection XSS)
    secure, // HTTPS uniquement en production
    sameSite: 'Strict', // Protection CSRF
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
    // En production, on utilise le domaine principal pour partager entre sous-domaines
    ...(secure && { domain: COOKIE_DOMAIN_PRODUCTION }),
  });
}

/**
 * Configure le cookie CSRF (lisible côté client pour être envoyé dans les headers)
 */
export function setCsrfCookie(
  c: Context,
  csrfToken: string,
  env: { ENVIRONMENT?: string }
): void {
  const secure = isProduction(env);
  
  setCookie(c, 'csrf_token', csrfToken, {
    httpOnly: false, // Doit être lisible en JS pour être inclus dans les headers
    secure,
    sameSite: 'Strict',
    maxAge: CSRF_COOKIE_MAX_AGE,
    path: '/',
    ...(secure && { domain: COOKIE_DOMAIN_PRODUCTION }),
  });
}

/**
 * Configure le cookie de préférences utilisateur (thème, langue)
 */
export function setUserPrefsCookie(
  c: Context,
  prefs: { theme?: 'dark' | 'light'; locale?: string },
  env: { ENVIRONMENT?: string }
): void {
  const secure = isProduction(env);
  
  setCookie(c, 'user_prefs', JSON.stringify(prefs), {
    httpOnly: false, // Doit être lisible en JS
    secure,
    sameSite: 'Lax', // Plus permissif pour naviguer entre pages
    maxAge: USER_PREFS_MAX_AGE,
    path: '/',
    ...(secure && { domain: COOKIE_DOMAIN_PRODUCTION }),
  });
}

/**
 * Récupère le cookie de session
 */
export function getSessionCookie(c: Context): string | undefined {
  return getCookie(c, 'session_token');
}

/**
 * Récupère le cookie CSRF
 */
export function getCsrfCookie(c: Context): string | undefined {
  return getCookie(c, 'csrf_token');
}

/**
 * Récupère les préférences utilisateur depuis le cookie
 */
export function getUserPrefsCookie(c: Context): { theme?: string; locale?: string } | null {
  const prefs = getCookie(c, 'user_prefs');
  if (!prefs) return null;
  try {
    return JSON.parse(prefs);
  } catch {
    return null;
  }
}

/**
 * Supprime tous les cookies de session (logout)
 */
export function clearSessionCookies(c: Context, env: { ENVIRONMENT?: string }): void {
  const secure = isProduction(env);
  const options = {
    path: '/',
    ...(secure && { domain: COOKIE_DOMAIN_PRODUCTION }),
  };
  
  deleteCookie(c, 'session_token', options);
  deleteCookie(c, 'csrf_token', options);
}

/**
 * Valide le token CSRF depuis le header X-CSRF-Token contre le cookie
 */
export function validateCsrfToken(c: Context): boolean {
  const cookieToken = getCsrfCookie(c);
  const headerToken = c.req.header('X-CSRF-Token');
  
  if (!cookieToken || !headerToken) {
    return false;
  }
  
  // Comparaison en temps constant pour éviter les timing attacks
  return cookieToken === headerToken;
}
