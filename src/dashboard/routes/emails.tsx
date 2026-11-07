import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { StatCard } from '../components/stat-card';
import { DataTable, Pagination } from '../components/table';
import { getEmailStats, isEmailEnabled, getEmailConfig, listEmailDeliveries } from '../../services/email';

const emailRoutes = new Hono<AppType>();

// Journal des emails transactionnels : repond a la seule question qui compte vraiment,
// « le client a-t-il bien recu sa facture ? ». Les rebonds remontent via le webhook Resend.

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  sent: { label: 'Envoye', color: '#4a9eff' },
  delivered: { label: 'Livre', color: '#4caf50' },
  delivery_delayed: { label: 'Retarde', color: '#ff9f43' },
  bounced: { label: 'Rebond', color: '#ff4444' },
  complained: { label: 'Spam', color: '#ff4444' },
  failed: { label: 'Echec', color: '#ff4444' },
  skipped: { label: 'Non envoye', color: '#707090' },
};

const STATUS_OPTIONS = Object.entries(STATUS_STYLES).map(([value, s]) => ({ value, label: s.label }));

// Libelles lisibles des gabarits (l'identifiant technique ne parle qu'au code)
const TEMPLATE_LABELS: Record<string, string> = {
  welcome_verify: 'Bienvenue + verification',
  email_verification: 'Verification (renvoi)',
  password_reset: 'Mot de passe oublie',
  password_changed: 'Mot de passe modifie',
  email_change_confirm: 'Confirmation nouvel email',
  email_changed: 'Alerte ancien email',
  account_deleted: 'Compte supprime',
  login_locked: 'Compte verrouille',
  admin_new_user: '[Interne] Nouvelle inscription',
  order_paid: 'Paiement confirme',
  order_processing: 'Paiement en traitement',
  order_failed: 'Paiement echoue',
  order_refunded: 'Remboursement',
  milestone_requested: 'Echeance a regler',
  admin_order_paid: '[Interne] Commande encaissee',
  admin_order_failed: '[Interne] Paiement echoue',
  admin_order_refunded: '[Interne] Remboursement',
  support_received: 'Support : accuse de reception',
  support_closed: 'Support : resolu',
  admin_support_received: '[Interne] Nouvelle demande',
  project_created: 'Projet ouvert',
  project_file_added: 'Nouveau fichier',
  project_completed: 'Projet termine',
  project_ticket_reply: 'Reponse ticket projet',
  admin_project_ticket: '[Interne] Ticket projet',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}

emailRoutes.get('/emails', async (c) => {
  const session = c.get('dashboardSession');
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 50;

  const statusParam = c.req.query('status') ?? '';
  const status = STATUS_OPTIONS.some((o) => o.value === statusParam) ? statusParam : undefined;
  const templateParam = c.req.query('template') ?? '';
  const template = TEMPLATE_LABELS[templateParam] ? templateParam : undefined;
  const q = (c.req.query('q') ?? '').trim().slice(0, 100) || undefined;

  const [{ deliveries, total }, stats] = await Promise.all([
    listEmailDeliveries(c.env.DB, { page, limit, status, template, q }),
    getEmailStats(c.env.DB),
  ]);

  const enabled = isEmailEnabled(c.env);
  const config = getEmailConfig(c.env);

  // Taux de livraison : seuls les emails reellement remis a Resend comptent.
  const deliveryRate = stats.sent_30d > 0 ? Math.round((stats.delivered_30d / stats.sent_30d) * 100) : 0;

  const queryParams = [
    status ? `status=${status}` : '',
    template ? `template=${template}` : '',
    q ? `q=${encodeURIComponent(q)}` : '',
  ]
    .filter(Boolean)
    .join('&');

  return c.html(
    <Layout title="Emails" currentPath="/dashboard/emails" role={session.role}>
      {!enabled ? (
        <div style="background:#2a1515;border:1px solid #ff6b6b;color:#ff6b6b;padding:12px;font-size:13px;margin-bottom:16px;border-radius:4px;">
          Emails DESACTIVES : secret RESEND_API_KEY manquant (`npx wrangler secret put RESEND_API_KEY`). Les
          envois sont journalises en « Non envoye » et aucun flux metier n'echoue.
        </div>
      ) : (
        <div style="background:#152a15;border:1px solid #4caf50;color:#4caf50;padding:8px 12px;font-size:12px;margin-bottom:16px;border-radius:4px;font-weight:600;">
          Resend connecte — expedition {config.fromName} &lt;{config.from}&gt; · notifications internes vers{' '}
          {config.admin}
        </div>
      )}

      <div class="stats-grid">
        <StatCard label="Emails envoyes (30 j)" value={stats.sent_30d} />
        <StatCard label="Taux de livraison" value={`${deliveryRate} %`} />
        <StatCard label="Rebonds / spam (30 j)" value={stats.bounced_30d} />
        <StatCard label="Echecs (30 j)" value={stats.failed_30d} />
      </div>

      <form method="get" action="/dashboard/emails" style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;">
        <input
          type="text"
          name="q"
          value={q ?? ''}
          placeholder="Destinataire…"
          style="flex:1;min-width:200px;"
        />
        <select name="status">
          <option value="">Tous les statuts</option>
          {STATUS_OPTIONS.map((o) => (
            <option value={o.value} selected={status === o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="template">
          <option value="">Tous les emails</option>
          {Object.entries(TEMPLATE_LABELS).map(([value, label]) => (
            <option value={value} selected={template === value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit">Filtrer</button>
        <a href="/dashboard/emails" style="align-self:center;color:#707090;font-size:12px;">
          Reinitialiser
        </a>
      </form>

      <DataTable
        columns={[
          { key: 'created_at', label: 'Date', render: (v) => formatDate(v as string) },
          {
            key: 'template',
            label: 'Email',
            render: (v) => TEMPLATE_LABELS[v as string] ?? (v as string),
          },
          { key: 'recipient', label: 'Destinataire' },
          { key: 'subject', label: 'Objet' },
          {
            key: 'status',
            label: 'Statut',
            // Pas de html`` ici : on passe par du JSX, echappe automatiquement.
            render: (v) => {
              const s = STATUS_STYLES[v as string] ?? { label: String(v), color: '#707090' };
              return (
                <span class="badge" style={`background:${s.color}22;color:${s.color};`}>
                  {s.label}
                </span>
              ) as unknown as string;
            },
          },
          { key: 'error', label: 'Erreur / raison', render: (v) => (v ? String(v).slice(0, 80) : '—') },
        ]}
        rows={deliveries as unknown as Record<string, unknown>[]}
      />

      <Pagination basePath="/dashboard/emails" page={page} total={total} limit={limit} queryParams={queryParams} />

      <p style="color:#707090;font-size:12px;margin-top:16px;max-width:760px;">
        Les statuts « Livre », « Rebond » et « Spam » viennent du webhook Resend
        (<code>/api/emails/webhook</code>, secret <code>RESEND_WEBHOOK_SECRET</code>). Sans webhook configure, les
        emails restent au statut « Envoye ». Un rebond signifie que l'adresse du client est injoignable : la
        facture n'est jamais arrivee.
      </p>
    </Layout>
  );
});

export default emailRoutes;
