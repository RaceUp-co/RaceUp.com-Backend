import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware, superAdminMiddleware } from '../middleware/admin';
import {
  createProjectSchema,
  updateUserRoleSchema,
} from '../validators/admin';
import {
  getSupportTickets,
  getSupportTicketById,
  closeSupportTicket,
} from '../services/support';
import {
  supportTicketFilterSchema,
  closeSupportTicketSchema,
} from '../validators/support';
import { createProject } from '../services/project';
import { deleteUser } from '../services/user';
import {
  getAdminStats,
  getRegistrationStats,
  getPageViewStats,
} from '../services/analytics';
import { getUserById } from '../services/user';
import { logSecurityEvent } from '../services/security';
import {
  listConsents,
  getConsentById,
  getConsentHistory,
  getConsentStats,
  withdrawConsent,
  exportConsentsCsv,
} from '../services/consent';
import { consentFiltersSchema } from '../validators/consent';

const admin = new Hono<AppType>();

// Tous les endpoints admin sont protégés
admin.use('*', authMiddleware, adminMiddleware);

// GET /dashboard/overview — Statistiques globales (cartes)
// Note: Endpoints renommés pour éviter les blocages par les adblockers
admin.get('/dashboard/overview', async (c) => {
  const stats = await getAdminStats(c.env.DB);

  return c.json({
    success: true,
    data: stats,
  });
});

// GET /dashboard/signups?days=30 — Inscriptions par jour
admin.get('/dashboard/signups', async (c) => {
  const days = parseInt(c.req.query('days') ?? '30', 10);
  const data = await getRegistrationStats(c.env.DB, days);

  return c.json({
    success: true,
    data,
  });
});

// GET /dashboard/visits?days=30 — Pages vues par jour
admin.get('/dashboard/visits', async (c) => {
  const days = parseInt(c.req.query('days') ?? '30', 10);
  const data = await getPageViewStats(c.env.DB, days);

  return c.json({
    success: true,
    data,
  });
});

// GET /users?q=search&page=1&limit=50 — Liste utilisateurs avec recherche
admin.get('/users', async (c) => {
  const q = c.req.query('q') ?? '';
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const offset = (page - 1) * limit;

  let query: string;
  let countQuery: string;
  let bindings: unknown[];
  let countBindings: unknown[];

  if (q) {
    const search = `%${q}%`;
    query = `
      SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.birth_date, u.auth_provider, u.role, u.created_at, u.updated_at,
             COUNT(p.id) as project_count
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id AND p.is_archived = 0
      WHERE u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?
      GROUP BY u.id
      ORDER BY project_count DESC, u.created_at DESC
      LIMIT ? OFFSET ?
    `;
    countQuery = `
      SELECT COUNT(*) as total FROM users
      WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR username LIKE ?
    `;
    bindings = [search, search, search, search, limit, offset];
    countBindings = [search, search, search, search];
  } else {
    query = `
      SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.birth_date, u.auth_provider, u.role, u.created_at, u.updated_at,
             COUNT(p.id) as project_count
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id AND p.is_archived = 0
      GROUP BY u.id
      ORDER BY project_count DESC, u.created_at DESC
      LIMIT ? OFFSET ?
    `;
    countQuery = 'SELECT COUNT(*) as total FROM users';
    bindings = [limit, offset];
    countBindings = [];
  }

  const [usersResult, countResult] = await Promise.all([
    countBindings.length > 0
      ? db(c.env.DB, query, bindings)
      : db(c.env.DB, query, bindings),
    countBindings.length > 0
      ? c.env.DB.prepare(countQuery).bind(...countBindings).first<{ total: number }>()
      : c.env.DB.prepare(countQuery).first<{ total: number }>(),
  ]);

  return c.json({
    success: true,
    data: {
      users: usersResult,
      total: countResult?.total ?? 0,
      page,
      limit,
    },
  });
});

// GET /users/:id — Détail d'un utilisateur avec ses projets
admin.get('/users/:id', async (c) => {
  const userId = c.req.param('id');
  const user = await getUserById(c.env.DB, userId);

  if (!user) {
    return c.json(
      { success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' } },
      404
    );
  }

  // Récupérer les projets non archivés de l'utilisateur
  const projectsResult = await c.env.DB
    .prepare(
      `SELECT id, user_id, name, description, status, service_type, tier, start_date, end_date, progress, last_update, deliverables_url, is_archived, created_by, created_at, updated_at
       FROM projects WHERE user_id = ? AND is_archived = 0 ORDER BY created_at DESC`
    )
    .bind(userId)
    .all();

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        birth_date: user.birth_date,
        auth_provider: user.auth_provider,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      projects: projectsResult.results,
    },
  });
});

