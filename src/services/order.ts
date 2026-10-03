import type { Order, OrderKind, OrderStatus } from '../types';

const ORDER_COLUMNS =
  'id, user_id, customer_email, customer_name, project_id, kind, service_type, config, description, amount_cents, project_total_cents, currency, status, stripe_session_id, stripe_payment_intent_id, receipt_url, lang, terms_accepted_at, created_by, created_at, updated_at, paid_at, refunded_at';

// Statuts visibles par le client dans son espace (les sessions d'acompte abandonnees,
// expirees ou annulees n'ont aucune valeur pour lui).
const CLIENT_VISIBLE_FILTER =
  "(status IN ('awaiting_payment', 'processing', 'paid', 'failed', 'refunded') OR (kind = 'milestone' AND status = 'pending'))";

// Une echeance reste payable tant qu'elle n'est ni reglee ni annulee
// (une session Checkout abandonnee peut etre remplacee par une nouvelle).
export function isOrderPayable(order: Pick<Order, 'kind' | 'status'>): boolean {
  return order.kind === 'milestone' && (order.status === 'awaiting_payment' || order.status === 'pending');
}

export async function createOrder(
  db: D1Database,
  data: {
    user_id: string;
    customer_email: string;
    customer_name: string | null;
    project_id: string | null;
    kind: OrderKind;
    service_type: string | null;
    config: string | null;
    description: string;
    amount_cents: number;
    project_total_cents: number | null;
    status: OrderStatus;
    lang: string;
    terms_accepted_at: string | null;
    created_by: 'user' | 'admin';
  }
): Promise<Order> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO orders (id, user_id, customer_email, customer_name, project_id, kind, service_type, config, description,
         amount_cents, project_total_cents, currency, status, lang, terms_accepted_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'eur', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.user_id,
      data.customer_email,
      data.customer_name,
      data.project_id,
      data.kind,
      data.service_type,
      data.config,
      data.description,
      data.amount_cents,
      data.project_total_cents,
      data.status,
      data.lang,
      data.terms_accepted_at,
      data.created_by,
      now,
      now
    )
    .run();

  return {
    id,
    ...data,
    currency: 'eur',
    stripe_session_id: null,
    stripe_payment_intent_id: null,
    receipt_url: null,
    created_at: now,
    updated_at: now,
    paid_at: null,
    refunded_at: null,
  };
}

export async function getOrderById(db: D1Database, id: string): Promise<Order | null> {
  return (await db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`).bind(id).first<Order>()) ?? null;
}

export async function deleteOrder(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();
}

// Acompte deja initie (double clic, second onglet...) : meme utilisateur, meme configuration,
// session encore recente -> on reutilise la session Stripe au lieu d'en ouvrir une nouvelle.
export async function findReusableDepositOrder(
  db: D1Database,
  userId: string,
  config: string,
  amountCents: number
): Promise<Order | null> {
  return (
    (await db
      .prepare(
        `SELECT ${ORDER_COLUMNS} FROM orders
         WHERE user_id = ? AND kind = 'deposit' AND status = 'pending' AND config = ? AND amount_cents = ?
           AND stripe_session_id IS NOT NULL AND created_at >= ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(userId, config, amountCents, new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .first<Order>()) ?? null
  );
}

export async function attachCheckoutSession(db: D1Database, orderId: string, sessionId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE orders SET stripe_session_id = ?, status = 'pending', updated_at = ?
       WHERE id = ? AND status IN ('awaiting_payment', 'pending')`
    )
    .bind(sessionId, new Date().toISOString(), orderId)
    .run();
}

export async function listOrdersByUser(
  db: D1Database,
  userId: string,
  projectId?: string
): Promise<Order[]> {
  const where = projectId ? 'AND project_id = ?' : '';
  const bindings = projectId ? [userId, projectId] : [userId];
  const result = await db
    .prepare(
      `SELECT ${ORDER_COLUMNS} FROM orders
       WHERE user_id = ? AND ${CLIENT_VISIBLE_FILTER} ${where}
       ORDER BY created_at DESC LIMIT 200`
    )
    .bind(...bindings)
    .all<Order>();
  return result.results;
}

export async function listOrdersByProject(db: D1Database, projectId: string): Promise<Order[]> {
  const result = await db
    .prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE project_id = ? ORDER BY created_at DESC`)
    .bind(projectId)
    .all<Order>();
  return result.results;
}

