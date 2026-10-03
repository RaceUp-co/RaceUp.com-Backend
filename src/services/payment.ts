import type Stripe from 'stripe';
import type { Bindings, Order, User } from '../types';
import {
  CATALOG,
  describeConfiguration,
  isServiceId,
  priceConfiguration,
} from '../data/catalog';
import {
  attachCheckoutSession,
  createOrder,
  deleteOrder,
  findReusableDepositOrder,
  fulfillOrder,
  getOrderById,
  markOrderExpired,
  markOrderFailed,
  markOrderProcessing,
  markOrderRefundedByPaymentIntent,
  setOrderReceiptUrl,
} from './order';
import { getOrCreateStripeCustomer } from './stripe';

// Orchestration Stripe Checkout : creation des sessions (acompte du configurateur,
// echeances) et synchronisation de l'etat des commandes (webhook + page de confirmation).

type Lang = 'fr' | 'en';

const COMPANY_SIRET = '999 028 780 00016'; // mentions legales (cf. front src/data/legal.ts)

const TEXTS = {
  fr: {
    depositName: (service: string) => `Acompte de 40 % — ${service}`,
    totalPrice: 'Prix total du projet',
    balance: 'Le solde est réglé par étapes : 40 % à la validation de la bêta, 20 % à la mise en ligne.',
    vat: 'TVA non applicable, art. 293 B du CGI',
    orderDescription: (service: string, config: string) => `Acompte 40 % — ${service} : ${config}`,
    projectDescription: (config: string, total: string, deposit: string) =>
      `Configuration : ${config}.\nPrix total : ${total} — acompte de 40 % (${deposit}) réglé en ligne.`,
  },
  en: {
    depositName: (service: string) => `40% deposit — ${service}`,
    totalPrice: 'Total project price',
    balance: 'The balance is paid in stages: 40% when the beta is approved, 20% at launch.',
    vat: 'VAT not applicable, art. 293 B of the French General Tax Code (CGI)',
    orderDescription: (service: string, config: string) => `40% deposit — ${service}: ${config}`,
    projectDescription: (config: string, total: string, deposit: string) =>
      `Configuration: ${config}.\nTotal price: ${total} — 40% deposit (${deposit}) paid online.`,
  },
} as const;

export function formatEuros(cents: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function fullName(user: Pick<User, 'first_name' | 'last_name'>): string {
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
}

function asLang(value: string | null | undefined): Lang {
  return value === 'en' ? 'en' : 'fr';
}

export type CheckoutResult =
  | { ok: true; url: string; orderId: string }
  | { ok: false; status: 400 | 409 | 502; code: string; message: string };

const PROVIDER_ERROR: CheckoutResult = {
  ok: false,
  status: 502,
  code: 'PAYMENT_PROVIDER_ERROR',
  message: 'Le service de paiement est momentanément indisponible. Réessayez dans quelques instants.',
};

// Parametres communs a toutes les sessions : client Stripe rattache, adresse de facturation
// et n° de TVA (B2B), facture Stripe conforme (mention art. 293 B + SIRET).
function baseSessionParams(
  env: Bindings,
  customerId: string,
  order: Order,
  lang: Lang
): Stripe.Checkout.SessionCreateParams {
  const t = TEXTS[lang];
  const invoices = env.STRIPE_INVOICE_CREATION === 'true';
  return {
    mode: 'payment',
    customer: customerId,
    customer_update: { name: 'auto', address: 'auto' },
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    client_reference_id: order.id,
    locale: lang,
    metadata: { order_id: order.id, kind: order.kind, user_id: order.user_id ?? '' },
    payment_intent_data: {
      description: order.description,
      metadata: { order_id: order.id, kind: order.kind },
    },
    ...(invoices && {
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: order.description,
          footer: t.vat,
          custom_fields: [{ name: 'SIRET', value: COMPANY_SIRET }],
          metadata: { order_id: order.id },
        },
      },
    }),
  };
}

// ---------- Acompte depuis le configurateur ----------

export type DepositCheckoutInput = {
  service_type: string;
  base: string;
  options: string[];
  expected_total: number; // euros, tel qu'affiche au client
  lang: Lang;
};

