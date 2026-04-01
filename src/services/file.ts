import type { ProjectFileRecord } from '../types';

// Récupérer les fichiers d'un projet
export async function getFilesByProjectId(
  db: D1Database,
  projectId: string
): Promise<(ProjectFileRecord & { uploaded_by_role: string })[]> {
  const result = await db
    .prepare(
      `SELECT pf.*, u.role as uploaded_by_role
       FROM project_files pf
       JOIN users u ON u.id = pf.uploaded_by
       WHERE pf.project_id = ?
       ORDER BY pf.created_at DESC`
    )
    .bind(projectId)
    .all<ProjectFileRecord & { uploaded_by_role: string }>();

  return result.results;
}

// Récupérer un fichier par ID
export async function getFileById(
  db: D1Database,
  fileId: string
): Promise<ProjectFileRecord | null> {
  const result = await db
    .prepare('SELECT * FROM project_files WHERE id = ?')
    .bind(fileId)
    .first<ProjectFileRecord>();

  return result ?? null;
}

// Créer un enregistrement fichier en D1
export async function createFileRecord(
  db: D1Database,
  data: {
    project_id: string;
    uploaded_by: string;
    filename: string;
    original_filename: string;
    file_size: number;
    mime_type: string;
    r2_key: string;
  }
): Promise<ProjectFileRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO project_files (id, project_id, uploaded_by, filename, original_filename, file_size, mime_type, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      id,
      data.project_id,
      data.uploaded_by,
      data.filename,
      data.original_filename,
      data.file_size,
      data.mime_type,
      data.r2_key,
      now
    )
    .run();

  return {
    id,
    project_id: data.project_id,
    uploaded_by: data.uploaded_by,
    filename: data.filename,
    original_filename: data.original_filename,
    file_size: data.file_size,
    mime_type: data.mime_type,
    r2_key: data.r2_key,
    created_at: now,
  };
}

// Supprimer un fichier (metadata D1)
export async function deleteFileRecord(
  db: D1Database,
  fileId: string
): Promise<void> {
  await db.prepare('DELETE FROM project_files WHERE id = ?').bind(fileId).run();
}

// Calculer l'espace utilisé par un projet
export async function getProjectStorageUsed(
  db: D1Database,
  projectId: string
): Promise<number> {
  const result = await db
    .prepare('SELECT COALESCE(SUM(file_size), 0) as total FROM project_files WHERE project_id = ?')
    .bind(projectId)
    .first<{ total: number }>();

  return result?.total ?? 0;
}
