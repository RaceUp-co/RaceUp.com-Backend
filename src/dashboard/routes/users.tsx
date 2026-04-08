import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';
import { logSecurityEvent } from '../../services/security';

const usersRoutes = new Hono<AppType>();

// List users
usersRoutes.get('/users', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const q = c.req.query('q') ?? '';
  const roleFilter = c.req.query('role') ?? '';

  let where = '';
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const countBindings: unknown[] = [];

  if (q) {
    const search = `%${q}%`;
    conditions.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)');
    bindings.push(search, search, search, search);
    countBindings.push(search, search, search, search);
  }

  if (roleFilter) {
    conditions.push('u.role = ?');
    bindings.push(roleFilter);
    countBindings.push(roleFilter);
  }

  if (conditions.length > 0) {
    where = 'WHERE ' + conditions.join(' AND ');
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
        <select name="role">
          <option value="">Tous les roles</option>
          <option value="user" selected={roleFilter === 'user'}>user</option>
          <option value="admin" selected={roleFilter === 'admin'}>admin</option>
          <option value="super_admin" selected={roleFilter === 'super_admin'}>super_admin</option>
        </select>
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

      <Pagination basePath="/dashboard/users" page={page} total={total} limit={limit} queryParams={`q=${encodeURIComponent(q)}&role=${encodeURIComponent(roleFilter)}`} />
    </Layout>
  );
});

