import type { Project } from '../types';

const PROJECT_COLUMNS =
  'id, user_id, name, description, status, service_type, start_date, end_date, progress, last_update, deliverables_url, created_at, updated_at';

export async function createProject(
  db: D1Database,
  data: {
    user_id: string;
    name: string;
    description: string;
    service_type: string;
    status?: string;
    start_date: string;
    end_date?: string;
    progress?: number;
  }
): Promise<Project> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO projects (id, user_id, name, description, status, service_type, start_date, end_date, progress, last_update, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      id,
      data.user_id,
      data.name,
      data.description,
      data.status ?? 'in_progress',
      data.service_type,
      data.start_date,
      data.end_date ?? null,
      data.progress ?? 0,
      now,
      now,
      now
    )
    .run();

  return {
    id,
    user_id: data.user_id,
    name: data.name,
    description: data.description,
    status: (data.status ?? 'in_progress') as Project['status'],
    service_type: data.service_type,
    start_date: data.start_date,
    end_date: data.end_date ?? null,
    progress: data.progress ?? 0,
    last_update: now,
    deliverables_url: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getProjectById(
  db: D1Database,
  id: string
): Promise<Project | null> {
  const result = await db
    .prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`)
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
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE user_id = ? ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<Project>();

  return result.results;
}

export async function getAllProjects(db: D1Database): Promise<Project[]> {
  const result = await db
    .prepare(
      `SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY created_at DESC`
    )
    .all<Project>();

  return result.results;
}

export async function deleteProject(
  db: D1Database,
  id: string
): Promise<void> {
  await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
}
