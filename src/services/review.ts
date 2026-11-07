import type { Review, ReviewWithContext } from '../types';

// Avis clients. Un avis appartient a un couple (projet, client) et n'est publie qu'apres
// moderation (is_visible = 1).
//
// Les lectures renvoient toujours le nom de l'auteur et le nom du projet, qui vivent dans
// d'autres tables : le front les affiche tels quels (carrousel, espace client, dashboard).

const REVIEW_COLUMNS =
  'r.id, r.project_id, r.user_id, r.author_company, r.author_role, r.rating, r.comment_fr, r.comment_en, r.link, r.is_visible, r.created_at, r.updated_at';

// Nom affiche de l'auteur : prenom + initiale du nom. Un temoignage public ne doit pas
// exposer le nom complet d'une personne sans necessite.
const AUTHOR_NAME_SQL = `TRIM(u.first_name || ' ' || COALESCE(SUBSTR(u.last_name, 1, 1) || '.', ''))`;

const JOINS = `
  FROM reviews r
  JOIN users u ON u.id = r.user_id
  JOIN projects p ON p.id = r.project_id`;

const SELECT_WITH_CONTEXT = `SELECT ${REVIEW_COLUMNS}, ${AUTHOR_NAME_SQL} AS author_name, p.name AS project_name`;

export async function getReviewById(db: D1Database, id: string): Promise<ReviewWithContext | null> {
  return (
    (await db.prepare(`${SELECT_WITH_CONTEXT} ${JOINS} WHERE r.id = ?`).bind(id).first<ReviewWithContext>()) ?? null
  );
}

/** Avis du client connecte (tous statuts : il doit voir son avis meme en attente). */
export async function getReviewsByUser(db: D1Database, userId: string): Promise<ReviewWithContext[]> {
  const result = await db
    .prepare(`${SELECT_WITH_CONTEXT} ${JOINS} WHERE r.user_id = ? ORDER BY r.created_at DESC`)
    .bind(userId)
    .all<ReviewWithContext>();
  return result.results ?? [];
}

/** Carrousel public : uniquement les avis moderes. */
export async function getPublicReviews(db: D1Database, limit = 20): Promise<ReviewWithContext[]> {
  const result = await db
    .prepare(
      `${SELECT_WITH_CONTEXT} ${JOINS}
       WHERE r.is_visible = 1 AND p.is_archived = 0
       ORDER BY r.created_at DESC LIMIT ?`
    )
    .bind(limit)
    .all<ReviewWithContext>();
  return result.results ?? [];
}

/** Vue admin : tout, y compris les avis en attente de moderation (affiches en premier). */
export async function getAllReviews(db: D1Database): Promise<ReviewWithContext[]> {
  const result = await db
    .prepare(`${SELECT_WITH_CONTEXT} ${JOINS} ORDER BY r.is_visible ASC, r.created_at DESC LIMIT 500`)
    .all<ReviewWithContext>();
  return result.results ?? [];
}

export async function getReviewByProjectAndUser(
  db: D1Database,
  projectId: string,
  userId: string
): Promise<Review | null> {
  return (
    (await db
      .prepare(
        `SELECT id, project_id, user_id, author_company, author_role, rating, comment_fr, comment_en,
                link, is_visible, created_at, updated_at
         FROM reviews WHERE project_id = ? AND user_id = ?`
      )
      .bind(projectId, userId)
      .first<Review>()) ?? null
  );
}

export type CreateReviewInput = {
  project_id: string;
  user_id: string;
  author_company: string;
  author_role: string;
  rating: number;
  comment_fr: string;
  comment_en: string | null;
  link: string | null;
};

export async function createReview(db: D1Database, data: CreateReviewInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO reviews (id, project_id, user_id, author_company, author_role, rating,
         comment_fr, comment_en, link, is_visible, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(
      id,
      data.project_id,
      data.user_id,
      data.author_company,
      data.author_role,
      data.rating,
      data.comment_fr,
      data.comment_en,
      data.link,
      now,
      now
    )
    .run();
  return id;
}

export type UpdateReviewInput = {
  author_company?: string;
  author_role?: string;
  rating?: number;
  comment_fr?: string;
  comment_en?: string | null;
  link?: string | null;
};

/**
 * Modification par le client. Un avis modifie repasse en moderation : sinon un client
 * pourrait faire approuver un texte neutre puis le remplacer par n'importe quoi.
 */
export async function updateReview(
  db: D1Database,
  reviewId: string,
  userId: string,
  data: UpdateReviewInput
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const key of ['author_company', 'author_role', 'rating', 'comment_fr', 'comment_en', 'link'] as const) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(data[key]);
    }
  }
  if (sets.length === 0) return false;

  sets.push('is_visible = 0', 'updated_at = ?');
  params.push(new Date().toISOString(), reviewId, userId);

  const result = await db
    .prepare(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...params)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Suppression par le proprietaire de l'avis (ou par un admin, qui passe adminDelete). */
export async function deleteReview(db: D1Database, reviewId: string, userId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM reviews WHERE id = ? AND user_id = ?')
    .bind(reviewId, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function adminDeleteReview(db: D1Database, reviewId: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM reviews WHERE id = ?').bind(reviewId).run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Moderation : publie ou retire un avis du site public. */
export async function setReviewVisibility(
  db: D1Database,
  reviewId: string,
  isVisible: boolean
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE reviews SET is_visible = ?, updated_at = ? WHERE id = ?')
    .bind(isVisible ? 1 : 0, new Date().toISOString(), reviewId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Representation publique (contrat partage avec le front : RaceUp.com/src/types/review.ts). */
export function toPublicReview(review: ReviewWithContext) {
  return {
    id: review.id,
    project_id: review.project_id,
    project_name: review.project_name,
    user_id: review.user_id,
    author_name: review.author_name,
    author_company: review.author_company,
    author_role: review.author_role,
    rating: review.rating,
    comment_fr: review.comment_fr,
    comment_en: review.comment_en ?? '',
    link: review.link ?? undefined,
    is_visible: review.is_visible === 1,
    created_at: review.created_at,
  };
}
