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

  let where = 'WHERE p.is_archived = 0';
  const bindings: unknown[] = [];
  const countBindings: unknown[] = [];

  if (status) {
    where += ' AND p.status = ?';
    bindings.push(status);
    countBindings.push(status);
  }

  bindings.push(limit, offset);

  const [projectsResult, countResult] = await Promise.all([
    db.prepare(`
      SELECT p.id, p.name, p.status, p.service_type, p.progress, p.created_at,
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

  return c.html(
    <Layout title="Projets" currentPath="/dashboard/projects" role={session.role}>
      <form class="filters" method="GET" action="/dashboard/projects">
        <select name="status">
          <option value="">Tous statuts</option>
          <option value="in_progress" selected={status === 'in_progress'}>En cours</option>
          <option value="completed" selected={status === 'completed'}>Termine</option>
          <option value="paused" selected={status === 'paused'}>En pause</option>
        </select>
        <button type="submit">Filtrer</button>
      </form>

      <DataTable
        columns={[
          {
            key: 'name',
            label: 'Nom',
            render: (v, row) => `<a href="/dashboard/projects/${row.id}">${String(v)}</a>`,
          },
          { key: 'user_email', label: 'Client' },
          { key: 'service_type', label: 'Service' },
          { key: 'status', label: 'Statut' },
          { key: 'progress', label: 'Progress', render: (v) => `${v}%` },
          { key: 'created_at', label: 'Cree le' },
        ]}
        rows={(projectsResult?.results ?? []) as Record<string, unknown>[]}
      />

      <Pagination basePath="/dashboard/projects" page={page} total={total} limit={limit} queryParams={`status=${status}`} />
    </Layout>
  );
});

// Project detail
projectsRoutes.get('/projects/:id', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const projectId = c.req.param('id');

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

  return c.html(
    <Layout title={`Projet: ${project.name}`} currentPath="/dashboard/projects" role={session.role}>
      <a href="/dashboard/projects" style="font-size:12px;">&laquo; Retour a la liste</a>

      <table style="margin:16px 0;width:auto;">
        <tr><td style="color:#707090;padding-right:20px;">ID</td><td>{String(project.id)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Nom</td><td>{String(project.name)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Client</td><td><a href={`/dashboard/users/${project.user_id}`}>{String(project.user_email)}</a></td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Service</td><td>{String(project.service_type)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Statut</td><td>{String(project.status)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Progression</td><td>{String(project.progress)}%</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Cree le</td><td>{String(project.created_at)}</td></tr>
      </table>

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

export default projectsRoutes;
