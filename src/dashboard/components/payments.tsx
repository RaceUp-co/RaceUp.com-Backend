import type { FC } from 'hono/jsx';
import type { Order, OrderStatus } from '../../types';

// Composants partages par /dashboard/payments et le detail projet.
// Rendu JSX uniquement (echappement automatique des donnees client).

const STATUS_STYLES: Record<OrderStatus, { label: string; color: string }> = {
  awaiting_payment: { label: 'A regler', color: '#ff9f43' },
  pending: { label: 'Checkout ouvert', color: '#4a9eff' },
  processing: { label: 'En traitement', color: '#ff9f43' },
  paid: { label: 'Paye', color: '#4caf50' },
  failed: { label: 'Echoue', color: '#ff4444' },
  expired: { label: 'Expire', color: '#707090' },
  refunded: { label: 'Rembourse', color: '#ff6b6b' },
  canceled: { label: 'Annule', color: '#707090' },
};

export const ORDER_STATUS_OPTIONS = Object.entries(STATUS_STYLES).map(([value, s]) => ({ value, label: s.label }));

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} EUR`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}

export const OrderStatusBadge: FC<{ status: OrderStatus }> = ({ status }) => {
  const s = STATUS_STYLES[status] ?? { label: status, color: '#707090' };
  return (
    <span class="badge" style={`background:${s.color}22;color:${s.color};`}>
      {s.label}
    </span>
  );
};

type OrdersTableProps = {
  orders: Order[];
  showCustomer?: boolean;
  showProject?: boolean;
  stripePaymentUrl: (paymentIntentId: string) => string;
  // Formulaire d'annulation pour les echeances encore payables
  cancelAction?: (order: Order) => string | null;
};

export const OrdersTable: FC<OrdersTableProps> = ({ orders, showCustomer, showProject, stripePaymentUrl, cancelAction }) => {
  const colCount = 5 + (showCustomer ? 1 : 0) + (showProject ? 1 : 0) + 2;
  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          {showCustomer && <th>Client</th>}
          <th>Type</th>
          <th>Description</th>
          <th>Montant</th>
          <th>Statut</th>
          {showProject && <th>Projet</th>}
          <th>Facture / Stripe</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 ? (
          <tr>
            <td colspan={colCount} style="text-align:center;color:#707090;padding:20px;">
              Aucun paiement
            </td>
          </tr>
        ) : (
          orders.map((o) => {
            const cancelUrl = cancelAction ? cancelAction(o) : null;
            return (
              <tr>
                <td>{formatDate(o.paid_at ?? o.created_at)}</td>
                {showCustomer && (
                  <td>{o.user_id ? <a href={`/dashboard/users/${o.user_id}`}>{o.customer_email}</a> : o.customer_email}</td>
                )}
                <td>{o.kind === 'deposit' ? 'Acompte' : 'Echeance'}</td>
                <td>{o.description}</td>
                <td style="white-space:nowrap;">{formatCents(o.amount_cents)}</td>
                <td>
                  <OrderStatusBadge status={o.status} />
                </td>
                {showProject && (
                  <td>
                    {o.project_id && (o.kind === 'milestone' || o.status === 'paid' || o.status === 'refunded') ? (
                      <a href={`/dashboard/projects/${o.project_id}`}>Voir</a>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td style="white-space:nowrap;">
                  {o.receipt_url && (
                    <a href={o.receipt_url} target="_blank" rel="noopener noreferrer">
                      Facture
                    </a>
                  )}
                  {o.receipt_url && o.stripe_payment_intent_id && ' · '}
                  {o.stripe_payment_intent_id && (
                    <a href={stripePaymentUrl(o.stripe_payment_intent_id)} target="_blank" rel="noopener noreferrer">
                      Stripe
                    </a>
                  )}
                  {!o.receipt_url && !o.stripe_payment_intent_id && '—'}
                </td>
                <td>
                  {cancelUrl ? (
                    <form method="post" action={cancelUrl} style="display:inline;">
                      <button type="submit" class="btn btn-danger" style="padding:3px 8px;font-size:11px;">
                        Annuler
                      </button>
                    </form>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
};

// Suggestion de la prochaine echeance selon l'echeancier des CGV (40 % / 40 % / 20 %),
// a partir de l'acompte paye depuis le configurateur.
export function suggestNextMilestone(orders: Order[]): { label: string; amountCents: number } | null {
  const deposit = orders.find((o) => o.kind === 'deposit' && (o.status === 'paid' || o.status === 'processing'));
  if (!deposit?.project_total_cents) return null;

  const active = orders.filter((o) => o.status !== 'canceled' && o.status !== 'expired' && o.status !== 'refunded' && o.status !== 'failed');
  const milestones = active.filter((o) => o.kind === 'milestone');
  const committed = active.reduce((sum, o) => sum + o.amount_cents, 0);
  const remaining = deposit.project_total_cents - committed;
  if (remaining <= 0) return null;

  const en = deposit.lang === 'en';
  if (milestones.length === 0) {
    return {
      label: en ? 'Payment 2/3 — beta approval (40%)' : 'Échéance 2/3 — validation de la bêta (40 %)',
      amountCents: Math.min(remaining, Math.round(deposit.project_total_cents * 0.4)),
    };
  }
  return {
    label: en ? 'Balance — launch (20%)' : 'Solde — mise en ligne (20 %)',
    amountCents: remaining,
  };
}