// User detail
usersRoutes.get('/users/:id', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const userId = c.req.param('id');
  const msg = c.req.query('msg') ?? '';

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

  const isTargetSuperAdmin = String(user.role) === 'super_admin';
  const canManageRoles = session.role === 'super_admin' && !isTargetSuperAdmin;
  const canDelete = session.role === 'super_admin' && !isTargetSuperAdmin;
  const canEditProfile = session.role === 'super_admin' || (session.role === 'admin' && String(user.role) === 'user');

  return c.html(
    <Layout title={`User: ${user.email}`} currentPath="/dashboard/users" role={session.role}>
      <a href="/dashboard/users" style="font-size:12px;">&laquo; Retour a la liste</a>

      {msg === 'updated' && (
        <div style="background:#1a3a1a;border:1px solid #4caf50;color:#4caf50;padding:8px;font-size:12px;margin:12px 0;border-radius:3px;">
          Utilisateur mis a jour avec succes.
        </div>
      )}
      {msg === 'role_updated' && (
        <div style="background:#1a3a1a;border:1px solid #4caf50;color:#4caf50;padding:8px;font-size:12px;margin:12px 0;border-radius:3px;">
          Role mis a jour avec succes.
        </div>
      )}

      {/* Infos utilisateur */}
      <table style="margin:16px 0;width:auto;">
        <tr><td style="color:#707090;padding-right:20px;">ID</td><td>{String(user.id)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Email</td><td>{String(user.email)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Username</td><td>{String(user.username)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Nom</td><td>{String(user.first_name)} {String(user.last_name)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Date de naissance</td><td>{user.birth_date ? String(user.birth_date) : '—'}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Role</td><td>{String(user.role)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Auth</td><td>{String(user.auth_provider)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Inscrit le</td><td>{String(user.created_at)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Mis a jour le</td><td>{String(user.updated_at)}</td></tr>
      </table>

      {/* Edition profil (admin peut editer users, super_admin peut editer tous sauf super_admin) */}
      {canEditProfile && (
        <div>
          <h2 class="section-title">Modifier le profil</h2>
          <form method="post" action={`/dashboard/users/${userId}/edit`}>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:500px;">
              <div class="form-group">
                <label>Prenom</label>
                <input type="text" name="first_name" value={String(user.first_name)} />
              </div>
              <div class="form-group">
                <label>Nom</label>
                <input type="text" name="last_name" value={String(user.last_name)} />
              </div>
              <div class="form-group">
                <label>Username</label>
                <input type="text" name="username" value={String(user.username)} />
              </div>
              <div class="form-group">
                <label>Email</label>
                <input type="email" name="email" value={String(user.email)} />
              </div>
              <div class="form-group">
                <label>Date de naissance</label>
                <input type="date" name="birth_date" value={user.birth_date ? String(user.birth_date) : ''} />
              </div>
            </div>
            <button type="submit" class="btn" style="margin-top:8px;">Enregistrer</button>
          </form>
        </div>
      )}

      {/* Gestion des roles */}
      {canManageRoles && (
        <div>
          <h2 class="section-title">Changer le role</h2>
          <form method="post" action={`/dashboard/users/${userId}/role`}>
            <div class="filters">
              <select name="role">
                <option value="user" selected={String(user.role) === 'user'}>user</option>
                <option value="admin" selected={String(user.role) === 'admin'}>admin</option>
                <option value="super_admin">super_admin</option>
              </select>
              <button type="submit" class="btn">Changer role</button>
            </div>
          </form>
        </div>
      )}

      {/* Suppression du compte */}
      {canDelete && (
        <div style="margin-top:20px;">
          <h2 class="section-title" style="color:#ff6b6b;">Zone dangereuse</h2>
          <a href={`/dashboard/users/${userId}/delete`} class="btn btn-danger" style="text-decoration:none;">
            Supprimer ce compte
          </a>
        </div>
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

// Edit user profile (POST)
usersRoutes.post('/users/:id/edit', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const userId = c.req.param('id');

  const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();
  if (!user) return c.redirect('/dashboard/users');

  // Permission check
  const isTargetSuperAdmin = String(user.role) === 'super_admin';
  const canEdit = session.role === 'super_admin' || (session.role === 'admin' && String(user.role) === 'user');
  if (!canEdit || isTargetSuperAdmin) {
    return c.html('<h1>403 — Acces refuse</h1>', 403);
  }

  const body = await c.req.parseBody();
  const firstName = String(body['first_name'] ?? '').trim();
  const lastName = String(body['last_name'] ?? '').trim();
  const username = String(body['username'] ?? '').trim();
  const email = String(body['email'] ?? '').trim();
  const birthDate = String(body['birth_date'] ?? '').trim() || null;

  if (!firstName || !lastName || !username || !email) {
    return c.redirect(`/dashboard/users/${userId}`);
  }

  // Check email uniqueness
  const emailConflict = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, userId).first();
  if (emailConflict) {
    return c.redirect(`/dashboard/users/${userId}?msg=email_conflict`);
  }

  // Check username uniqueness
  const usernameConflict = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(username, userId).first();
  if (usernameConflict) {
    return c.redirect(`/dashboard/users/${userId}?msg=username_conflict`);
  }

  await db.prepare(
    'UPDATE users SET first_name = ?, last_name = ?, username = ?, email = ?, birth_date = ?, updated_at = ? WHERE id = ?'
  ).bind(firstName, lastName, username, email, birthDate, new Date().toISOString(), userId).run();

  return c.redirect(`/dashboard/users/${userId}?msg=updated`);
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

  // Cannot change super_admin's role
  const target = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
  if (!target || String(target.role) === 'super_admin') {
    return c.redirect(`/dashboard/users/${userId}`);
  }

  const oldRole = String(target.role);
  await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
    .bind(role, new Date().toISOString(), userId).run();

  logSecurityEvent(c.env.DB, {
    event_type: 'role_changed',
    user_id: session.userId,
    target_user_id: userId,
    details: `${oldRole} → ${role} (via dashboard by ${session.email})`,
  });

  return c.redirect(`/dashboard/users/${userId}?msg=role_updated`);
});

// Delete confirmation page
usersRoutes.get('/users/:id/delete', async (c) => {
  const session = c.get('dashboardSession');
  if (session.role !== 'super_admin') {
    return c.html('<h1>403</h1>', 403);
  }

  const db = c.env.DB;
  const userId = c.req.param('id');

  const user = await db.prepare(
    'SELECT id, email, username, first_name, last_name, role FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user || String(user.role) === 'super_admin') {
    return c.redirect('/dashboard/users');
  }

  // Count related data
  const [projectCount, ticketCount, fileCount] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ?').bind(userId).first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM tickets WHERE created_by = ?').bind(userId).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM project_files WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)`).bind(userId).first<{ c: number }>(),
  ]);

  return c.html(
    <Layout title="Confirmer la suppression" currentPath="/dashboard/users" role={session.role}>
      <a href={`/dashboard/users/${userId}`} style="font-size:12px;">&laquo; Annuler et retourner</a>

      <div style="margin:24px 0;padding:20px;background:#2a1515;border:1px solid #ff4444;border-radius:4px;">
        <h2 style="color:#ff6b6b;font-size:16px;margin-bottom:12px;">Suppression definitive du compte</h2>
        <p style="font-size:13px;margin-bottom:16px;">
          Vous etes sur le point de supprimer definitivement le compte de <strong style="color:#fff;">{String(user.email)}</strong> ({String(user.first_name)} {String(user.last_name)}).
        </p>
        <p style="font-size:12px;color:#ff9999;margin-bottom:16px;">
          Cette action supprimera en cascade :
        </p>
        <ul style="font-size:12px;color:#ff9999;margin-left:20px;margin-bottom:16px;">
          <li>{projectCount?.c ?? 0} projet(s)</li>
          <li>{ticketCount?.c ?? 0} ticket(s)</li>
          <li>{fileCount?.c ?? 0} fichier(s) (dont les fichiers R2)</li>
          <li>Tous les refresh tokens</li>
        </ul>

        <form method="post" action={`/dashboard/users/${userId}/delete`}>
          <div class="form-group" style="max-width:400px;">
            <label style="color:#ff9999;">Tapez l'email du compte pour confirmer :</label>
            <input type="text" name="confirm_email" placeholder={String(user.email)} autocomplete="off" />
          </div>
          <button type="submit" class="btn btn-danger">Supprimer definitivement</button>
        </form>
      </div>
    </Layout>
  );
});

// Delete user (POST) — hard delete with cascade
usersRoutes.post('/users/:id/delete', async (c) => {
  const session = c.get('dashboardSession');
  if (session.role !== 'super_admin') {
    return c.html('<h1>403</h1>', 403);
  }

  const db = c.env.DB;
  const userId = c.req.param('id');

  const user = await db.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(userId).first();
  if (!user || String(user.role) === 'super_admin') {
    return c.redirect('/dashboard/users');
  }

  const body = await c.req.parseBody();
  const confirmEmail = String(body['confirm_email'] ?? '').trim();

  if (confirmEmail !== String(user.email)) {
    return c.redirect(`/dashboard/users/${userId}/delete`);
  }

  // Delete R2 files first
  const files = await db.prepare(
    'SELECT r2_key FROM project_files WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)'
  ).bind(userId).all();

  for (const file of (files?.results ?? [])) {
    try {
      await c.env.R2.delete(String(file.r2_key));
    } catch (_) {
      // R2 delete best-effort
    }
  }

  logSecurityEvent(db, {
    event_type: 'admin_user_deleted',
    user_id: session.userId,
    target_user_id: userId,
    details: `email=${user.email} deleted via dashboard by ${session.email}`,
  });

  // Cascade delete via FK constraints (DELETE FROM users triggers cascades)
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

  return c.redirect('/dashboard/users?msg=deleted');
});

export default usersRoutes;
