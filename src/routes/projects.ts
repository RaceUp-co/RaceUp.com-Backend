import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppType } from '../types';
import { authMiddleware } from '../middleware/auth';
import { getUserById } from '../services/user';
import {
  createProject,
  getProjectById,
  getProjectsByUserId,
  renameProject,
  archiveProject,
} from '../services/project';
import {
  getTicketsByProjectId,
  getTicketById,
  createTicket,
  getTicketMessages,
  addMessage,
  updateTicketStatus,
} from '../services/ticket';
import {
  getFilesByProjectId,
  getFileById,
  createFileRecord,
  deleteFileRecord,
  getProjectStorageUsed,
} from '../services/file';

const projects = new Hono<AppType>();

// Tous les endpoints nécessitent une authentification
projects.use('*', authMiddleware);

// Helper : vérifie que l'utilisateur a accès au projet (propriétaire ou admin)
async function assertProjectAccess(
  db: D1Database,
  projectId: string,
  userId: string,
  userRole: string
) {
  const project = await getProjectById(db, projectId);
  if (!project) return { error: 'PROJECT_NOT_FOUND' as const, project: null };
  if (project.user_id !== userId && userRole !== 'admin' && userRole !== 'super_admin') {
    return { error: 'FORBIDDEN' as const, project: null };
  }
  return { error: null, project };
}

// ==================== PROJETS ====================

// GET /api/projects — Liste des projets de l'utilisateur courant
projects.get('/', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const list = await getProjectsByUserId(c.env.DB, user.id);
  return c.json({ success: true, data: { projects: list } });
});

// POST /api/projects — Créer un projet (par l'utilisateur lui-même)
const createProjectSchema = z.object({
  service_type: z.string().min(1),
  tier: z.string().optional(),
  name: z.string().min(1).max(200),
});

projects.post('/', zValidator('json', createProjectSchema), async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const data = c.req.valid('json');
  const project = await createProject(c.env.DB, {
    user_id: user.id,
    name: data.name,
    service_type: data.service_type,
    tier: data.tier,
    created_by: 'user',
  });

  return c.json({ success: true, data: { project } }, 201);
});

// GET /api/projects/:id — Détail d'un projet
projects.get('/:id', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error, project } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error === 'PROJECT_NOT_FOUND') return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Projet introuvable.' } }, 404);
  if (error === 'FORBIDDEN') return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès interdit.' } }, 403);

  return c.json({ success: true, data: { project } });
});

// PATCH /api/projects/:id — Renommer un projet
const renameSchema = z.object({ name: z.string().min(1).max(200) });

projects.patch('/:id', zValidator('json', renameSchema), async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error === 'PROJECT_NOT_FOUND') return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Projet introuvable.' } }, 404);
  if (error === 'FORBIDDEN') return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès interdit.' } }, 403);

  const { name } = c.req.valid('json');
  const project = await renameProject(c.env.DB, c.req.param('id'), name);
  return c.json({ success: true, data: { project } });
});

// DELETE /api/projects/:id — Archiver un projet (soft delete)
projects.delete('/:id', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error === 'PROJECT_NOT_FOUND') return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Projet introuvable.' } }, 404);
  if (error === 'FORBIDDEN') return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès interdit.' } }, 403);

  await archiveProject(c.env.DB, c.req.param('id'));
  return c.json({ success: true });
});

// ==================== TICKETS ====================

// GET /api/projects/:id/tickets — Liste tickets du projet
projects.get('/:id/tickets', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error) return c.json({ success: false, error: { code: error, message: error === 'PROJECT_NOT_FOUND' ? 'Projet introuvable.' : 'Accès interdit.' } }, error === 'PROJECT_NOT_FOUND' ? 404 : 403);

  const tickets = await getTicketsByProjectId(c.env.DB, c.req.param('id'));
  return c.json({ success: true, data: { tickets } });
});

// POST /api/projects/:id/tickets — Créer un ticket
const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});

