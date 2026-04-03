import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable } from '../components/table';
import { superAdminDashboardMiddleware } from '../session';

const databaseRoutes = new Hono<AppType>();

databaseRoutes.use('*', superAdminDashboardMiddleware);

databaseRoutes.get('/database', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;

  // Get all tables
  const tables = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
  ).all();

  // Get row counts for each table
  const tableCounts: { name: string; count: number; }[] = [];
  for (const t of (tables?.results ?? [])) {
    const name = String(t.name);
    const result = await db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).first<{ count: number }>();
    tableCounts.push({ name, count: result?.count ?? 0 });
  }

  // Get table info if requested
  const inspectTable = c.req.query('table');
  let tableInfo: Record<string, unknown>[] = [];
  if (inspectTable) {
    const info = await db.prepare(`PRAGMA table_info("${inspectTable.replace(/"/g, '')}")`).all();
    tableInfo = (info?.results ?? []) as Record<string, unknown>[];
  }

  return c.html(
    <Layout title="Base de donnees" currentPath="/dashboard/database" role={session.role}>
      <h2 class="section-title">Tables</h2>
      <table>
        <thead>
          <tr><th>Table</th><th>Lignes</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {tableCounts.map((t) => (
            <tr>
              <td>{t.name}</td>
              <td>{t.count}</td>
              <td><a href={`/dashboard/database?table=${t.name}`}>Structure</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      {inspectTable && (
        <div>
          <h2 class="section-title">Structure: {inspectTable}</h2>
          <DataTable
            columns={[
              { key: 'cid', label: '#' },
              { key: 'name', label: 'Colonne' },
              { key: 'type', label: 'Type' },
              { key: 'notnull', label: 'NOT NULL', render: (v) => Number(v) ? 'oui' : 'non' },
              { key: 'dflt_value', label: 'Default' },
              { key: 'pk', label: 'PK', render: (v) => Number(v) ? 'oui' : '' },
            ]}
            rows={tableInfo}
          />
        </div>
      )}

      <h2 class="section-title">Requete SQL</h2>
      <form method="POST" action="/dashboard/database/query">
        <div class="form-group">
          <textarea name="sql" placeholder="SELECT * FROM users LIMIT 10;" rows={5}></textarea>
        </div>
        <button type="submit" class="btn">Executer</button>
      </form>
    </Layout>
  );
});

databaseRoutes.post('/database/query', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const sql = String(body['sql'] ?? '').trim();

  if (!sql) {
    return c.redirect('/dashboard/database');
  }

  let results: Record<string, unknown>[] = [];
  let columns: string[] = [];
  let error: string | null = null;
  let executionTime = 0;

  try {
    const start = Date.now();
    const result = await db.prepare(sql).all();
    executionTime = Date.now() - start;

    results = ((result?.results ?? []) as Record<string, unknown>[]).slice(0, 500);
    if (results.length > 0) {
      columns = Object.keys(results[0]);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return c.html(
    <Layout title="Base de donnees — Resultat" currentPath="/dashboard/database" role={session.role}>
      <a href="/dashboard/database" style="font-size:12px;">&laquo; Retour</a>

      <h2 class="section-title">Requete</h2>
      <pre><code>{sql}</code></pre>

      {error ? (
        <div class="login-error" style="margin-top:12px;">{error}</div>
      ) : (
        <div>
          <p style="font-size:12px;color:#707090;margin:12px 0;">
            {results.length} ligne(s) — {executionTime}ms
          </p>
          <div class="sql-result">
            <table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr>
                    {columns.map((col) => (
                      <td>{String(row[col] ?? 'NULL')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 class="section-title">Nouvelle requete</h2>
      <form method="POST" action="/dashboard/database/query">
        <div class="form-group">
          <textarea name="sql" rows={5}>{sql}</textarea>
        </div>
        <button type="submit" class="btn">Executer</button>
      </form>
    </Layout>
  );
});

export default databaseRoutes;