// Liste admin paginee, filtrable par statut. Par defaut, masque les sessions d'acompte
// abandonnees ('pending'/'expired' sur un acompte) qui ne sont que du bruit.
export async function listOrdersAdmin(
  db: D1Database,
  filters: { page: number; limit: number; status?: OrderStatus }
): Promise<{ orders: Order[]; total: number }> {
  const where = filters.status
    ? 'WHERE status = ?'
    : "WHERE NOT (kind = 'deposit' AND status IN ('pending', 'expired'))";
  const bindings: unknown[] = filters.status ? [filters.status] : [];
  const offset = (filters.page - 1) * filters.limit;

  const [rows, count] = await Promise.all([
    db
      .prepare(`SELECT ${ORDER_COLUMNS} FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, filters.limit, offset)
      .all<Order>(),
    db.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`).bind(...bindings).first<{ total: number }>(),
  ]);

  return { orders: rows.results, total: count?.total ?? 0 };
}

export type OrderStats = {
  revenue_cents: number; // total encaisse (hors rembourse)
  revenue_30d_cents: number;
  paid_count: number;
  awaiting_count: number; // echeances a regler + paiements en cours de traitement
  awaiting_cents: number;
  refunded_cents: number;
};

export async function getOrderStats(db: D1Database): Promise<OrderStats> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents END), 0) AS revenue_cents,
         COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= ? THEN amount_cents END), 0) AS revenue_30d_cents,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 END), 0) AS paid_count,
         COALESCE(SUM(CASE WHEN status IN ('awaiting_payment', 'processing') OR (kind = 'milestone' AND status = 'pending') THEN 1 END), 0) AS awaiting_count,
         COALESCE(SUM(CASE WHEN status IN ('awaiting_payment', 'processing') OR (kind = 'milestone' AND status = 'pending') THEN amount_cents END), 0) AS awaiting_cents,
         COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount_cents END), 0) AS refunded_cents
       FROM orders`
    )
    .bind(since30d)
    .first<OrderStats>();

  return {
    revenue_cents: row?.revenue_cents ?? 0,
    revenue_30d_cents: row?.revenue_30d_cents ?? 0,
    paid_count: row?.paid_count ?? 0,
    awaiting_count: row?.awaiting_count ?? 0,
    awaiting_cents: row?.awaiting_cents ?? 0,
    refunded_cents: row?.refunded_cents ?? 0,
  };
}

// ---------- Transitions de statut (toutes idempotentes) ----------

// Paiement differe (SEPA...) : session terminee, fonds pas encore confirmes.
export async function markOrderProcessing(
  db: D1Database,
  orderId: string,
  paymentIntentId: string | null
): Promise<void> {
  await db
    .prepare(
      `UPDATE orders SET status = 'processing', stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id), updated_at = ?
       WHERE id = ? AND status IN ('awaiting_payment', 'pending')`
    )
    .bind(paymentIntentId, new Date().toISOString(), orderId)
    .run();
}

// Confirme le paiement. Appelee par le webhook ET par la page de confirmation : le premier
// arrive gagne, le second est un no-op. Pour un acompte, le projet est cree dans la MEME
// transaction (batch D1) avec l'id reserve a la commande -> jamais de doublon.
export async function fulfillOrder(
  db: D1Database,
  order: Order,
  data: {
    paymentIntentId: string | null;
    receiptUrl: string | null;
    project: { name: string; description: string; tier: string } | null;
  }
): Promise<{ fulfilled: boolean }> {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?),
           stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
           receipt_url = COALESCE(?, receipt_url), updated_at = ?
         WHERE id = ? AND status IN ('awaiting_payment', 'pending', 'processing', 'failed', 'expired')`
      )
      .bind(now, data.paymentIntentId, data.receiptUrl, now, order.id),
  ];

  if (order.kind === 'deposit' && order.project_id && order.user_id && data.project) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO projects (id, user_id, name, description, status, service_type, tier, start_date,
             end_date, progress, last_update, is_archived, created_by, created_at, updated_at)
           SELECT ?, ?, ?, ?, 'in_progress', ?, ?, ?, NULL, 0, ?, 0, 'user', ?, ?
           WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')`
        )
        .bind(
          order.project_id,
          order.user_id,
          data.project.name,
          data.project.description,
          order.service_type ?? 'custom',
          data.project.tier,
          now,
          now,
          now,
          now,
          order.id
        )
    );
  }

  const results = await db.batch(statements);
  return { fulfilled: (results[0]?.meta?.changes ?? 0) > 0 };
}

