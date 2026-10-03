import { Hono } from 'hono';
import type { AppType, OrderStatus } from '../../types';
import { Layout } from '../layout';
import { StatCard } from '../components/stat-card';
import { Pagination } from '../components/table';
import { OrdersTable, ORDER_STATUS_OPTIONS, formatCents } from '../components/payments';
import {
  cancelMilestoneOrder,
  createOrder,
  getOrderById,
  getOrderStats,
  isOrderPayable,
  listOrdersAdmin,
  listOrdersByProject,
} from '../../services/order';
import { isPaymentsEnabled, isStripeLiveMode, stripeDashboardPaymentUrl } from '../../services/stripe';

const paymentsRoutes = new Hono<AppType>();

// Liste des paiements (acomptes + echeances) avec statistiques d'encaissement
paymentsRoutes.get('/payments', async (c) => {
  const session = c.get('dashboardSession');
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 50;
  const statusParam = c.req.query('status') ?? '';
  const status = ORDER_STATUS_OPTIONS.some((o) => o.value === statusParam) ? (statusParam as OrderStatus) : undefined;
  const msg = c.req.query('msg') ?? '';

  const [{ orders, total }, stats] = await Promise.all([
    listOrdersAdmin(c.env.DB, { page, limit, status }),
    getOrderStats(c.env.DB),
  ]);

  const enabled = isPaymentsEnabled(c.env);
  const live = isStripeLiveMode(c.env);

  return c.html(
    <Layout title="Paiements" currentPath="/dashboard/payments" role={session.role}>
      {!enabled ? (
        <div style="background:#2a1515;border:1px solid #ff6b6b;color:#ff6b6b;padding:12px;font-size:13px;margin-bottom:16px;border-radius:4px;">
          Paiement en ligne DESACTIVE : secrets STRIPE_SECRET_KEY et/ou STRIPE_WEBHOOK_SECRET manquants
          (wrangler secret put). Le configurateur du site bascule sur la demande de devis.
        </div>
      ) : (
        <div style={`background:${live ? '#152a15' : '#2a2a15'};border:1px solid ${live ? '#4caf50' : '#ff9f43'};color:${live ? '#4caf50' : '#ff9f43'};padding:8px 12px;font-size:12px;margin-bottom:16px;border-radius:4px;font-weight:600;`}>
          Stripe connecte — mode {live ? 'PRODUCTION (paiements reels)' : 'TEST (aucun paiement reel)'}
        </div>
      )}

      {msg === 'canceled' && (
        <div style="background:#2a2a15;border:1px solid #ff9f43;color:#ff9f43;padding:8px;font-size:12px;margin-bottom:12px;border-radius:3px;">
          Echeance annulee.
        </div>
      )}

      <div class="stats-grid">
        <StatCard label="CA encaisse" value={formatCents(stats.revenue_cents)} />
        <StatCard label="CA 30 derniers jours" value={formatCents(stats.revenue_30d_cents)} />
        <StatCard label="Paiements regles" value={stats.paid_count} />
        <StatCard
          label="A encaisser"
          value={formatCents(stats.awaiting_cents)}
          delta={`${stats.awaiting_count} paiement(s) en attente`}
        />
        <StatCard label="Rembourse" value={formatCents(stats.refunded_cents)} />
      </div>

      <div class="filters">
        <form method="get" action="/dashboard/payments" style="display:flex;gap:8px;align-items:center;">
          <select name="status">
            <option value="">Tous (hors paniers abandonnes)</option>
            {ORDER_STATUS_OPTIONS.map((o) => (
              <option value={o.value} selected={status === o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="submit">Filtrer</button>
        </form>
      </div>

      <OrdersTable
        orders={orders}
        showCustomer
        showProject
        stripePaymentUrl={(pi) => stripeDashboardPaymentUrl(c.env, pi)}
        cancelAction={(o) => (isOrderPayable(o) ? `/dashboard/payments/${o.id}/cancel` : null)}
      />

      <Pagination
        basePath="/dashboard/payments"
        page={page}
        total={total}
        limit={limit}
        queryParams={status ? `status=${status}` : ''}
      />

      <p style="color:#707090;font-size:12px;margin-top:16px;max-width:720px;">
        Les echeances (40 % beta, 20 % mise en ligne) se demandent depuis la fiche d'un projet.
        Les remboursements se font depuis le dashboard Stripe : le statut est synchronise automatiquement.
      </p>
    </Layout>
  );
});

// Annule une echeance encore payable (jamais un paiement regle)
paymentsRoutes.post('/payments/:id/cancel', async (c) => {
  const order = await getOrderById(c.env.DB, c.req.param('id'));
  if (!order) return c.redirect('/dashboard/payments');

  await cancelMilestoneOrder(c.env.DB, order.id);

  if (c.req.query('from') === 'project' && order.project_id) {
    return c.redirect(`/dashboard/projects/${order.project_id}?msg=payment_canceled`);
  }
  return c.redirect('/dashboard/payments?msg=canceled');
});

// Demande d'echeance sur un projet : le client la voit dans son espace et la regle via Stripe
paymentsRoutes.post('/projects/:id/payments', async (c) => {
  const projectId = c.req.param('id');
  const project = await c.env.DB.prepare(
    `SELECT p.id, p.user_id, p.service_type, u.email, u.first_name, u.last_name
     FROM projects p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = ? AND p.is_archived = 0`
  )
    .bind(projectId)
    .first<{
      id: string;
      user_id: string | null;
      service_type: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
    }>();

  if (!project) return c.redirect('/dashboard/projects');
  if (!project.user_id || !project.email) return c.redirect(`/dashboard/projects/${projectId}?msg=payment_invalid`);

  const body = await c.req.parseBody();
  const description = String(body['description'] ?? '').trim().slice(0, 200);
  // Accepte "1 234,56" comme "1234.56"
  const amount = Number(String(body['amount'] ?? '').replace(/\s/g, '').replace(',', '.'));
  const amountCents = Math.round(amount * 100);

  if (description.length < 3 || !Number.isFinite(amount) || amountCents < 100 || amountCents > 10_000_000) {
    return c.redirect(`/dashboard/projects/${projectId}?msg=payment_invalid`);
  }

  const existing = await listOrdersByProject(c.env.DB, projectId);
  const deposit = existing.find((o) => o.kind === 'deposit' && o.status === 'paid');
  const name = `${project.first_name ?? ''} ${project.last_name ?? ''}`.trim();

  await createOrder(c.env.DB, {
    user_id: project.user_id,
    customer_email: project.email,
    customer_name: name || null,
    project_id: projectId,
    kind: 'milestone',
    service_type: project.service_type,
    config: null,
    description,
    amount_cents: amountCents,
    project_total_cents: deposit?.project_total_cents ?? null,
    status: 'awaiting_payment',
    lang: deposit?.lang ?? 'fr',
    terms_accepted_at: null,
    created_by: 'admin',
  });

  return c.redirect(`/dashboard/projects/${projectId}?msg=payment_requested`);
});

export default paymentsRoutes;
