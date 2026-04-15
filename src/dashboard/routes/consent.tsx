import { Hono } from 'hono';
import type { FC } from 'hono/jsx';
import type { AppType, Consent, ConsentFilters } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';
import { StatCard } from '../components/stat-card';
import {
  listConsents,
  getConsentStats,
  getConsentById,
  getConsentHistory,
  withdrawConsent,
  exportConsentsCsv,
} from '../../services/consent';

const routes = new Hono<AppType>();

const consentRow = (c: Consent): Record<string, unknown> => {
  const cats = [
    c.functional ? 'F' : '-',
    c.analytics ? 'A' : '-',
    c.marketing ? 'M' : '-',
  ].join(' ');
  const statusHtml = c.withdrawn_at
    ? '<span class="badge badge-muted">retiré</span>'
    : new Date(c.expires_at) < new Date()
      ? '<span class="badge badge-warn">expiré</span>'
      : '<span class="badge badge-ok">actif</span>';
  return {
    created_at: c.created_at.slice(0, 16).replace('T', ' '),
    consent_id: `<code>${c.consent_id.slice(0, 8)}…</code>`,
    user_id: c.user_id ? `<code>${c.user_id.slice(0, 8)}…</code>` : 'anonyme',
    ip_hash: `<code>${c.ip_hash.slice(0, 8)}…</code>`,
    policy_version: c.policy_version,
    categories: cats,
    consent_method: c.consent_method,
    status: statusHtml,
    action: `<a href="/dashboard/consent/${c.id}">Voir</a>`,
  };
};

const historyRow = (h: Consent): Record<string, unknown> => ({
  created_at: h.created_at.slice(0, 16).replace('T', ' '),
  id: `<code>${h.id.slice(0, 8)}…</code>`,
  user_id: h.user_id ? `<code>${h.user_id.slice(0, 8)}…</code>` : 'anonyme',
  policy_version: h.policy_version,
  fam: `${h.functional}/${h.analytics}/${h.marketing}`,
  consent_method: h.consent_method,
  withdrawn: h.withdrawn_at ? (h.withdrawn_reason ?? 'oui') : '-',
  action: `<a href="/dashboard/consent/${h.id}">Voir</a>`,
});

const ConsentFiltersForm: FC<{ filters: ConsentFilters }> = ({ filters }) => (
  <form method="get" class="filters">
    <input type="date" name="date_from" value={filters.date_from || ''} />
    <input type="date" name="date_to" value={filters.date_to || ''} />
    <select name="method">
      <option value="">Toutes méthodes</option>
      <option value="accept_all" selected={filters.consent_method === 'accept_all'}>Accept all</option>
      <option value="reject_all" selected={filters.consent_method === 'reject_all'}>Reject all</option>
      <option value="custom" selected={filters.consent_method === 'custom'}>Custom</option>
    </select>
    <select name="status">
      <option value="">Tous statuts</option>
      <option value="active" selected={filters.status === 'active'}>Actif</option>
      <option value="withdrawn" selected={filters.status === 'withdrawn'}>Retiré</option>
      <option value="expired" selected={filters.status === 'expired'}>Expiré</option>
    </select>
    <input type="text" name="policy_version" placeholder="Policy version" value={filters.policy_version || ''} />
    <button type="submit">Filtrer</button>
  </form>
);

/**
 * GET /dashboard/consent — Vue principale : KPI + filtres + liste paginée.
 */