export async function setOrderReceiptUrl(db: D1Database, orderId: string, receiptUrl: string): Promise<void> {
  await db
    .prepare('UPDATE orders SET receipt_url = ?, updated_at = ? WHERE id = ? AND receipt_url IS NULL')
    .bind(receiptUrl, new Date().toISOString(), orderId)
    .run();
}

// Echec d'un paiement differe : un acompte echoue definitivement, une echeance redevient payable.
export async function markOrderFailed(db: D1Database, order: Order): Promise<void> {
  const next: OrderStatus = order.kind === 'milestone' ? 'awaiting_payment' : 'failed';
  await db
    .prepare(
      `UPDATE orders SET status = ?, updated_at = ?,
         stripe_session_id = CASE WHEN ? = 'awaiting_payment' THEN NULL ELSE stripe_session_id END
       WHERE id = ? AND status IN ('pending', 'processing')`
    )
    .bind(next, new Date().toISOString(), next, order.id)
    .run();
}

// Session Checkout expiree. Seulement si c'est bien la session COURANTE de la commande
// (une echeance peut avoir ete relancee avec une nouvelle session entre-temps).
export async function markOrderExpired(db: D1Database, order: Order, sessionId: string): Promise<void> {
  const now = new Date().toISOString();
  if (order.kind === 'milestone') {
    await db
      .prepare(
        `UPDATE orders SET status = 'awaiting_payment', stripe_session_id = NULL, updated_at = ?
         WHERE id = ? AND status = 'pending' AND stripe_session_id = ?`
      )
      .bind(now, order.id, sessionId)
      .run();
    return;
  }
  await db
    .prepare(`UPDATE orders SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending' AND stripe_session_id = ?`)
    .bind(now, order.id, sessionId)
    .run();
}

// Remboursement integral constate par Stripe (charge.refunded).
export async function markOrderRefundedByPaymentIntent(db: D1Database, paymentIntentId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE orders SET status = 'refunded', refunded_at = ?, updated_at = ?
       WHERE stripe_payment_intent_id = ? AND status = 'paid'`
    )
    .bind(now, now, paymentIntentId)
    .run();
}

// Annulation d'une echeance par un admin (jamais un paiement deja regle).
export async function cancelMilestoneOrder(db: D1Database, orderId: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE orders SET status = 'canceled', updated_at = ?
       WHERE id = ? AND kind = 'milestone' AND status IN ('awaiting_payment', 'pending')`
    )
    .bind(new Date().toISOString(), orderId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

// Representation publique (contrat partage avec le front : RaceUp.com/src/types/account.ts -> Purchase).
export type PublicOrder = {
  id: string;
  date: string;
  description: string;
  service_type: string | null;
  kind: OrderKind;
  project_id: string | null;
  amount: number; // euros
  project_total: number | null; // euros
  currency: string;
  status: OrderStatus;
  invoice_url: string | null;
  payable: boolean;
  customer_email?: string;
};

export function toPublicOrder(order: Order, options: { includeCustomer?: boolean } = {}): PublicOrder {
  return {
    id: order.id,
    date: order.paid_at ?? order.created_at,
    description: order.description,
    service_type: order.service_type,
    kind: order.kind,
    // Un acompte non regle n'a pas (encore) de projet : ne pas exposer l'id reserve
    project_id: order.kind === 'deposit' && order.status !== 'paid' && order.status !== 'refunded' ? null : order.project_id,
    amount: order.amount_cents / 100,
    project_total: order.project_total_cents !== null ? order.project_total_cents / 100 : null,
    currency: order.currency.toUpperCase(),
    status: order.status,
    invoice_url: order.receipt_url,
    payable: isOrderPayable(order),
    ...(options.includeCustomer && { customer_email: order.customer_email }),
  };
}
