import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable } from '../components/table';
import { superAdminDashboardMiddleware } from '../session';

const databaseRoutes = new Hono<AppType>();

databaseRoutes.use('*', superAdminDashboardMiddleware);

// Schema MPD data — describes the physical database model
const MPD_TABLES: {
  name: string;
  columns: { name: string; type: string; pk?: boolean; fk?: string; nullable?: boolean }[];
}[] = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'TEXT', pk: true },
      { name: 'email', type: 'TEXT' },
      { name: 'password_hash', type: 'TEXT' },
      { name: 'username', type: 'TEXT' },
      { name: 'first_name', type: 'TEXT' },
      { name: 'last_name', type: 'TEXT' },
      { name: 'birth_date', type: 'TEXT', nullable: true },
      { name: 'auth_provider', type: 'TEXT' },
      { name: 'role', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' },
    ],
  },
  {
    name: 'refresh_tokens',
    columns: [
      { name: 'id', type: 'TEXT', pk: true },
      { name: 'user_id', type: 'TEXT', fk: 'users.id' },
      { name: 'token_hash', type: 'TEXT' },
      { name: 'expires_at', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
    ],
  },
  {
    name: 'projects',
    columns: [
      { name: 'id', type: 'TEXT', pk: true },
      { name: 'user_id', type: 'TEXT', fk: 'users.id' },
      { name: 'name', type: 'TEXT' },
      { name: 'description', type: 'TEXT' },
      { name: 'status', type: 'TEXT' },
      { name: 'service_type', type: 'TEXT' },
      { name: 'tier', type: 'TEXT', nullable: true },
      { name: 'start_date', type: 'TEXT' },
      { name: 'end_date', type: 'TEXT', nullable: true },
      { name: 'progress', type: 'INTEGER' },
      { name: 'last_update', type: 'TEXT', nullable: true },
      { name: 'deliverables_url', type: 'TEXT', nullable: true },
      { name: 'is_archived', type: 'INTEGER' },
      { name: 'created_by', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' },
    ],
  },
  {
    name: 'tickets',
    columns: [
      { name: 'id', type: 'TEXT', pk: true },
      { name: 'project_id', type: 'TEXT', fk: 'projects.id' },
      { name: 'subject', type: 'TEXT' },
      { name: 'status', type: 'TEXT' },
      { name: 'created_by', type: 'TEXT', fk: 'users.id' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' },
    ],
  },
  {
    name: 'ticket_messages',
    columns: [
      { name: 'id', type: 'TEXT', pk: true },
      { name: 'ticket_id', type: 'TEXT', fk: 'tickets.id' },
      { name: 'author_id', type: 'TEXT', fk: 'users.id' },
      { name: 'content', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
    ],
  },
  {
    name: 'project_files',
    columns: [
      { name: 'id', type: 'TEXT', pk: true },
      { name: 'project_id', type: 'TEXT', fk: 'projects.id' },
      { name: 'uploaded_by', type: 'TEXT', fk: 'users.id' },
      { name: 'filename', type: 'TEXT' },
      { name: 'original_filename', type: 'TEXT' },
      { name: 'file_size', type: 'INTEGER' },
      { name: 'mime_type', type: 'TEXT' },
      { name: 'r2_key', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
    ],
  },
  {
    name: 'page_views',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'path', type: 'TEXT' },
      { name: 'referrer', type: 'TEXT', nullable: true },
      { name: 'user_agent', type: 'TEXT', nullable: true },
      { name: 'country', type: 'TEXT', nullable: true },
      { name: 'created_at', type: 'TEXT' },
    ],
  },
  {
    name: 'request_logs',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'method', type: 'TEXT' },
      { name: 'path', type: 'TEXT' },
      { name: 'status_code', type: 'INTEGER' },
      { name: 'duration_ms', type: 'REAL' },
      { name: 'user_id', type: 'TEXT', nullable: true },
      { name: 'ip', type: 'TEXT', nullable: true },
      { name: 'country', type: 'TEXT', nullable: true },
      { name: 'user_agent', type: 'TEXT', nullable: true },
      { name: 'error', type: 'TEXT', nullable: true },
      { name: 'created_at', type: 'TEXT' },
    ],
  },
  {
    name: 'support_tickets',
    columns: [
      { name: 'id', type: 'TEXT', pk: true },
      { name: 'email', type: 'TEXT' },
      { name: 'name', type: 'TEXT' },
      { name: 'category', type: 'TEXT' },
      { name: 'priority', type: 'TEXT' },
      { name: 'subject', type: 'TEXT' },
      { name: 'message', type: 'TEXT' },
      { name: 'metadata', type: 'TEXT', nullable: true },
      { name: 'status', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'closed_at', type: 'TEXT', nullable: true },
    ],
  },
];