// PATCH /users/:id/role — Changer le rôle (super_admin uniquement)
admin.patch(
  '/users/:id/role',
  authMiddleware,
  superAdminMiddleware,
  zValidator('json', updateUserRoleSchema),
  async (c) => {
    const userId = c.req.param('id');
    const { role } = c.req.valid('json');

    const user = await getUserById(c.env.DB, userId);
    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Utilisateur introuvable.',
          },
        },
        404
      );
    }

    // Impossible de modifier le rôle d'un super_admin
    if (user.role === 'super_admin') {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Impossible de modifier le rôle d\'un super-administrateur.',
          },
        },
        403
      );
    }

    const currentUser = c.get('currentUser');
    await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
      .bind(role, new Date().toISOString(), userId)
      .run();

    logSecurityEvent(c.env.DB, {
      event_type: 'role_changed',
      user_id: currentUser.id,
      target_user_id: userId,
      details: `${user.role} → ${role} (by ${currentUser.email})`,
    });

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          role,
          created_at: user.created_at,
        },
      },
    });
  }
);

// GET /projects?status=&page=1&limit=50 — Tous les projets avec pagination
admin.get('/projects', async (c) => {
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const offset = (page - 1) * limit;
  const status = c.req.query('status') ?? '';
  const archived = c.req.query('archived') === '1';

  let where = archived ? 'WHERE p.is_archived = 1' : 'WHERE p.is_archived = 0';
  const bindings: unknown[] = [];
  const countBindings: unknown[] = [];

  if (status && !archived) {
    where += ' AND p.status = ?';
    bindings.push(status);
    countBindings.push(status);
  }

  const [projectsResult, countResult] = await Promise.all([
    db(c.env.DB, `
      SELECT p.id, p.user_id, p.name, p.description, p.status, p.service_type, p.tier,
             p.start_date, p.end_date, p.progress, p.last_update, p.deliverables_url,
             p.is_archived, p.created_by, p.created_at, p.updated_at,
             u.email as user_email
      FROM projects p
      LEFT JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...bindings, limit, offset]),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM projects p ${where}`)
      .bind(...countBindings).first<{ total: number }>(),
  ]);

  return c.json({
    success: true,
    data: {
      projects: projectsResult,
      total: countResult?.total ?? 0,
      page,
      limit,
    },
  });
});

// PATCH /projects/:id — Modifier un projet (admin)
admin.patch('/projects/:id', async (c) => {
  const projectId = c.req.param('id');
  const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();

  if (!project) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Projet introuvable.' } }, 404);
  }

  const body = await c.req.json();
  const fields: string[] = [];
  const values: unknown[] = [];

  const allowedFields: Record<string, (v: unknown) => unknown> = {
    name: (v) => String(v),
    description: (v) => String(v),
    service_type: (v) => String(v),
    tier: (v) => v ? String(v) : null,
    status: (v) => {
      const s = String(v);
      if (!['in_progress', 'completed', 'paused'].includes(s)) throw new Error('Invalid status');
      return s;
    },
    progress: (v) => Math.min(100, Math.max(0, Number(v))),
    start_date: (v) => v ? String(v) : null,
    end_date: (v) => v ? String(v) : null,
    deliverables_url: (v) => v ? String(v) : null,
    is_archived: (v) => Number(v) ? 1 : 0,
  };

  for (const [key, transform] of Object.entries(allowedFields)) {
    if (key in body) {
      try {
        fields.push(`${key} = ?`);
        values.push(transform(body[key]));
      } catch (_) {
        return c.json({ success: false, error: { code: 'INVALID_INPUT', message: `Valeur invalide pour ${key}.` } }, 400);
      }
    }
  }

  if (fields.length === 0) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Aucun champ a modifier.' } }, 400);
  }

  const now = new Date().toISOString();
  fields.push('last_update = ?', 'updated_at = ?');
  values.push(now, now, projectId);

  await c.env.DB.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values).run();

  const updated = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
  return c.json({ success: true, data: { project: updated } });
});

