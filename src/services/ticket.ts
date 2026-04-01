import type { Ticket, TicketMessage } from '../types';

// Récupérer les tickets d'un projet avec le nombre de messages
export async function getTicketsByProjectId(
  db: D1Database,
  projectId: string
): Promise<(Ticket & { messages_count: number })[]> {
  const result = await db
    .prepare(
      `SELECT t.*, COUNT(tm.id) as messages_count
       FROM tickets t
       LEFT JOIN ticket_messages tm ON tm.ticket_id = t.id
       WHERE t.project_id = ?
       GROUP BY t.id
       ORDER BY t.updated_at DESC`
    )
    .bind(projectId)
    .all<Ticket & { messages_count: number }>();

  return result.results;
}

// Récupérer un ticket par ID
export async function getTicketById(
  db: D1Database,
  ticketId: string
): Promise<Ticket | null> {
  const result = await db
    .prepare('SELECT * FROM tickets WHERE id = ?')
    .bind(ticketId)
    .first<Ticket>();

  return result ?? null;
}

// Créer un ticket avec son premier message
export async function createTicket(
  db: D1Database,
  data: {
    project_id: string;
    subject: string;
    created_by: string;
    message: string;
  }
): Promise<Ticket> {
  const ticketId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Créer le ticket
  await db
    .prepare(
      'INSERT INTO tickets (id, project_id, subject, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(ticketId, data.project_id, data.subject, 'open', data.created_by, now, now)
    .run();

  // Créer le premier message
  await db
    .prepare(
      'INSERT INTO ticket_messages (id, ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(messageId, ticketId, data.created_by, data.message, now)
    .run();

  return {
    id: ticketId,
    project_id: data.project_id,
    subject: data.subject,
    status: 'open',
    created_by: data.created_by,
    created_at: now,
    updated_at: now,
  };
}

// Récupérer les messages d'un ticket avec infos auteur
export async function getTicketMessages(
  db: D1Database,
  ticketId: string
): Promise<(TicketMessage & { author_name: string; author_role: string })[]> {
  const result = await db
    .prepare(
      `SELECT tm.*,
              COALESCE(u.first_name || ' ' || u.last_name, u.username) as author_name,
              u.role as author_role
       FROM ticket_messages tm
       JOIN users u ON u.id = tm.author_id
       WHERE tm.ticket_id = ?
       ORDER BY tm.created_at ASC`
    )
    .bind(ticketId)
    .all<TicketMessage & { author_name: string; author_role: string }>();

  return result.results;
}

// Ajouter un message à un ticket
export async function addMessage(
  db: D1Database,
  data: {
    ticket_id: string;
    author_id: string;
    content: string;
  }
): Promise<TicketMessage & { author_name: string; author_role: string }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO ticket_messages (id, ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(id, data.ticket_id, data.author_id, data.content, now)
    .run();

  // Mettre à jour updated_at du ticket
  await db
    .prepare('UPDATE tickets SET updated_at = ? WHERE id = ?')
    .bind(now, data.ticket_id)
    .run();

  // Récupérer les infos auteur
  const author = await db
    .prepare('SELECT first_name, last_name, username, role FROM users WHERE id = ?')
    .bind(data.author_id)
    .first<{ first_name: string; last_name: string; username: string; role: string }>();

  return {
    id,
    ticket_id: data.ticket_id,
    author_id: data.author_id,
    content: data.content,
    created_at: now,
    author_name: author ? `${author.first_name} ${author.last_name}` : 'Inconnu',
    author_role: author?.role ?? 'user',
  };
}

// Changer le statut d'un ticket
export async function updateTicketStatus(
  db: D1Database,
  ticketId: string,
  status: 'open' | 'resolved'
): Promise<Ticket | null> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, now, ticketId)
    .run();

  return getTicketById(db, ticketId);
}
