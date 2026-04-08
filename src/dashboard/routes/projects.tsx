import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';

const projectsRoutes = new Hono<AppType>();

// List projects
projectsRoutes.get('/projects', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const status = c.req.query('status') ?? '';
  const showArchived = c.req.query('archived') === '1';

  let where = showArchived ? 'WHERE p.is_archived = 1' : 'WHERE p.is_archived = 0';
  const bindings: unknown[] = [];
  const countBindings: unknown[] = [];

  if (status && !showArchived) {
    where += ' AND p.status = ?';
    bindings.push(status);
    countBindings.push(status);
  }

  bindings.push(limit, offset);

  const [projectsResult, countResult] = await Promise.all([
    db.prepare(`
      SELECT p.id, p.name, p.status, p.service_type, p.progress, p.created_at, p.is_archived,
             u.email as user_email
      FROM projects p
      LEFT JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings).all(),
    db.prepare(`SELECT COUNT(*) as total FROM projects p ${where}`)
      .bind(...countBindings).first<{ total: number }>(),
  ]);

  const total = countResult?.total ?? 0;

  const statusBadge = (s: unknown) => {
    const v = String(s);
    if (v === 'completed') return '<span class="badge badge-ok">Termine</span>';
    if (v === 'paused') return '<span class="badge" style="background:#ff9f4322;color:#ff9f43;">En pause</span>';
    return '<span class="badge badge-admin">En cours</span>';
  };

  return c.html(
    <Layout title={showArchived ? 'Projets archives' : 'Projets'} currentPath="/dashboard/projects" role={session.role}>
      <div class="filters">
        {!showArchived ? (
          <form method="get" action="/dashboard/projects" style="display:flex;gap:8px;align-items:center;">
            <select name="status">
              <option value="">Tous statuts</option>
              <option value="in_progress" selected={status === 'in_progress'}>En cours</option>
              <option value="completed" selected={status === 'completed'}>Termine</option>
              <option value="paused" selected={status === 'paused'}>En pause</option>
            </select>
            <button type="submit">Filtrer</button>
          </form>
        ) : null}
        <a href={showArchived ? '/dashboard/projects' : '/dashboard/projects?archived=1'}
           style="font-size:12px;padding:6px 12px;background:#1a1a2e;border:1px solid #2a2a4a;border-radius:3px;">
          {showArchived ? 'Voir les projets actifs' : 'Voir les projets archives'}
        </a>
      </div>

      <DataTable
        columns={[
          {
            key: 'name',
            label: 'Nom',
            render: (v, row) => `<a href="/dashboard/projects/${row.id}">${String(v)}</a>`,
          },
          { key: 'user_email', label: 'Client' },
          { key: 'service_type', label: 'Service' },
          { key: 'status', label: 'Statut', render: (v) => statusBadge(v) },
          { key: 'progress', label: 'Progress', render: (v) => `${v}%` },
          { key: 'created_at', label: 'Cree le' },
        ]}
        rows={(projectsResult?.results ?? []) as Record<string, unknown>[]}
      />

      <Pagination basePath="/dashboard/projects" page={page} total={total} limit={limit} queryParams={showArchived ? 'archived=1' : `status=${status}`} />
    </Layout>
  );
});

// Project detail
projectsRoutes.get('/projects/:id', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const projectId = c.req.param('id');
  const msg = c.req.query('msg') ?? '';

  const project = await db.prepare(`
    SELECT p.*, u.email as user_email, u.username as user_username
    FROM projects p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).bind(projectId).first();

  if (!project) {
    return c.html(
      <Layout title="Projet introuvable" currentPath="/dashboard/projects" role={session.role}>
        <p>Ce projet n'existe pas.</p>
        <a href="/dashboard/projects">Retour</a>
      </Layout>,
      404
    );
  }

  const [tickets, files] = await Promise.all([
    db.prepare(`
      SELECT t.id, t.subject, t.status, t.created_at,
             (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count
      FROM tickets t WHERE t.project_id = ? ORDER BY t.created_at DESC
    `).bind(projectId).all(),
    db.prepare('SELECT id, original_filename, file_size, mime_type, created_at FROM project_files WHERE project_id = ? ORDER BY created_at DESC')
      .bind(projectId).all(),
  ]);

  const isArchived = Number(project.is_archived) === 1;

  return c.html(
    <Layout title={`Projet: ${project.name}`} currentPath="/dashboard/projects" role={session.role}>
      <a href={isArchived ? '/dashboard/projects?archived=1' : '/dashboard/projects'} style="font-size:12px;">&laquo; Retour a la liste</a>

      {msg === 'updated' && (
        <div style="background:#1a3a1a;border:1px solid #4caf50;color:#4caf50;padding:8px;font-size:12px;margin:12px 0;border-radius:3px;">
          Projet mis a jour avec succes.
        </div>
      )}
      {msg === 'restored' && (
        <div style="background:#1a3a1a;border:1px solid #4caf50;color:#4caf50;padding:8px;font-size:12px;margin:12px 0;border-radius:3px;">
          Projet restaure avec succes.
        </div>
      )}
      {msg === 'archived' && (
        <div style="background:#2a2a15;border:1px solid #ff9f43;color:#ff9f43;padding:8px;font-size:12px;margin:12px 0;border-radius:3px;">
          Projet archive.
        </div>
      )}

      {isArchived && (
        <div style="background:#2a2a15;border:1px solid #ff9f43;color:#ff9f43;padding:8px;font-size:12px;margin:12px 0;border-radius:3px;">
          Ce projet est archive.
          <form method="post" action={`/dashboard/projects/${projectId}/restore`} style="display:inline;margin-left:12px;">
            <button type="submit" class="btn" style="padding:4px 10px;font-size:11px;">Restaurer</button>
          </form>
        </div>
      )}

      {/* Infos projet (lecture) */}
      <table style="margin:16px 0;width:auto;">
        <tr><td style="color:#707090;padding-right:20px;">ID</td><td>{String(project.id)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Client</td><td><a href={`/dashboard/users/${project.user_id}`}>{String(project.user_email)}</a></td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Cree par</td><td>{String(project.created_by)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Cree le</td><td>{String(project.created_at)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Mis a jour le</td><td>{String(project.updated_at)}</td></tr>
      </table>

      {/* Formulaire d'edition complet */}
      {!isArchived && (
        <div>
          <h2 class="section-title">Modifier le projet</h2>
          <form method="post" action={`/dashboard/projects/${projectId}/edit`}>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:600px;">
              <div class="form-group" style="grid-column:1/3;">
                <label>Nom</label>
                <input type="text" name="name" value={String(project.name)} required />
              </div>
              <div class="form-group" style="grid-column:1/3;">
                <label>Description</label>
                <textarea name="description" rows={3}>{String(project.description ?? '')}</textarea>
              </div>
              <div class="form-group">
                <label>Type de service</label>
                <input type="text" name="service_type" value={String(project.service_type)} required />
              </div>
              <div class="form-group">
                <label>Tier</label>
                <input type="text" name="tier" value={project.tier ? String(project.tier) : ''} placeholder="Optionnel" />
              </div>
              <div class="form-group">
                <label>Statut</label>
                <select name="status">
                  <option value="in_progress" selected={String(project.status) === 'in_progress'}>En cours</option>
                  <option value="completed" selected={String(project.status) === 'completed'}>Termine</option>
                  <option value="paused" selected={String(project.status) === 'paused'}>En pause</option>
                </select>
              </div>
              <div class="form-group">
                <label>Progression (%)</label>
                <input type="number" name="progress" min="0" max="100" value={String(project.progress)} />
              </div>
              <div class="form-group">
                <label>Date de debut</label>
                <input type="date" name="start_date" value={String(project.start_date ?? '').split('T')[0]} />
              </div>
              <div class="form-group">
                <label>Date de fin</label>
                <input type="date" name="end_date" value={project.end_date ? String(project.end_date).split('T')[0] : ''} />
              </div>
              <div class="form-group" style="grid-column:1/3;">
                <label>URL des livrables</label>
                <input type="url" name="deliverables_url" value={project.deliverables_url ? String(project.deliverables_url) : ''} placeholder="https://..." />
              </div>
            </div>
            <button type="submit" class="btn" style="margin-top:8px;">Enregistrer les modifications</button>
          </form>
        </div>
      )}

      {/* Archivage */}
      {!isArchived && (
        <div style="margin-top:20px;">
          <h2 class="section-title" style="color:#ff6b6b;">Zone dangereuse</h2>
          <form method="post" action={`/dashboard/projects/${projectId}/archive`} style="display:inline;">
            <button type="submit" class="btn btn-danger">Archiver ce projet</button>
          </form>
        </div>
      )}

      <h2 class="section-title">Tickets ({tickets?.results?.length ?? 0})</h2>
      <DataTable
        columns={[
          { key: 'subject', label: 'Sujet' },
          { key: 'status', label: 'Statut' },
          { key: 'message_count', label: 'Messages' },
          { key: 'created_at', label: 'Cree le' },
        ]}
        rows={(tickets?.results ?? []) as Record<string, unknown>[]}
      />

      <h2 class="section-title">Fichiers ({files?.results?.length ?? 0})</h2>
      <DataTable
        columns={[
          { key: 'original_filename', label: 'Fichier' },
          { key: 'file_size', label: 'Taille', render: (v) => `${(Number(v) / 1024).toFixed(1)} KB` },
          { key: 'mime_type', label: 'Type' },
          { key: 'created_at', label: 'Upload le' },
        ]}
        rows={(files?.results ?? []) as Record<string, unknown>[]}
      />
    </Layout>
  );
});

// Edit project (POST)
projectsRoutes.post('/projects/:id/edit', async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param('id');

  const project = await db.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return c.redirect('/dashboard/projects');

  const body = await c.req.parseBody();
  const name = String(body['name'] ?? '').trim();
  const description = String(body['description'] ?? '').trim();
  const serviceType = String(body['service_type'] ?? '').trim();
  const tier = String(body['tier'] ?? '').trim() || null;
  const status = String(body['status'] ?? '');
  const progress = Math.min(100, Math.max(0, parseInt(String(body['progress'] ?? '0'), 10)));
  const startDate = String(body['start_date'] ?? '').trim() || null;
  const endDate = String(body['end_date'] ?? '').trim() || null;
  const deliverablesUrl = String(body['deliverables_url'] ?? '').trim() || null;

  if (!name || !serviceType || !['in_progress', 'completed', 'paused'].includes(status)) {
    return c.redirect(`/dashboard/projects/${projectId}`);
  }

  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE projects
    SET name = ?, description = ?, service_type = ?, tier = ?, status = ?, progress = ?,
        start_date = ?, end_date = ?, deliverables_url = ?, last_update = ?, updated_at = ?
    WHERE id = ?
  `).bind(name, description, serviceType, tier, status, progress, startDate, endDate, deliverablesUrl, now, now, projectId).run();

  return c.redirect(`/dashboard/projects/${projectId}?msg=updated`);
});

// Archive project (POST)
projectsRoutes.post('/projects/:id/archive', async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param('id');
  const now = new Date().toISOString();

  await db.prepare('UPDATE projects SET is_archived = 1, updated_at = ? WHERE id = ?')
    .bind(now, projectId).run();

  return c.redirect(`/dashboard/projects/${projectId}?msg=archived`);
});

// Restore project (POST)
projectsRoutes.post('/projects/:id/restore', async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param('id');
  const now = new Date().toISOString();

  await db.prepare('UPDATE projects SET is_archived = 0, updated_at = ? WHERE id = ?')
    .bind(now, projectId).run();

  return c.redirect(`/dashboard/projects/${projectId}?msg=restored`);
});

export default projectsRoutes;
