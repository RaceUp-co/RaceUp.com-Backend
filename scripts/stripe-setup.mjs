#!/usr/bin/env node
/**
 * Active le paiement en ligne (Stripe) sur l'API de production, en une commande :
 *   1. crée (ou recrée) l'endpoint webhook Stripe pointant vers /api/payments/webhook ;
 *   2. pose les secrets STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET via `wrangler secret put` ;
 *   3. vérifie que GET /api/payments/config renvoie enabled: true.
 * Les secrets ne sont jamais affichés ni écrits sur disque (transmis à wrangler par stdin).
 *
 * Usage :
 *   node scripts/stripe-setup.mjs            (la clé est demandée, saisie masquée)
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs
 *
 * Clé attendue : clé secrète Stripe (sk_live_ / sk_test_) ou clé restreinte (rk_...) avec les
 * permissions : Checkout Sessions (write), Customers (write), Payment Intents (read),
 * Charges (read), Invoices (read) et Webhook Endpoints (write, pour ce script).
 */

import Stripe from 'stripe';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const API_URL = 'https://raceup-backend-api.jacqueslucas-m2101.workers.dev';
const WEBHOOK_URL = `${API_URL}/api/payments/webhook`;
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
];

// ─── Saisie masquée ─────────────────────────────────────────────────────────
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

// ─── Secret Wrangler (valeur transmise par stdin, jamais en argument) ──────
function putSecret(name, value) {
  const result = spawnSync('npx', ['wrangler', 'secret', 'put', name], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(`wrangler secret put ${name} a échoué`);
}

const key = process.env.STRIPE_SECRET_KEY || (await askHidden('Clé secrète Stripe (sk_... / rk_...) : '));
if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(key)) {
  console.error('✗ Format de clé invalide (attendu : sk_live_..., sk_test_..., rk_live_... ou rk_test_...).');
  process.exit(1);
}
const live = /^(sk|rk)_live_/.test(key);
console.log(`→ Mode ${live ? 'PRODUCTION (paiements réels)' : 'TEST (aucun paiement réel)'}`);

const stripe = new Stripe(key);

// 1. Webhook : on remplace un éventuel endpoint existant sur la même URL (le secret de
//    signature n'est lisible qu'à la création).
const existing = await stripe.webhookEndpoints.list({ limit: 100 });
for (const endpoint of existing.data.filter((e) => e.url === WEBHOOK_URL)) {
  await stripe.webhookEndpoints.del(endpoint.id);
  console.log(`→ Ancien webhook supprimé (${endpoint.id})`);
}

const webhook = await stripe.webhookEndpoints.create({
  url: WEBHOOK_URL,
  enabled_events: WEBHOOK_EVENTS,
  api_version: Stripe.API_VERSION,
  description: 'RaceUp API — paiements (acomptes du configurateur + échéances)',
});
console.log(`✓ Webhook créé (${webhook.id}) → ${WEBHOOK_URL}`);

// 2. Secrets Cloudflare (déclenche un nouveau déploiement de l'API avec les secrets)
putSecret('STRIPE_SECRET_KEY', key);
putSecret('STRIPE_WEBHOOK_SECRET', webhook.secret);
console.log('✓ Secrets STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET enregistrés');

// 3. Vérification
const res = await fetch(`${API_URL}/api/payments/config`, { headers: { 'Cache-Control': 'no-cache' } });
const json = await res.json().catch(() => null);
if (json?.data?.enabled) {
  console.log('✓ Paiement en ligne ACTIF : le configurateur du site encaisse désormais les acomptes.');
} else {
  console.log("⚠ L'API ne signale pas encore le paiement actif (propagation en cours ?). Revérifier dans 1 minute :");
  console.log(`  ${API_URL}/api/payments/config`);
}