routes.get('/dashboard/consent', async (c) => {
  const session = c.get('dashboardSession');
  const query = c.req.query();
  const filters: ConsentFilters = {
    page: query.page ? parseInt(query.page, 10) : 1,
    limit: 50,
    policy_version: query.policy_version || undefined,
    consent_method: (query.method as ConsentFilters['consent_method']) || undefined,
    date_from: query.date_from || undefined,
    date_to: query.date_to || undefined,
    status: (query.status as ConsentFilters['status']) || undefined,
  };

  const [stats, list] = await Promise.all([
    getConsentStats(c.env.DB, 30),
    listConsents(c.env.DB, filters),
  ]);

  const queryParams = new URLSearchParams(query as Record<string, string>).toString();

  return c.html(
    <Layout title="Consentement" currentPath="/dashboard/consent" role={session.role}>
      <div class="stats-grid">
        <StatCard label="Total (30j)" value={stats.total} />
        <StatCard label="Accept All" value={`${Math.round(stats.acceptance_rate * 100)}%`} />
        <StatCard label="Reject All" value={stats.reject_all} />
        <StatCard label="Custom" value={stats.custom} />
      </div>

      <div class="stats-grid">
        <StatCard label="Functional accept" value={stats.functional_accepted} />
        <StatCard label="Analytics accept" value={stats.analytics_accepted} />
        <StatCard label="Marketing accept" value={stats.marketing_accepted} />
      </div>

      <ConsentFiltersForm filters={filters} />

      <div class="toolbar">
        <a class="btn" href={`/dashboard/consent/export?${queryParams}`}>
          Exporter CSV
        </a>
        <form method="get" action="/dashboard/consent/search" class="inline-form">
          <input type="text" name="consent_id" placeholder="Rechercher par consent_id" />
          <button type="submit">Rechercher</button>
        </form>
      </div>

      <DataTable
        columns={[
          { key: 'created_at', label: 'Date' },
          { key: 'consent_id', label: 'Consent ID', render: (v) => String(v ?? '') },
          { key: 'user_id', label: 'User', render: (v) => String(v ?? '') },
          { key: 'ip_hash', label: 'IP hash', render: (v) => String(v ?? '') },
          { key: 'policy_version', label: 'Policy' },
          { key: 'categories', label: 'Catégories' },
          { key: 'consent_method', label: 'Méthode' },
          { key: 'status', label: 'Statut', render: (v) => String(v ?? '') },
          { key: 'action', label: '', render: (v) => String(v ?? '') },
        ]}
        rows={list.items.map(consentRow)}
      />
      <Pagination
        basePath="/dashboard/consent"
        page={list.page}
        total={list.total}
        limit={list.limit}
        queryParams={queryParams}
      />
    </Layout>
  );
});

/**
 * GET /dashboard/consent/search?consent_id=xxx
 * Recherche par consent_id (droit d'acces RGPD).
 */
routes.get('/dashboard/consent/search', async (c) => {
  const consentId = c.req.query('consent_id') ?? '';
  const session = c.get('dashboardSession');
  if (!consentId) {
    return c.redirect('/dashboard/consent');
  }

  const history = await getConsentHistory(c.env.DB, consentId);

  return c.html(
    <Layout title={`Recherche ${consentId.slice(0, 8)}`} currentPath="/dashboard/consent" role={session.role}>
      <p><a href="/dashboard/consent">← Retour</a></p>
      <h2>Historique consent_id : <code>{consentId}</code></h2>
      {history.length === 0
        ? <p>Aucun consentement trouvé.</p>
        : <DataTable
            columns={[
              { key: 'created_at', label: 'Date' },
              { key: 'id', label: 'ID ligne', render: (v) => String(v ?? '') },
              { key: 'user_id', label: 'User', render: (v) => String(v ?? '') },
              { key: 'policy_version', label: 'Policy' },
              { key: 'fam', label: 'F/A/M' },
              { key: 'consent_method', label: 'Méthode' },
              { key: 'withdrawn', label: 'Retrait' },
              { key: 'action', label: '', render: (v) => String(v ?? '') },
            ]}
            rows={history.map(historyRow)}
          />
      }
    </Layout>
  );
});

/**
 * GET /dashboard/consent/export
 * Genere un CSV streaming avec les filtres appliques.
 */