projects.post('/:id/tickets', zValidator('json', createTicketSchema), async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error) return c.json({ success: false, error: { code: error, message: error === 'PROJECT_NOT_FOUND' ? 'Projet introuvable.' : 'Accès interdit.' } }, error === 'PROJECT_NOT_FOUND' ? 404 : 403);

  const data = c.req.valid('json');
  const ticket = await createTicket(c.env.DB, {
    project_id: c.req.param('id'),
    subject: data.subject,
    created_by: user.id,
    message: data.message,
  });

  return c.json({ success: true, data: { ticket } }, 201);
});

// GET /api/projects/:id/tickets/:ticketId — Détail ticket + messages
projects.get('/:id/tickets/:ticketId', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error) return c.json({ success: false, error: { code: error, message: error === 'PROJECT_NOT_FOUND' ? 'Projet introuvable.' : 'Accès interdit.' } }, error === 'PROJECT_NOT_FOUND' ? 404 : 403);

  const ticket = await getTicketById(c.env.DB, c.req.param('ticketId'));
  if (!ticket || ticket.project_id !== c.req.param('id')) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket introuvable.' } }, 404);
  }

  const messages = await getTicketMessages(c.env.DB, c.req.param('ticketId'));
  return c.json({ success: true, data: { ticket, messages } });
});

// PATCH /api/projects/:id/tickets/:ticketId — Changer statut
const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'resolved']),
});

projects.patch('/:id/tickets/:ticketId', zValidator('json', updateTicketStatusSchema), async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error) return c.json({ success: false, error: { code: error, message: error === 'PROJECT_NOT_FOUND' ? 'Projet introuvable.' : 'Accès interdit.' } }, error === 'PROJECT_NOT_FOUND' ? 404 : 403);

  const ticket = await getTicketById(c.env.DB, c.req.param('ticketId'));
  if (!ticket || ticket.project_id !== c.req.param('id')) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket introuvable.' } }, 404);
  }

  const { status } = c.req.valid('json');
  const updated = await updateTicketStatus(c.env.DB, c.req.param('ticketId'), status);
  return c.json({ success: true, data: { ticket: updated } });
});

// POST /api/projects/:id/tickets/:ticketId/messages — Ajouter un message
const addMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

projects.post('/:id/tickets/:ticketId/messages', zValidator('json', addMessageSchema), async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error) return c.json({ success: false, error: { code: error, message: error === 'PROJECT_NOT_FOUND' ? 'Projet introuvable.' : 'Accès interdit.' } }, error === 'PROJECT_NOT_FOUND' ? 404 : 403);

  const ticket = await getTicketById(c.env.DB, c.req.param('ticketId'));
  if (!ticket || ticket.project_id !== c.req.param('id')) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket introuvable.' } }, 404);
  }

  const { content } = c.req.valid('json');
  const message = await addMessage(c.env.DB, {
    ticket_id: c.req.param('ticketId'),
    author_id: user.id,
    content,
  });

  return c.json({ success: true, data: { message } }, 201);
});

// ==================== FICHIERS ====================

// Limites pour les utilisateurs non-admin
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo
const MAX_PROJECT_SIZE = 100 * 1024 * 1024; // 100 Mo
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
];

// GET /api/projects/:id/files — Liste fichiers du projet
projects.get('/:id/files', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error) return c.json({ success: false, error: { code: error, message: error === 'PROJECT_NOT_FOUND' ? 'Projet introuvable.' : 'Accès interdit.' } }, error === 'PROJECT_NOT_FOUND' ? 404 : 403);

  const files = await getFilesByProjectId(c.env.DB, c.req.param('id'));

  // Enrichir avec l'URL de téléchargement (sera gérée par un endpoint dédié)
  const enriched = files.map((f) => ({
    id: f.id,
    project_id: f.project_id,
    uploaded_by: f.uploaded_by,
    uploaded_by_role: f.uploaded_by_role,
    filename: f.filename,
    original_filename: f.original_filename,
    file_size: f.file_size,
    mime_type: f.mime_type,
    created_at: f.created_at,
  }));

  return c.json({ success: true, data: { files: enriched } });
});