// DELETE /users/:id — Supprimer un utilisateur (super_admin)
admin.delete('/users/:id', async (c) => {
  const currentUser = c.get('currentUser');
  if (currentUser.role !== 'super_admin') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Seul un super_admin peut supprimer un utilisateur.' } }, 403);
  }

  const userId = c.req.param('id');
  const user = await getUserById(c.env.DB, userId);

  if (!user) {
    return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' } }, 404);
  }

  if (user.role === 'super_admin') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Impossible de supprimer un super-administrateur.' } }, 403);
  }

  // Delete R2 files
  const files = await c.env.DB.prepare(
    'SELECT r2_key FROM project_files WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)'
  ).bind(userId).all();

  for (const file of (files?.results ?? [])) {
    try { await c.env.R2.delete(String(file.r2_key)); } catch (_) { /* best-effort */ }
  }

  logSecurityEvent(c.env.DB, {
    event_type: 'admin_user_deleted',
    user_id: currentUser.id,
    target_user_id: userId,
    details: `email=${user.email} deleted by ${currentUser.email}`,
  });

  await deleteUser(c.env.DB, userId);

  return c.json({ success: true, data: { message: 'Utilisateur supprime.' } });
});

// POST /projects — Créer un projet pour un utilisateur
admin.post(
  '/projects',
  zValidator('json', createProjectSchema),
  async (c) => {
    const data = c.req.valid('json');

    const user = await getUserById(c.env.DB, data.user_id);
    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Utilisateur introuvable.',
          },
        },
        404
      );
    }

    const project = await createProject(c.env.DB, data);

    return c.json(
      {
        success: true,
        data: { project },
      },
      201
    );
  }
);

// GET /support-tickets — Liste tickets support avec filtres + pagination
admin.get('/support-tickets', async (c) => {
  const url = new URL(c.req.url);
  const parsed = supportTicketFilterSchema.safeParse({
    status: url.searchParams.get('status') || undefined,
    category: url.searchParams.get('category') || undefined,
    priority: url.searchParams.get('priority') || undefined,
    page: url.searchParams.get('page') || 1,
    limit: url.searchParams.get('limit') || 20,
  });

  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Paramètres invalides.' } }, 400);
  }

  const result = await getSupportTickets(c.env.DB, parsed.data);

  return c.json({
    success: true,
    data: result,
  });
});

// GET /support-tickets/:id — Detail ticket support
admin.get('/support-tickets/:id', async (c) => {
  const ticket = await getSupportTicketById(c.env.DB, c.req.param('id'));

  if (!ticket) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket introuvable.' } }, 404);
  }

  return c.json({
    success: true,
    data: { ticket },
  });
});

// PATCH /support-tickets/:id — Fermer un ticket
admin.patch('/support-tickets/:id', zValidator('json', closeSupportTicketSchema), async (c) => {
  const updated = await closeSupportTicket(c.env.DB, c.req.param('id'));

  if (!updated) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket introuvable.' } }, 404);
  }

  return c.json({
    success: true,
    data: { message: 'Ticket fermé avec succès.' },
  });
});

// Helper pour exécuter les requêtes préparées avec bindings dynamiques
async function db(database: D1Database, query: string, bindings: unknown[]) {
  const stmt = database.prepare(query);
  const result =
    bindings.length > 0
      ? await stmt.bind(...bindings).all()
      : await stmt.all();
  return result.results;
}

/**
 * GET /api/admin/consents — Liste paginee des consentements (filtres)
 */
admin.get('/consents', zValidator('query', consentFiltersSchema), async (c) => {
  const filters = c.req.valid('query');
  const result = await listConsents(c.env.DB, filters);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/admin/consents/stats?days=30
 */
admin.get('/consents/stats', async (c) => {
  const days = parseInt(c.req.query('days') ?? '30', 10);
  const stats = await getConsentStats(c.env.DB, days);
  return c.json({ success: true, data: stats });
});

/**
 * GET /api/admin/consents/export?format=csv&...
 */
admin.get('/consents/export', zValidator('query', consentFiltersSchema), async (c) => {
  const filters = c.req.valid('query');
  const gen = exportConsentsCsv(c.env.DB, filters);
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await gen.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(new TextEncoder().encode(value));
      }
    },
  });
  const filename = `consents-export-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

/**
 * GET /api/admin/consents/:id — Detail + historique
 */
admin.get('/consents/:id', async (c) => {
  const id = c.req.param('id');
  const consent = await getConsentById(c.env.DB, id);
  if (!consent) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Consent not found' } }, 404);
  }
  const history = await getConsentHistory(c.env.DB, consent.consent_id);
  return c.json({ success: true, data: { consent, history } });
});

/**
 * POST /api/admin/consents/:id/withdraw — Admin force le retrait
 */
admin.post('/consents/:id/withdraw', async (c) => {
  const id = c.req.param('id');
  const consent = await getConsentById(c.env.DB, id);
  if (!consent) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Consent not found' } }, 404);
  }
  await withdrawConsent(c.env.DB, consent.consent_id, 'user_request');
  return c.json({ success: true });
});

export default admin;
