import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppType, DashboardSession } from '../types';
import { getUserByEmail } from '../services/user';
import { verifyPassword } from '../services/password';

const COOKIE_NAME = 'dashboard_session';
const SESSION_DURATION = 7200; // 2 hours in seconds

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function createSessionCookie(
  c: Context<AppType>,
  userId: string,
  email: string,
  role: string
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  const payload: DashboardSession = { userId, email, role, exp };
  const payloadStr = JSON.stringify(payload);

  const encoder = new TextEncoder();
  const key = await getHmacKey(c.env.JWT_SECRET);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr));

  const payloadB64 = base64UrlEncode(encoder.encode(payloadStr));
  const sigB64 = base64UrlEncode(signature);
  const cookieValue = `${payloadB64}.${sigB64}`;

  const hostname = new URL(c.req.url).hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isRaceupDomain = hostname.endsWith('.race-up.net') || hostname === 'race-up.net';
  setCookie(c, COOKIE_NAME, cookieValue, {
    path: '/dashboard',
    httpOnly: true,
    secure: !isLocal,
    sameSite: 'Strict',
    maxAge: SESSION_DURATION,
    ...(isRaceupDomain ? { domain: '.race-up.net' } : {}),
  });
}

export async function verifySessionCookie(
  c: Context<AppType>
): Promise<DashboardSession | null> {
  const cookie = getCookie(c, COOKIE_NAME);
  if (!cookie) return null;

  const parts = cookie.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;

  try {
    const payloadBytes = base64UrlDecode(payloadB64);
    const signatureBytes = base64UrlDecode(sigB64);

    const key = await getHmacKey(c.env.JWT_SECRET);
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);
    if (!valid) return null;

    const decoder = new TextDecoder();
    const payload: DashboardSession = JSON.parse(decoder.decode(payloadBytes));

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export function clearSessionCookie(c: Context<AppType>): void {
  deleteCookie(c, COOKIE_NAME, { path: '/dashboard' });
}

export async function dashboardAuthMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const session = await verifySessionCookie(c);
  if (!session) {
    return c.redirect('/dashboard/login');
  }

  c.set('dashboardSession', session);
  await next();
}

export async function superAdminDashboardMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const session = c.get('dashboardSession');
  if (session.role !== 'super_admin') {
    return c.html('<h1>403 — Acces reserve aux super-administrateurs</h1>', 403);
  }
  await next();
}

export async function authenticateDashboardUser(
  c: Context<AppType>,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; userId?: string; role?: string }> {
  const user = await getUserByEmail(c.env.DB, email);
  if (!user) {
    return { success: false, error: 'Email ou mot de passe incorrect.' };
  }

  if (!user.password_hash) {
    return { success: false, error: 'Compte OAuth — connexion par mot de passe impossible.' };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return { success: false, error: 'Email ou mot de passe incorrect.' };
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return { success: false, error: 'Acces reserve aux administrateurs.' };
  }

  return { success: true, userId: user.id, role: user.role };
}
