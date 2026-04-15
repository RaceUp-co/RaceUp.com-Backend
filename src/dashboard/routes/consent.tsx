import { Hono } from 'hono';
import type { FC } from 'hono/jsx';
import type { AppType, Consent, ConsentFilters } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';
import { StatCard } from '../components/stat-card';
import { listConsents, getConsentStats } from '../../services/consent';

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

export default routes;
