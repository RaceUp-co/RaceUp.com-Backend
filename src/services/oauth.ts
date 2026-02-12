// Service de vérification des tokens OAuth (Google, Apple)

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

export interface AppleTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email: string;
  email_verified: string | boolean;
}

// Vérifie un access token Google en appelant l'API userinfo
export async function verifyGoogleToken(
  accessToken: string
): Promise<GoogleUserInfo | null> {
  try {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as GoogleUserInfo;
    if (!data.email) return null;

    return data;
  } catch {
    return null;
  }
}

// Décode un segment base64url sans vérification
function decodeBase64Url(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return binary;
}

// Convertit une chaîne base64url en Uint8Array
function base64UrlToUint8Array(str: string): Uint8Array {
  const binary = decodeBase64Url(str);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// Vérifie un ID token Apple (JWT signé par Apple)
export async function verifyAppleToken(
  idToken: string,
  clientId: string
): Promise<AppleTokenPayload | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // 1. Décoder le header pour obtenir le kid (Key ID)
    const header = JSON.parse(decodeBase64Url(headerB64));
    const kid = header.kid;
    if (!kid || header.alg !== 'RS256') return null;

    // 2. Récupérer les clés publiques d'Apple (JWKS)
    const jwksResponse = await fetch('https://appleid.apple.com/auth/keys');
    if (!jwksResponse.ok) return null;

    const jwks = (await jwksResponse.json()) as { keys: JsonWebKey[] };
    const key = (jwks.keys as (JsonWebKey & { kid: string })[]).find(
      (k) => k.kid === kid
    );
    if (!key) return null;

    // 3. Importer la clé publique RSA
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // 4. Vérifier la signature JWT
    const signedData = new TextEncoder().encode(
      `${headerB64}.${payloadB64}`
    );
    const signature = base64UrlToUint8Array(signatureB64);

    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      signedData
    );
    if (!isValid) return null;

    // 5. Décoder et valider le payload
    const payload = JSON.parse(
      decodeBase64Url(payloadB64)
    ) as AppleTokenPayload;

    // Vérifier l'émetteur
    if (payload.iss !== 'https://appleid.apple.com') return null;
    // Vérifier l'audience (notre Service ID)
    if (payload.aud !== clientId) return null;
    // Vérifier l'expiration
    if (payload.exp * 1000 < Date.now()) return null;
    // L'email doit être présent
    if (!payload.email) return null;

    return payload;
  } catch {
    return null;
  }
}
