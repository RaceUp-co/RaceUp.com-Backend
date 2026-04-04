import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';

const logsRoutes = new Hono<AppType>();

logsRoutes.get('/logs', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const method = c.req.query('method') ?? '';
  const status = c.req.query('status') ?? '';
  const path = c.req.query('path') ?? '';

  let where = 'WHERE 1=1';
  const bindings: unknown[] = [];

  if (method) {
    where += ' AND method = ?';
    bindings.push(method);
  }
  if (status === '2xx') {
    where += ' AND status_code >= 200 AND status_code < 300';
  } else if (status === '4xx') {
    where += ' AND status_code >= 400 AND status_code < 500';
  } else if (status === '5xx') {
    where += ' AND status_code >= 500';
  }
  if (path) {
    where += ' AND path LIKE ?';
    bindings.push(`%${path}%`);
  }

  const countBindings = [...bindings];
  bindings.push(limit, offset);

  const [logsResult, countResult] = await Promise.all([
    db.prepare(`SELECT id, method, path, status_code, duration_ms, user_id, ip, country, created_at FROM request_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings).all(),
    db.prepare(`SELECT COUNT(*) as total FROM request_logs ${where}`)
      .bind(...countBindings).first<{ total: number }>(),
  ]);

  const rows = (logsResult?.results ?? []) as Record<string, unknown>[];
  const total = countResult?.total ?? 0;
  const qs = `method=${method}&status=${status}&path=${encodeURIComponent(path)}`;

  return c.html(
    <Layout title="Request Logs" currentPath="/dashboard/logs" role={session.role}>
      <form class="filters" method="get" action="/dashboard/logs">
        <select name="method">
          <option value="">Toutes methodes</option>
          {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => (
            <option value={m} selected={method === m}>{m}</option>
          ))}
        </select>
        <select name="status">
          <option value="">Tous status</option>
          <option value="2xx" selected={status === '2xx'}>2xx</option>
          <option value="4xx" selected={status === '4xx'}>4xx</option>
          <option value="5xx" selected={status === '5xx'}>5xx</option>
        </select>
        <input type="text" name="path" placeholder="Filtrer par path..." value={path} />
        <button type="submit">Filtrer</button>
      </form>

      <DataTable
        columns={[
          { key: 'created_at', label: 'Date' },
          { key: 'method', label: 'Method' },
          { key: 'path', label: 'Path' },
          { key: 'status_code', label: 'Status' },
          { key: 'duration_ms', label: 'Duree (ms)' },
          {
            key: 'user_id',
            label: 'User',
            render: (v) => v ? `<a href="/dashboard/users/${v}">${String(v).substring(0, 8)}...</a>` : '-',
          },
          { key: 'country', label: 'Pays' },
          { key: 'ip', label: 'IP' },
        ]}
        rows={rows}
        rowClass={(row) => (Number(row.status_code) >= 400 ? 'error-row' : '')}
      />

      <Pagination basePath="/dashboard/logs" page={page} total={total} limit={limit} queryParams={qs} />
    </Layout>
  );
});

export default logsRoutes;