export async function createDepositCheckout(
  env: Bindings,
  stripe: Stripe,
  user: User,
  input: DepositCheckoutInput,
  siteOrigin: string
): Promise<CheckoutResult> {
  const priced = priceConfiguration(input.service_type, input.base, input.options);
  if (!priced.ok) {
    return { ok: false, status: 400, code: 'INVALID_CONFIGURATION', message: 'Configuration de projet invalide.' };
  }
  const config = priced.value;

  // Le client doit payer exactement le prix qu'il a vu : en cas d'ecart (catalogue mis a jour
  // pendant sa visite), on refuse plutot que de facturer un autre montant.
  if (config.totalCents !== Math.round(input.expected_total * 100)) {
    return {
      ok: false,
      status: 409,
      code: 'PRICE_MISMATCH',
      message: `Les tarifs ont été mis à jour (nouveau total : ${formatEuros(config.totalCents, 'fr')}). Rechargez la page.`,
    };
  }

  const lang = input.lang;
  const t = TEXTS[lang];
  const serviceTitle = CATALOG[config.service].title[lang];
  const configLabel = describeConfiguration(config, lang);
  const optionIds = config.options.map((o) => o.id);
  const configJson = JSON.stringify({ base: config.base.id, options: optionIds });

  try {
    // Double clic / second onglet : on renvoie la session encore ouverte
    const reusable = await findReusableDepositOrder(env.DB, user.id, configJson, config.depositCents);
    if (reusable?.stripe_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(reusable.stripe_session_id).catch(() => null);
      if (existing?.status === 'open' && existing.url) {
        return { ok: true, url: existing.url, orderId: reusable.id };
      }
    }

    const customerId = await getOrCreateStripeCustomer(env, stripe, user, lang);

    const order = await createOrder(env.DB, {
      user_id: user.id,
      customer_email: user.email,
      customer_name: fullName(user) || null,
      project_id: crypto.randomUUID(), // reserve : le projet est cree a la confirmation du paiement
      kind: 'deposit',
      service_type: config.service,
      config: configJson,
      description: t.orderDescription(serviceTitle, configLabel),
      amount_cents: config.depositCents,
      project_total_cents: config.totalCents,
      status: 'pending',
      lang,
      terms_accepted_at: new Date().toISOString(),
      created_by: 'user',
    });

    // Retour au configurateur avec la meme configuration si le client annule
    const cancelQuery = new URLSearchParams({ base: config.base.id });
    if (optionIds.length > 0) cancelQuery.set('options', optionIds.join(','));
    cancelQuery.set('canceled', '1');

    try {
      const session = await stripe.checkout.sessions.create(
        {
          ...baseSessionParams(env, customerId, order, lang),
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'eur',
                unit_amount: config.depositCents,
                product_data: {
                  name: t.depositName(serviceTitle),
                  description: `${configLabel} · ${t.totalPrice} : ${formatEuros(config.totalCents, lang)}`,
                },
              },
            },
          ],
          custom_text: { submit: { message: t.balance } },
          success_url: `${siteOrigin}/${lang}/paiement/confirmation/?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteOrigin}/${lang}/services/${config.service}/?${cancelQuery.toString()}`,
        },
        { idempotencyKey: `raceup-checkout-${order.id}` }
      );

      if (!session.url) throw new Error('Session Checkout sans URL');
      await attachCheckoutSession(env.DB, order.id, session.id);
      return { ok: true, url: session.url, orderId: order.id };
    } catch (err) {
      // La commande n'a jamais atteint Stripe : on ne garde pas de ligne orpheline
      await deleteOrder(env.DB, order.id);
      throw err;
    }
  } catch (err) {
    console.error('Stripe deposit checkout error', err);
    return PROVIDER_ERROR;
  }
}

// ---------- Echeance demandee par un admin ----------

export async function createMilestoneCheckout(
  env: Bindings,
  stripe: Stripe,
  user: User,
  order: Order,
  siteOrigin: string
): Promise<CheckoutResult> {
  const lang = asLang(order.lang);

  try {
    // Une seule session active par echeance. Si la precedente a deja ete payee (webhook pas
    // encore recu), on synchronise au lieu d'encaisser une seconde fois.
    if (order.stripe_session_id) {
      const previous = await stripe.checkout.sessions.retrieve(order.stripe_session_id).catch(() => null);
      if (previous?.status === 'complete') {
        await syncCheckoutSession(env, stripe, previous);
        return { ok: false, status: 409, code: 'ALREADY_PAID', message: 'Ce paiement a déjà été effectué.' };
      }
      if (previous?.status === 'open') {
        await stripe.checkout.sessions.expire(previous.id).catch(() => null);
      }
    }

    const customerId = await getOrCreateStripeCustomer(env, stripe, user, lang);
    const session = await stripe.checkout.sessions.create({
      ...baseSessionParams(env, customerId, order, lang),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: order.amount_cents,
            product_data: { name: order.description },
          },
        },
      ],
      success_url: `${siteOrigin}/${lang}/paiement/confirmation/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin}/${lang}/account/project/${order.project_id}/?payment=canceled`,
    });

    if (!session.url) throw new Error('Session Checkout sans URL');
    await attachCheckoutSession(env.DB, order.id, session.id);
    return { ok: true, url: session.url, orderId: order.id };
  } catch (err) {
    console.error('Stripe milestone checkout error', err);
    return PROVIDER_ERROR;
  }
}

