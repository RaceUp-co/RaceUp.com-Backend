import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type Stripe from 'stripe';
import type { AppType } from '../types';
import { authMiddleware } from '../middleware/auth';
import { getUserById } from '../services/user';
import { DEPOSIT_RATE } from '../data/catalog';
import { constructWebhookEvent, getStripe, isPaymentsEnabled } from '../services/stripe';
import {
  createDepositCheckout,
  createMilestoneCheckout,
  handleChargeRefunded,
  syncCheckoutSession,
} from '../services/payment';
import { getOrderById, isOrderPayable, listOrdersByUser, toPublicOrder } from '../services/order';
import { depositCheckoutSchema, ordersQuerySchema, validationHook } from '../validators/payments';
import { resolveSiteOrigin } from '../utils/origins';

const payments = new Hono<AppType>();

function paymentsUnavailable(c: Context<AppType>) {
  return c.json(
    {
      success: false,
      error: { code: 'PAYMENTS_UNAVAILABLE', message: 'Le paiement en ligne est momentanément indisponible.' },
    },
    503
  );
}

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

// GET /api/payments/config — public : le front adapte le configurateur (paiement ou devis)
payments.get('/config', (c) => {
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    success: true,
    data: { enabled: isPaymentsEnabled(c.env), deposit_rate: DEPOSIT_RATE },
  });
});

// POST /api/payments/webhook — public, authentifie par la signature Stripe (corps brut)
payments.post('/webhook', async (c) => {
  const stripe = getStripe(c.env);
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return paymentsUnavailable(c);

  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Signature Stripe manquante.' } }, 400);
  }

  const payload = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await constructWebhookEvent(stripe, payload, signature, secret);
  } catch {
    return c.json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Signature Stripe invalide.' } }, 400);
  }

  // Une exception remonte en 500 (onError global) : Stripe re-tentera la livraison.
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.expired':
      await syncCheckoutSession(c.env, stripe, event.data.object);
      break;
    case 'checkout.session.async_payment_failed':
      await syncCheckoutSession(c.env, stripe, event.data.object, { asyncFailed: true });
      break;
    case 'charge.refunded':
      await handleChargeRefunded(c.env, event.data.object);
      break;
    default:
      // Evenement non exploite : on accuse simplement reception
      break;
  }

  return c.json({ received: true });
});

// POST /api/payments/checkout — acompte de 40 % depuis le configurateur (JWT)
payments.post(
  '/checkout',
  authMiddleware,
  zValidator('json', depositCheckoutSchema, validationHook),
  async (c) => {
    const stripe = getStripe(c.env);
    if (!stripe || !isPaymentsEnabled(c.env)) return paymentsUnavailable(c);

    const user = await getUserById(c.env.DB, c.get('jwtPayload').sub);
    if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

    const result = await createDepositCheckout(
      c.env,
      stripe,
      user,
      c.req.valid('json'),
      resolveSiteOrigin(c.req.header('Origin'), c.env.SITE_URL)
    );
    if (!result.ok) {
      return c.json({ success: false, error: { code: result.code, message: result.message } }, result.status);
    }
    return c.json({ success: true, data: { url: result.url, order_id: result.orderId } }, 201);
  }
);

// GET /api/payments/checkout/:sessionId — etat d'un paiement pour la page de confirmation (JWT).
// Synchronise avec Stripe : le client voit son projet meme si le webhook n'est pas encore arrive.
payments.get('/checkout/:sessionId', authMiddleware, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return paymentsUnavailable(c);

  const user = await getUserById(c.env.DB, c.get('jwtPayload').sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const notFound = () =>
    c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Paiement introuvable.' } }, 404);

  const sessionId = c.req.param('sessionId');
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return notFound();

  const session = await stripe.checkout.sessions.retrieve(sessionId).catch(() => null);
  const orderId = session?.metadata?.order_id || session?.client_reference_id;
  const order = session && orderId ? await getOrderById(c.env.DB, orderId) : null;
  if (!session || !order) return notFound();
  if (order.user_id !== user.id && !isAdminRole(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès interdit.' } }, 403);
  }

  const synced = (await syncCheckoutSession(c.env, stripe, session)) ?? order;
  return c.json({ success: true, data: { order: toPublicOrder(synced) } });
});

// GET /api/payments/orders?project_id= — paiements de l'utilisateur courant (JWT)
payments.get('/orders', authMiddleware, zValidator('query', ordersQuerySchema, validationHook), async (c) => {
  const { project_id } = c.req.valid('query');
  const orders = await listOrdersByUser(c.env.DB, c.get('jwtPayload').sub, project_id);
  return c.json({ success: true, data: { orders: orders.map((o) => toPublicOrder(o)) } });
});

// POST /api/payments/orders/:id/checkout — regler une echeance demandee par RaceUp (JWT, proprietaire)
payments.post('/orders/:id/checkout', authMiddleware, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe || !isPaymentsEnabled(c.env)) return paymentsUnavailable(c);

  const user = await getUserById(c.env.DB, c.get('jwtPayload').sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const order = await getOrderById(c.env.DB, c.req.param('id'));
  if (!order || order.user_id !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Paiement introuvable.' } }, 404);
  }
  if (!isOrderPayable(order)) {
    return c.json(
      { success: false, error: { code: 'INVALID_STATE', message: "Ce paiement n'est plus à régler." } },
      409
    );
  }

  const result = await createMilestoneCheckout(
    c.env,
    stripe,
    user,
    order,
    resolveSiteOrigin(c.req.header('Origin'), c.env.SITE_URL)
  );
  if (!result.ok) {
    return c.json({ success: false, error: { code: result.code, message: result.message } }, result.status);
  }
  return c.json({ success: true, data: { url: result.url, order_id: result.orderId } });
});

export default payments;
