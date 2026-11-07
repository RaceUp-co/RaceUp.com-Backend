import { Hono } from 'hono';
import type { AppType } from '../types';
import { updateDeliveryStatus } from '../services/email';

const emails = new Hono<AppType>();

// Webhook Resend : etat de livraison de chaque email envoye (livre, rebond, plainte).
// Sans lui, on ne sait jamais qu'une facture n'est jamais arrivee chez un client.
//
// Resend signe ses webhooks au format Svix : HMAC-SHA256 de `<id>.<timestamp>.<corps>`
// avec le secret `whsec_<base64>`. On verifie la signature a la main (pas de SDK Svix,
// qui n'est pas compatible Workers).

const TOLERANCE_SECONDS = 5 * 60; // rejette les rejeux au-dela de 5 minutes

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Comparaison a temps constant : evite de reveler la signature attendue octet par octet.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  signatureHeader: string,
  payload: string
): Promise<boolean> {
  const timestamp = Number.parseInt(svixTimestamp, 10);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) return false;

  // Le secret est transmis prefixe (`whsec_`) et encode en base64.
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(rawSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signed = `${svixId}.${svixTimestamp}.${payload}`;
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
  const expected = bytesToBase64(new Uint8Array(mac));

  // L'en-tete peut contenir plusieurs signatures (rotation de secret) : « v1,xxx v1,yyy ».
  return signatureHeader
    .split(' ')
    .map((part) => part.split(',', 2))
    .filter(([version]) => version === 'v1')
    .some(([, candidate]) => candidate != null && timingSafeEqual(candidate, expected));
}

type ResendWebhookEvent = {
  type?: string;
  data?: {
    email_id?: string;
    bounce?: { message?: string; type?: string; subType?: string };
    failed?: { reason?: string };
  };
};

// Correspondance evenement Resend -> statut stocke dans email_deliveries
const STATUS_BY_EVENT: Record<string, 'delivered' | 'delivery_delayed' | 'bounced' | 'complained' | 'failed'> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
};

// POST /api/emails/webhook — public, authentifie par la signature Svix
emails.post('/webhook', async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Webhook non configure : on accuse reception pour que Resend ne retente pas en boucle.
    return c.json({ received: true, ignored: 'RESEND_WEBHOOK_SECRET absent' });
  }

  const svixId = c.req.header('svix-id');
  const svixTimestamp = c.req.header('svix-timestamp');
  const svixSignature = c.req.header('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.json(
      { success: false, error: { code: 'INVALID_SIGNATURE', message: 'En-tetes de signature manquants.' } },
      400
    );
  }

  // Corps BRUT obligatoire : la signature porte sur les octets exacts recus.
  const payload = await c.req.text();

  const valid = await verifySvixSignature(secret, svixId, svixTimestamp, svixSignature, payload).catch(() => false);
  if (!valid) {
    return c.json(
      { success: false, error: { code: 'INVALID_SIGNATURE', message: 'Signature Resend invalide.' } },
      400
    );
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload) as ResendWebhookEvent;
  } catch {
    return c.json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Corps illisible.' } }, 400);
  }

  const status = event.type ? STATUS_BY_EVENT[event.type] : undefined;
  const emailId = event.data?.email_id;

  if (status && emailId) {
    const reason =
      event.data?.bounce?.message ??
      event.data?.failed?.reason ??
      (event.data?.bounce?.type ? `${event.data.bounce.type}/${event.data.bounce.subType ?? ''}` : null);
    await updateDeliveryStatus(c.env.DB, emailId, status, reason ? reason.slice(0, 500) : null);
  }

  // Tout evenement non exploite (email.sent, email.opened...) est simplement acquitte.
  return c.json({ received: true });
});

export default emails;