// ---------- Synchronisation (webhook + page de confirmation) ----------

// Projet cree a la confirmation d'un acompte. Les montants viennent de la commande
// (ce que le client a reellement paye), pas d'un recalcul du catalogue.
function buildDepositProject(order: Order): { name: string; description: string; tier: string } {
  const lang = asLang(order.lang);
  let config: { base?: string; options?: string[] } = {};
  try {
    config = JSON.parse(order.config ?? '{}');
  } catch {
    // config illisible : libelles de repli
  }

  const service = order.service_type && isServiceId(order.service_type) ? order.service_type : null;
  const priced = service && config.base ? priceConfiguration(service, config.base, config.options ?? []) : null;
  const serviceTitle = service ? CATALOG[service].title[lang] : order.service_type ?? 'Projet';
  const baseLabel = priced?.ok ? priced.value.base.label[lang] : config.base ?? '';
  const configLabel = priced?.ok ? describeConfiguration(priced.value, lang) : order.description;

  return {
    name: baseLabel ? `${serviceTitle} — ${baseLabel}` : serviceTitle,
    description: TEXTS[lang].projectDescription(
      configLabel,
      formatEuros(order.project_total_cents ?? 0, lang),
      formatEuros(order.amount_cents, lang)
    ),
    tier: config.base ?? '',
  };
}

// Facture Stripe (si creee) sinon recu de paiement. Best effort : jamais bloquant.
async function findReceiptUrl(stripe: Stripe, sessionId: string): Promise<string | null> {
  try {
    const full = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['invoice', 'payment_intent.latest_charge'],
    });
    const invoice = full.invoice;
    if (invoice && typeof invoice !== 'string' && invoice.hosted_invoice_url) return invoice.hosted_invoice_url;
    const paymentIntent = full.payment_intent;
    if (paymentIntent && typeof paymentIntent !== 'string') {
      const charge = paymentIntent.latest_charge;
      if (charge && typeof charge !== 'string' && charge.receipt_url) return charge.receipt_url;
    }
  } catch (err) {
    console.error('Stripe receipt lookup failed', err);
  }
  return null;
}

// Applique l'etat d'une session Checkout a la commande correspondante. Idempotent.
export async function syncCheckoutSession(
  env: Bindings,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  options: { asyncFailed?: boolean } = {}
): Promise<Order | null> {
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) return null;
  const order = await getOrderById(env.DB, orderId);
  if (!order) return null;

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

  if (options.asyncFailed) {
    await markOrderFailed(env.DB, order);
  } else if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    if (order.status !== 'paid' && order.status !== 'refunded') {
      const receiptUrl = await findReceiptUrl(stripe, session.id);
      await fulfillOrder(env.DB, order, {
        paymentIntentId,
        receiptUrl,
        project: order.kind === 'deposit' ? buildDepositProject(order) : null,
      });
    } else if (!order.receipt_url) {
      const receiptUrl = await findReceiptUrl(stripe, session.id);
      if (receiptUrl) await setOrderReceiptUrl(env.DB, order.id, receiptUrl);
    }
  } else if (session.status === 'complete') {
    await markOrderProcessing(env.DB, order.id, paymentIntentId);
  } else if (session.status === 'expired') {
    await markOrderExpired(env.DB, order, session.id);
  }

  return getOrderById(env.DB, orderId);
}

// Remboursement integral (charge.refunded). Un remboursement partiel ne change pas le statut.
export async function handleChargeRefunded(env: Bindings, charge: Stripe.Charge): Promise<void> {
  if (!charge.refunded) return;
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
  if (paymentIntentId) await markOrderRefundedByPaymentIntent(env.DB, paymentIntentId);
}