// POST /api/projects/:id/files — Upload un fichier (multipart/form-data)
projects.post('/:id/files', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error, project } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error || !project) return c.json({ success: false, error: { code: error ?? 'NOT_FOUND', message: 'Projet introuvable ou accès interdit.' } }, error === 'FORBIDDEN' ? 403 : 404);

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  // Parser le formulaire multipart
  const formData = await c.req.formData();
  const file = formData.get('file') as unknown as File | null;
  if (!file || typeof file.arrayBuffer !== 'function') {
    return c.json({ success: false, error: { code: 'INVALID_FILE', message: 'Aucun fichier fourni.' } }, 400);
  }

  // Vérifications pour les non-admins
  if (!isAdmin) {
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Le fichier dépasse 25 Mo.' } }, 400);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return c.json({ success: false, error: { code: 'INVALID_TYPE', message: 'Type de fichier non autorisé.' } }, 400);
    }
    const used = await getProjectStorageUsed(c.env.DB, project.id);
    if (used + file.size > MAX_PROJECT_SIZE) {
      return c.json({ success: false, error: { code: 'STORAGE_LIMIT', message: 'Limite de stockage du projet atteinte (100 Mo).' } }, 400);
    }
  }

  // Upload vers R2
  const ext = file.name.split('.').pop() || 'bin';
  const r2Key = `projects/${project.id}/${crypto.randomUUID()}.${ext}`;

  await c.env.R2.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { originalName: file.name },
  });

  // Enregistrer en D1
  const record = await createFileRecord(c.env.DB, {
    project_id: project.id,
    uploaded_by: user.id,
    filename: r2Key.split('/').pop()!,
    original_filename: file.name,
    file_size: file.size,
    mime_type: file.type,
    r2_key: r2Key,
  });

  return c.json({
    success: true,
    data: {
      file: {
        id: record.id,
        project_id: record.project_id,
        uploaded_by: record.uploaded_by,
        uploaded_by_role: user.role,
        filename: record.filename,
        original_filename: record.original_filename,
        file_size: record.file_size,
        mime_type: record.mime_type,
        created_at: record.created_at,
      },
    },
  }, 201);
});

// GET /api/projects/:id/files/:fileId/download — URL de téléchargement signée
projects.get('/:id/files/:fileId/download', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error) return c.json({ success: false, error: { code: error, message: error === 'PROJECT_NOT_FOUND' ? 'Projet introuvable.' : 'Accès interdit.' } }, error === 'PROJECT_NOT_FOUND' ? 404 : 403);

  const file = await getFileById(c.env.DB, c.req.param('fileId'));
  if (!file || file.project_id !== c.req.param('id')) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Fichier introuvable.' } }, 404);
  }

  // Récupérer le fichier depuis R2 et le streamer directement
  const r2Object = await c.env.R2.get(file.r2_key);
  if (!r2Object) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Fichier introuvable dans le stockage.' } }, 404);
  }

  return new Response(r2Object.body, {
    headers: {
      'Content-Type': file.mime_type,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.original_filename)}"`,
      'Content-Length': file.file_size.toString(),
    },
  });
});

// DELETE /api/projects/:id/files/:fileId — Supprimer un fichier
projects.delete('/:id/files/:fileId', async (c) => {
  const payload = c.get('jwtPayload');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);

  const { error } = await assertProjectAccess(c.env.DB, c.req.param('id'), user.id, user.role);
  if (error) return c.json({ success: false, error: { code: error, message: error === 'PROJECT_NOT_FOUND' ? 'Projet introuvable.' : 'Accès interdit.' } }, error === 'PROJECT_NOT_FOUND' ? 404 : 403);

  const file = await getFileById(c.env.DB, c.req.param('fileId'));
  if (!file || file.project_id !== c.req.param('id')) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Fichier introuvable.' } }, 404);
  }

  // Supprimer de R2
  await c.env.R2.delete(file.r2_key);
  // Supprimer de D1
  await deleteFileRecord(c.env.DB, file.id);

  return c.json({ success: true });
});

export default projects;
