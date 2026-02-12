import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import {
  createProjectSchema,
  updateUserRoleSchema,
} from '../validators/admin';
import { createProject, getAllProjects } from '../services/project';
import {
  getAdminStats,
  getRegistrationStats,
  getPageViewStats,
} from '../services/analytics';
import { getUserById } from '../services/user';

const admin = new Hono<AppType>();

// Tous les endpoints admin sont protégés
admin.use('*', authMiddleware, adminMiddleware);

// GET /stats — Statistiques globales (cartes)
admin.get('/stats', async (c) => {
  const stats = await getAdminStats(c.env.DB);

  return c.json({
    success: true,
    data: stats,
  });
});

// GET /stats/registrations?days=30 — Inscriptions par jour
admin.get('/stats/registrations', async (c) => {
  const days = parseInt(c.req.query('days') ?? '30', 10);
  const data = await getRegistrationStats(c.env.DB, days);

  return c.json({
    success: true,
    data,
  });
});

// GET /stats/pageviews?days=30 — Pages vues par jour
admin.get('/stats/pageviews', async (c) => {
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
      LEFT JOIN projects p ON p.user_id = u.id
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
      LEFT JOIN projects p ON p.user_id = u.id
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

// PATCH /users/:id/role — Changer le rôle
admin.patch(
  '/users/:id/role',
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

    await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
      .bind(role, new Date().toISOString(), userId)
      .run();

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

// GET /projects — Tous les projets
admin.get('/projects', async (c) => {
  const projects = await getAllProjects(c.env.DB);

  return c.json({
    success: true,
    data: { projects },
  });
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

// Helper pour exécuter les requêtes préparées avec bindings dynamiques
async function db(database: D1Database, query: string, bindings: unknown[]) {
  const stmt = database.prepare(query);
  const result =
    bindings.length > 0
      ? await stmt.bind(...bindings).all()
      : await stmt.all();
  return result.results;
}

export default admin;
