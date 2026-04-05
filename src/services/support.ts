import type { SupportTicket } from '../types';

const SUPPORT_COLUMNS = 'id, email, name, category, priority, subject, message, metadata, status, created_at, closed_at';

const PRIORITY_MAP: Record<string, string> = {
  account_hacked: 'urgent',
  gdpr: 'urgent',
  account_issue: 'normal',
  project_inaccessible: 'normal',
  bug: 'normal',
  billing: 'normal',
  question: 'low',
  other: 'low',
};

const CATEGORY_LABELS: Record<string, string> = {
  account_issue: 'Problème de compte',
  account_hacked: 'Compte compromis',
  project_inaccessible: 'Projet inaccessible',
  bug: 'Bug technique',
  billing: 'Facturation',
  gdpr: 'Suppression de données',
  question: 'Question générale',
  other: 'Autre',
};

export async function createSupportTicket(
  db: D1Database,
  email: string,
  name: string,
  category: string,
  message: string,
  metadata?: Record<string, string>
): Promise<SupportTicket> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const priority = PRIORITY_MAP[category] || 'normal';
  const subject = `[${CATEGORY_LABELS[category] || category}] ${message.slice(0, 80)}`;
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  await db
    .prepare(
      'INSERT INTO support_tickets (id, email, name, category, priority, subject, message, metadata, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, email, name, category, priority, subject, message, metadataJson, 'open', now)
    .run();

  return {
    id,
    email,
    name,
    category,
    priority,
    subject,
    message,
    metadata: metadataJson,
    status: 'open',
    created_at: now,
    closed_at: null,
  };
}

export async function getSupportTickets(
  db: D1Database,
  filters: { status?: string; category?: string; priority?: string; page: number; limit: number }
): Promise<{ tickets: SupportTicket[]; total: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  if (filters.priority) {
    conditions.push('priority = ?');
    params.push(filters.priority);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM support_tickets ${where}`)
    .bind(...params)
    .first<{ count: number }>();

  const tickets = await db
    .prepare(
      `SELECT ${SUPPORT_COLUMNS} FROM support_tickets ${where} ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END, created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, filters.limit, offset)
    .all<SupportTicket>();

  return {
    tickets: tickets.results || [],
    total: countResult?.count || 0,
  };
}

export async function getSupportTicketById(
  db: D1Database,
  id: string
): Promise<SupportTicket | null> {
  const result = await db
    .prepare(`SELECT ${SUPPORT_COLUMNS} FROM support_tickets WHERE id = ?`)
    .bind(id)
    .first<SupportTicket>();

  return result ?? null;
}

export async function closeSupportTicket(
  db: D1Database,
  id: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare('UPDATE support_tickets SET status = ?, closed_at = ? WHERE id = ?')
    .bind('closed', now, id)
    .run();

  return result.meta.changes > 0;
}
