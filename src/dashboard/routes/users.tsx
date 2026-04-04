import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';

const usersRoutes = new Hono<AppType>();

// List users
usersRoutes.get('/users', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const q = c.req.query('q') ?? '';

  let where = '';
  const bindings: unknown[] = [];
  const countBindings: unknown[] = [];

  if (q) {
    const search = `%${q}%`;
    where = 'WHERE u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?';
    bindings.push(search, search, search, search);
    countBindings.push(search, search, search, search);
  }

  bindings.push(limit, offset);

  const [usersResult, countResult] = await Promise.all([
    db.prepare(`
      SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.role, u.auth_provider, u.created_at,
             COUNT(p.id) as project_count
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id AND p.is_archived = 0
      ${where}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings).all(),
    db.prepare(`SELECT COUNT(*) as total FROM users u ${where}`)
      .bind(...countBindings).first<{ total: number }>(),
  ]);

  const total = countResult?.total ?? 0;

  const roleBadge = (role: unknown) => {
    const r = String(role);
    if (r === 'super_admin') return '<span class="badge badge-super">super_admin</span>';
    if (r === 'admin') return '<span class="badge badge-admin">admin</span>';
    return '<span class="badge badge-user">user</span>';
  };

  return c.html(
    <Layout title="Utilisateurs" currentPath="/dashboard/users" role={session.role}>
      <form class="filters" method="get" action="/dashboard/users">
        <input type="text" name="q" placeholder="Rechercher email, username..." value={q} style="width:300px;" />
        <button type="submit">Rechercher</button>
      </form>

      <DataTable
        columns={[
          {
            key: 'email',
            label: 'Email',
            render: (v, row) => `<a href="/dashboard/users/${row.id}">${String(v)}</a>`,
          },
          { key: 'username', label: 'Username' },
          { key: 'first_name', label: 'Prenom' },
          { key: 'last_name', label: 'Nom' },
          { key: 'role', label: 'Role', render: (v) => roleBadge(v) },
          { key: 'auth_provider', label: 'Auth' },
          { key: 'project_count', label: 'Projets' },
          { key: 'created_at', label: 'Inscrit le' },
        ]}
        rows={(usersResult?.results ?? []) as Record<string, unknown>[]}
      />

      <Pagination basePath="/dashboard/users" page={page} total={total} limit={limit} queryParams={`q=${encodeURIComponent(q)}`} />
    </Layout>
  );
});

// User detail
usersRoutes.get('/users/:id', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const userId = c.req.param('id');

  const user = await db.prepare(
    'SELECT id, email, username, first_name, last_name, birth_date, role, auth_provider, created_at, updated_at FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return c.html(
      <Layout title="Utilisateur introuvable" currentPath="/dashboard/users" role={session.role}>
        <p>Cet utilisateur n'existe pas.</p>
        <a href="/dashboard/users">Retour</a>
      </Layout>,
      404
    );
  }

  const projects = await db.prepare(
    'SELECT id, name, status, service_type, progress, created_at FROM projects WHERE user_id = ? AND is_archived = 0 ORDER BY created_at DESC'
  ).bind(userId).all();

  const recentLogs = await db.prepare(
    'SELECT method, path, status_code, duration_ms, created_at FROM request_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).bind(userId).all();

  return c.html(
    <Layout title={`User: ${user.email}`} currentPath="/dashboard/users" role={session.role}>
      <a href="/dashboard/users" style="font-size:12px;">&laquo; Retour a la liste</a>

      <table style="margin:16px 0;width:auto;">
        <tr><td style="color:#707090;padding-right:20px;">ID</td><td>{String(user.id)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Email</td><td>{String(user.email)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Username</td><td>{String(user.username)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Nom</td><td>{String(user.first_name)} {String(user.last_name)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Role</td><td>{String(user.role)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Auth</td><td>{String(user.auth_provider)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Inscrit le</td><td>{String(user.created_at)}</td></tr>
      </table>

      {session.role === 'super_admin' && String(user.role) !== 'super_admin' && (
        <form method="post" action={`/dashboard/users/${userId}/role`} style="margin-bottom:20px;">
          <div class="filters">
            <select name="role">
              <option value="user" selected={String(user.role) === 'user'}>user</option>
              <option value="admin" selected={String(user.role) === 'admin'}>admin</option>
              <option value="super_admin">super_admin</option>
            </select>
            <button type="submit" class="btn">Changer role</button>
          </div>
        </form>
      )}

      <h2 class="section-title">Projets ({projects?.results?.length ?? 0})</h2>
      <DataTable
        columns={[
          {
            key: 'name',
            label: 'Nom',
            render: (v, row) => `<a href="/dashboard/projects/${row.id}">${String(v)}</a>`,
          },
          { key: 'service_type', label: 'Service' },
          { key: 'status', label: 'Statut' },
          { key: 'progress', label: 'Progression', render: (v) => `${v}%` },
          { key: 'created_at', label: 'Cree le' },
        ]}
        rows={(projects?.results ?? []) as Record<string, unknown>[]}
      />

      <h2 class="section-title">20 dernieres requetes</h2>
      <DataTable
        columns={[
          { key: 'created_at', label: 'Date' },
          { key: 'method', label: 'Method' },
          { key: 'path', label: 'Path' },
          { key: 'status_code', label: 'Status' },
          { key: 'duration_ms', label: 'Duree (ms)' },
        ]}
        rows={(recentLogs?.results ?? []) as Record<string, unknown>[]}
        rowClass={(row) => (Number(row.status_code) >= 400 ? 'error-row' : '')}
      />
    </Layout>
  );
});

// Change role (POST)
usersRoutes.post('/users/:id/role', async (c) => {
  const session = c.get('dashboardSession');
  if (session.role !== 'super_admin') {
    return c.html('<h1>403</h1>', 403);
  }

  const userId = c.req.param('id');
  const body = await c.req.parseBody();
  const role = String(body['role'] ?? '');

  if (!['user', 'admin', 'super_admin'].includes(role)) {
    return c.redirect(`/dashboard/users/${userId}`);
  }

  await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
    .bind(role, new Date().toISOString(), userId).run();

  return c.redirect(`/dashboard/users/${userId}`);
});

export default usersRoutes;