// Build SVG schema diagram
function buildMpdSvg(): string {
  const COL_W = 260;
  const ROW_H = 18;
  const HEADER_H = 28;
  const PAD = 16;
  const GAP_X = 40;
  const GAP_Y = 30;

  // Layout tables in a grid (3 columns)
  const COLS = 3;
  const positions: { name: string; x: number; y: number; w: number; h: number }[] = [];

  // Calculate column heights for balanced layout
  const tablesByCol: typeof MPD_TABLES[] = [[], [], []];
  MPD_TABLES.forEach((t, i) => tablesByCol[i % COLS].push(t));

  const colHeights = [0, 0, 0];

  for (let col = 0; col < COLS; col++) {
    let y = PAD;
    for (const t of tablesByCol[col]) {
      const h = HEADER_H + t.columns.length * ROW_H + 6;
      const x = PAD + col * (COL_W + GAP_X);
      positions.push({ name: t.name, x, y, w: COL_W, h });
      y += h + GAP_Y;
    }
    colHeights[col] = y;
  }

  const totalW = PAD * 2 + COLS * COL_W + (COLS - 1) * GAP_X;
  const totalH = Math.max(...colHeights) + PAD;

  // Build table position lookup
  const posMap = new Map(positions.map((p) => [p.name, p]));
  const colMap = new Map<string, { tablePos: typeof positions[0]; idx: number }>();

  for (const t of MPD_TABLES) {
    const tp = posMap.get(t.name)!;
    t.columns.forEach((c, i) => {
      colMap.set(`${t.name}.${c.name}`, { tablePos: tp, idx: i });
    });
  }

  // Build FK lines
  const fkLines: string[] = [];
  for (const t of MPD_TABLES) {
    for (const col of t.columns) {
      if (!col.fk) continue;
      const from = colMap.get(`${t.name}.${col.name}`);
      const to = colMap.get(col.fk);
      if (!from || !to) continue;

      const fromY = from.tablePos.y + HEADER_H + from.idx * ROW_H + ROW_H / 2;
      const toY = to.tablePos.y + HEADER_H + to.idx * ROW_H + ROW_H / 2;

      // Determine which sides to connect
      let fromX: number, toX: number;
      if (from.tablePos.x > to.tablePos.x) {
        fromX = from.tablePos.x;
        toX = to.tablePos.x + to.tablePos.w;
      } else if (from.tablePos.x < to.tablePos.x) {
        fromX = from.tablePos.x + from.tablePos.w;
        toX = to.tablePos.x;
      } else {
        fromX = from.tablePos.x + from.tablePos.w;
        toX = to.tablePos.x + to.tablePos.w;
      }

      const midX = (fromX + toX) / 2;

      fkLines.push(
        `<path d="M${fromX},${fromY} C${midX},${fromY} ${midX},${toY} ${toX},${toY}" stroke="#4a9eff" stroke-width="1.5" fill="none" stroke-dasharray="4,3" opacity="0.6"/>`
      );
      // Arrow at target
      fkLines.push(
        `<circle cx="${toX}" cy="${toY}" r="3" fill="#4a9eff" opacity="0.8"/>`
      );
    }
  }

  // Build table rects
  const tablesSvg: string[] = [];
  for (const t of MPD_TABLES) {
    const p = posMap.get(t.name)!;

    tablesSvg.push(`<g>`);
    // Background
    tablesSvg.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="#1a1a2e" stroke="#2a2a4a" stroke-width="1"/>`);
    // Header
    tablesSvg.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${HEADER_H}" rx="4" fill="#2a2a4a"/>`);
    tablesSvg.push(`<rect x="${p.x}" y="${p.y + HEADER_H - 4}" width="${p.w}" height="4" fill="#2a2a4a"/>`);
    tablesSvg.push(`<text x="${p.x + 10}" y="${p.y + 18}" fill="#4a9eff" font-size="13" font-weight="bold" font-family="Courier New, monospace">${t.name}</text>`);

    // Columns
    t.columns.forEach((col, i) => {
      const cy = p.y + HEADER_H + i * ROW_H + 13;
      const icon = col.pk ? '🔑 ' : col.fk ? '→ ' : '   ';
      const nameColor = col.pk ? '#ff9f43' : col.fk ? '#4a9eff' : '#d0d0d0';
      const nullable = col.nullable ? '?' : '';

      tablesSvg.push(`<text x="${p.x + 8}" y="${cy}" fill="${nameColor}" font-size="11" font-family="Courier New, monospace">${icon}${col.name}</text>`);
      tablesSvg.push(`<text x="${p.x + p.w - 8}" y="${cy}" fill="#707090" font-size="10" font-family="Courier New, monospace" text-anchor="end">${col.type}${nullable}</text>`);
    });

    tablesSvg.push(`</g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" style="width:100%;background:#0f0f1a;border-radius:4px;">
    ${fkLines.join('\n')}
    ${tablesSvg.join('\n')}
    <text x="${totalW / 2}" y="${totalH - 8}" fill="#707090" font-size="10" font-family="Courier New, monospace" text-anchor="middle">MPD — RaceUp Database Schema (D1/SQLite)</text>
  </svg>`;
}

databaseRoutes.get('/database', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const tab = c.req.query('tab') ?? 'schema';

  // Get all tables
  const tables = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
  ).all();

  // Get row counts for each table
  const tableCounts: { name: string; count: number }[] = [];
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

  // Get foreign keys if inspecting
  let foreignKeys: Record<string, unknown>[] = [];
  if (inspectTable) {
    const fks = await db.prepare(`PRAGMA foreign_key_list("${inspectTable.replace(/"/g, '')}")`).all();
    foreignKeys = (fks?.results ?? []) as Record<string, unknown>[];
  }

  // Get indexes if inspecting
  let indexes: Record<string, unknown>[] = [];
  if (inspectTable) {
    const idxs = await db.prepare(`PRAGMA index_list("${inspectTable.replace(/"/g, '')}")`).all();
    indexes = (idxs?.results ?? []) as Record<string, unknown>[];
  }

  return c.html(
    <Layout title="Base de donnees" currentPath="/dashboard/database" role={session.role}>

      {/* Tab navigation */}
      <div class="period-selector" style="margin-bottom:20px;">
        <a href="/dashboard/database?tab=schema" class={tab === 'schema' ? 'active' : ''}>Schema MPD</a>
        <a href="/dashboard/database?tab=tables" class={tab === 'tables' ? 'active' : ''}>Tables</a>
        <a href="/dashboard/database?tab=query" class={tab === 'query' ? 'active' : ''}>Requete SQL</a>
      </div>

      {/* MPD Schema tab */}
      {tab === 'schema' && (
        <div>
          <h2 class="section-title">Modele Physique de Donnees</h2>
          <p style="font-size:11px;color:#707090;margin-bottom:12px;">
            <span style="color:#ff9f43;">🔑 Cle primaire</span> &nbsp; <span style="color:#4a9eff;">→ Cle etrangere</span> &nbsp; <span style="color:#707090;">Les lignes pointillees indiquent les relations FK (CASCADE)</span>
          </p>
          <div style="overflow-x:auto;" dangerouslySetInnerHTML={{ __html: buildMpdSvg() }} />
        </div>
      )}

      {/* Tables tab */}
      {tab === 'tables' && (
        <div>
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
                  <td><a href={`/dashboard/database?tab=tables&table=${t.name}`}>Structure</a></td>
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

              {foreignKeys.length > 0 && (
                <div>
                  <h3 class="section-title" style="font-size:12px;">Cles etrangeres</h3>
                  <DataTable
                    columns={[
                      { key: 'from', label: 'Colonne' },
                      { key: 'table', label: 'Table cible' },
                      { key: 'to', label: 'Colonne cible' },
                      { key: 'on_delete', label: 'ON DELETE' },
                    ]}
                    rows={foreignKeys}
                  />
                </div>
              )}

              {indexes.length > 0 && (
                <div>
                  <h3 class="section-title" style="font-size:12px;">Index</h3>
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Nom' },
                      { key: 'unique', label: 'Unique', render: (v) => Number(v) ? 'oui' : 'non' },
                      { key: 'origin', label: 'Origine' },
                    ]}
                    rows={indexes}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SQL Query tab */}
      {tab === 'query' && (
        <div>
          <h2 class="section-title">Requete SQL</h2>
          <p style="font-size:11px;color:#707090;margin-bottom:12px;">
            Resultats limites a 500 lignes. Consultez l'onglet Schema MPD pour visualiser les relations entre tables.
          </p>
          <form method="post" action="/dashboard/database/query">
            <div class="form-group">
              <textarea name="sql" placeholder="SELECT * FROM users LIMIT 10;" rows={5}></textarea>
            </div>
            <button type="submit" class="btn">Executer</button>
          </form>
        </div>
      )}
    </Layout>
  );
});

databaseRoutes.post('/database/query', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const sql = String(body['sql'] ?? '').trim();

  if (!sql) {
    return c.redirect('/dashboard/database?tab=query');
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
      <a href="/dashboard/database?tab=query" style="font-size:12px;">&laquo; Retour</a>

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
      <form method="post" action="/dashboard/database/query">
        <div class="form-group">
          <textarea name="sql" rows={5}>{sql}</textarea>
        </div>
        <button type="submit" class="btn">Executer</button>
      </form>
    </Layout>
  );
});

export default databaseRoutes;
