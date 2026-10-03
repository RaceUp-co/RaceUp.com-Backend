import Stripe from 'stripe';
import type { Bindings, User } from '../types';

// Client Stripe compatible Cloudflare Workers (fetch + SubtleCrypto).
// null si STRIPE_SECRET_KEY n'est pas configure.
export function getStripe(env: Bindings): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    appInfo: { name: 'raceup-backend-api' },
  });
}

// Verification de signature des webhooks via WebCrypto (pas de module crypto Node).
const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Verifie la signature (corps brut + en-tete stripe-signature) et renvoie l'evenement.
// Leve une exception si la signature est invalide ou trop ancienne (tolerance 5 min).
export function constructWebhookEvent(
  stripe: Stripe,
  payload: string,
  signature: string,
  secret: string
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(payload, signature, secret, undefined, cryptoProvider);
}

// Le paiement en ligne n'est actif que si les DEUX secrets sont poses : sans le secret
// webhook, remboursements / paiements differes / expirations ne seraient pas synchronises.
export function isPaymentsEnabled(env: Bindings): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

// Cle de test (sk_test_ / rk_test_) ou de production.
export function isStripeLiveMode(env: Bindings): boolean {
  return /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? '');
}

// Lien vers un paiement dans le dashboard Stripe (prefixe /test en mode test).
export function stripeDashboardPaymentUrl(env: Bindings, paymentIntentId: string): string {
  return `https://dashboard.stripe.com/${isStripeLiveMode(env) ? '' : 'test/'}payments/${paymentIntentId}`;
}

// Client Stripe unique par utilisateur (et par mode test/live) : factures, adresse de
// facturation et moyens de paiement sont regroupes cote Stripe.
export async function getOrCreateStripeCustomer(
  env: Bindings,
  stripe: Stripe,
  user: Pick<User, 'id' | 'email' | 'first_name' | 'last_name'>,
  lang: 'fr' | 'en'
): Promise<string> {
  const livemode = isStripeLiveMode(env) ? 1 : 0;
  const select = env.DB.prepare('SELECT customer_id FROM stripe_customers WHERE user_id = ? AND livemode = ?').bind(
    user.id,
    livemode
  );

  const existing = await select.first<{ customer_id: string }>();
  if (existing) return existing.customer_id;

  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  // Cle d'idempotence : deux requetes simultanees obtiennent le meme client Stripe.
  const customer = await stripe.customers.create(
    {
      email: user.email,
      ...(name && { name }),
      preferred_locales: [lang],
      metadata: { user_id: user.id },
    },
    { idempotencyKey: `raceup-customer-${user.id}-${livemode}` }
  );

  await env.DB.prepare(
    'INSERT OR IGNORE INTO stripe_customers (user_id, livemode, customer_id, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(user.id, livemode, customer.id, new Date().toISOString())
    .run();

  return (await select.first<{ customer_id: string }>())?.customer_id ?? customer.id;
}
