/**
 * Hash SHA-256 d'une IP avec un sel secret.
 * Utilise l'API Web Crypto native des Workers.
 * L'IP n'est JAMAIS stockee en clair (conformite RGPD).
 */
export async function hashIP(ip: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${ip}:${salt}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extrait l'IP du client depuis les headers Cloudflare.
 * Fallback sur X-Forwarded-For si CF-Connecting-IP absent.
 */
export function getClientIP(headers: Headers): string {
  return (
    headers.get('CF-Connecting-IP') ||
    headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
    'unknown'
  );
}