routes.get('/dashboard/consent/export', async (c) => {
  const query = c.req.query();
  const filters: ConsentFilters = {
    policy_version: query.policy_version || undefined,
    consent_method: (query.method as ConsentFilters['consent_method']) || undefined,
    date_from: query.date_from || undefined,
    date_to: query.date_to || undefined,
    status: (query.status as ConsentFilters['status']) || undefined,
  };

  const gen = exportConsentsCsv(c.env.DB, filters);
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await gen.next();
      if (done) controller.close();
      else controller.enqueue(new TextEncoder().encode(value));
    },
  });

  const filename = `consents-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

/**
 * POST /dashboard/consent/:id/withdraw
 * Admin force le retrait d'un consentement.
 */
routes.post('/dashboard/consent/:id/withdraw', async (c) => {
  const id = c.req.param('id');
  const consent = await getConsentById(c.env.DB, id);
  if (!consent) {
    return c.html(<p>Consent introuvable</p>, 404);
  }
  await withdrawConsent(c.env.DB, consent.consent_id, 'user_request');
  return c.redirect(`/dashboard/consent/${id}`);
});

/**
 * GET /dashboard/consent/:id — Detail consent (doit etre en dernier pour ne pas matcher /export ou /search)
 */
routes.get('/dashboard/consent/:id', async (c) => {
  const id = c.req.param('id');
  const session = c.get('dashboardSession');
  const consent = await getConsentById(c.env.DB, id);

  if (!consent) {
    return c.html(
      <Layout title="Introuvable" currentPath="/dashboard/consent" role={session.role}>
        <p><a href="/dashboard/consent">← Retour</a></p>
        <p>Consent introuvable</p>
      </Layout>,
      404
    );
  }

  const history = await getConsentHistory(c.env.DB, consent.consent_id);

  return c.html(
    <Layout title={`Consent ${id.slice(0, 8)}`} currentPath="/dashboard/consent" role={session.role}>
      <p><a href="/dashboard/consent">← Retour</a></p>

      <section class="panel">
        <h2>Métadonnées</h2>
        <dl>
          <dt>Row ID</dt><dd><code>{consent.id}</code></dd>
          <dt>Consent ID</dt><dd><code>{consent.consent_id}</code></dd>
          <dt>User</dt><dd>{consent.user_id ? <code>{consent.user_id}</code> : 'anonyme'}</dd>
          <dt>IP hash</dt><dd><code>{consent.ip_hash}</code></dd>
          <dt>Pays</dt><dd>{consent.country ?? '-'}</dd>
          <dt>User-Agent</dt><dd><code>{consent.user_agent ?? '-'}</code></dd>
          <dt>Policy version</dt><dd>{consent.policy_version}</dd>
          <dt>Méthode</dt><dd>{consent.consent_method}</dd>
          <dt>Source URL</dt><dd>{consent.source_url ?? '-'}</dd>
          <dt>Créé</dt><dd>{consent.created_at}</dd>
          <dt>Expire</dt><dd>{consent.expires_at}</dd>
          <dt>Retiré</dt><dd>{consent.withdrawn_at ?? 'non'}</dd>
        </dl>
      </section>

      <section class="panel">
        <h2>Catégories</h2>
        <ul>
          <li>Nécessaires : ✓ (obligatoire)</li>
          <li>Fonctionnels : {consent.functional ? '✓' : '✗'}</li>
          <li>Analytics : {consent.analytics ? '✓' : '✗'}</li>
          <li>Marketing : {consent.marketing ? '✓' : '✗'}</li>
        </ul>
      </section>

      {!consent.withdrawn_at && (
        <form method="post" action={`/dashboard/consent/${consent.id}/withdraw`}>
          <button type="submit" class="btn btn-danger">Forcer le retrait</button>
        </form>
      )}

      <section class="panel">
        <h2>Historique ({history.length} version{history.length > 1 ? 's' : ''})</h2>
        <DataTable
          columns={[
            { key: 'created_at', label: 'Date' },
            { key: 'id', label: 'ID', render: (v) => String(v ?? '') },
            { key: 'policy_version', label: 'Policy' },
            { key: 'fam', label: 'F/A/M' },
            { key: 'consent_method', label: 'Méthode' },
            { key: 'withdrawn', label: 'Retrait' },
          ]}
          rows={history.map(historyRow)}
        />
      </section>
    </Layout>
  );
});

export default routes;
