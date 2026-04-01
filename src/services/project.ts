import type { Project } from '../types';

const PROJECT_COLUMNS =
  'id, user_id, name, description, status, service_type, tier, start_date, end_date, progress, last_update, deliverables_url, is_archived, created_by, created_at, updated_at';

// Créer un projet (admin ou user)
export async function createProject(
  db: D1Database,
  data: {
    user_id: string;
    name: string;
    description?: string;
    service_type: string;
    tier?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    progress?: number;
    created_by?: string;
  }
): Promise<Project> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const startDate = data.start_date ?? now;

  await db
    .prepare(
      'INSERT INTO projects (id, user_id, name, description, status, service_type, tier, start_date, end_date, progress, last_update, is_archived, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)'
    )
    .bind(
      id,
      data.user_id,
      data.name,
      data.description ?? '',
      data.status ?? 'in_progress',
      data.service_type,
      data.tier ?? null,
      startDate,
      data.end_date ?? null,
      data.progress ?? 0,
      now,
      data.created_by ?? 'user',
      now,
      now
    )
    .run();

  return {
    id,
    user_id: data.user_id,
    name: data.name,
    description: data.description ?? '',
    status: (data.status ?? 'in_progress') as Project['status'],
    service_type: data.service_type,
    tier: data.tier ?? null,
    start_date: startDate,
    end_date: data.end_date ?? null,
    progress: data.progress ?? 0,
    last_update: now,
    deliverables_url: null,
    is_archived: 0,
    created_by: data.created_by ?? 'user',
    created_at: now,
    updated_at: now,
  };
}

export async function getProjectById(
  db: D1Database,
  id: string
): Promise<Project | null> {
  const result = await db
    .prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ? AND is_archived = 0`)
    .bind(id)
    .first<Project>();

  return result ?? null;
}

export async function getProjectsByUserId(
  db: D1Database,
  userId: string
): Promise<Project[]> {
  const result = await db
    .prepare(
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE user_id = ? AND is_archived = 0 ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<Project>();

  return result.results;
}

export async function getAllProjects(db: D1Database): Promise<Project[]> {
  const result = await db
    .prepare(
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE is_archived = 0 ORDER BY created_at DESC`
    )
    .all<Project>();

  return result.results;
}

export async function renameProject(
  db: D1Database,
  id: string,
  name: string
): Promise<Project | null> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
    .bind(name, now, id)
    .run();

  return getProjectById(db, id);
}

export async function archiveProject(
  db: D1Database,
  id: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE projects SET is_archived = 1, updated_at = ? WHERE id = ?')
    .bind(now, id)
    .run();
}

export async function deleteProject(
  db: D1Database,
  id: string
): Promise<void> {
  await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
}
