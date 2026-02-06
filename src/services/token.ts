import { sign, verify } from 'hono/jwt';

export async function generateAccessToken(
  userId: string,
  email: string,
  secret: string,
  expirySeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    email,
    iat: now,
    exp: now + expirySeconds,
  };
  return sign(payload, secret, 'HS256');
}

export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<{ sub: string; email: string; iat: number; exp: number }> {
  const payload = await verify(token, secret, 'HS256');
  return payload as { sub: string; email: string; iat: number; exp: number };
}

export function generateRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashRefreshToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
