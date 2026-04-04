import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';

const errorsRoutes = new Hono<AppType>();

errorsRoutes.get('/errors', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const view = c.req.query('view') ?? 'list';

  if (view === 'grouped') {
    const grouped = await db.prepare(`
      SELECT path, status_code, COUNT(*) as occurrences,
             MAX(created_at) as last_seen,
             MIN(created_at) as first_seen
      FROM request_logs
      WHERE status_code >= 400 AND created_at >= datetime('now', '-1 day')
      GROUP BY path, status_code
      ORDER BY occurrences DESC
      LIMIT 50
    `).all();

    return c.html(
      <Layout title="Erreurs" currentPath="/dashboard/errors" role={session.role}>
        <div class="filters">
          <a href="/dashboard/errors?view=list" class="btn">Vue liste</a>
          <a href="/dashboard/errors?view=grouped" class="btn" style="opacity:0.6">Vue groupee (active)</a>
        </div>

        <DataTable
          columns={[
            { key: 'path', label: 'Path' },
            { key: 'status_code', label: 'Status' },
            { key: 'occurrences', label: 'Occurrences (24h)' },
            { key: 'first_seen', label: 'Premier' },
            { key: 'last_seen', label: 'Dernier' },
          ]}
          rows={(grouped?.results ?? []) as Record<string, unknown>[]}
          rowClass={() => 'error-row'}
        />
      </Layout>
    );
  }

  // Default: list view
  const [errorsResult, countResult] = await Promise.all([
    db.prepare(`SELECT method, path, status_code, error, user_id, created_at FROM request_logs WHERE status_code >= 400 ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset).all(),
    db.prepare('SELECT COUNT(*) as total FROM request_logs WHERE status_code >= 400')
      .first<{ total: number }>(),
  ]);

  const total = countResult?.total ?? 0;

  return c.html(
    <Layout title="Erreurs" currentPath="/dashboard/errors" role={session.role}>
      <div class="filters">
        <a href="/dashboard/errors?view=list" class="btn" style="opacity:0.6">Vue liste (active)</a>
        <a href="/dashboard/errors?view=grouped" class="btn">Vue groupee</a>
      </div>

      <DataTable
        columns={[
          { key: 'created_at', label: 'Date' },
          { key: 'method', label: 'Method' },
          { key: 'path', label: 'Path' },
          { key: 'status_code', label: 'Status' },
          { key: 'error', label: 'Erreur', render: (v) => String(v ?? '-').substring(0, 120) },
          {
            key: 'user_id',
            label: 'User',
            render: (v) => v ? `<a href="/dashboard/users/${v}">${String(v).substring(0, 8)}...</a>` : '-',
          },
        ]}
        rows={(errorsResult?.results ?? []) as Record<string, unknown>[]}
        rowClass={() => 'error-row'}
      />

      <Pagination basePath="/dashboard/errors" page={page} total={total} limit={limit} queryParams="view=list" />
    </Layout>
  );
});

export default errorsRoutes;
