import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { getUserById } from '../services/user';
import { getProjectById } from '../services/project';
import {
  createReview,
  deleteReview,
  getReviewByProjectAndUser,
  getReviewById,
  getPublicReviews,
  getReviewsByUser,
  toPublicReview,
  updateReview,
} from '../services/review';
import { createReviewSchema, updateReviewSchema } from '../validators/reviews';
import { validationHook } from '../validators/payments';
import { notifyNewReview } from '../services/notify';
import { background } from '../utils/background';

const reviews = new Hono<AppType>();

// GET /api/reviews/public — carrousel de temoignages du site (public, cache court)
reviews.get('/public', async (c) => {
  const list = await getPublicReviews(c.env.DB);
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ success: true, data: { reviews: list.map(toPublicReview) } });
});

// GET /api/reviews/my — avis du client connecte (y compris ceux en attente de moderation)
reviews.get('/my', authMiddleware, async (c) => {
  const list = await getReviewsByUser(c.env.DB, c.get('jwtPayload').sub);
  return c.json({ success: true, data: { reviews: list.map(toPublicReview) } });
});

// POST /api/reviews — deposer un avis sur un projet termine (JWT, proprietaire du projet)
reviews.post(
  '/',
  authMiddleware,
  rateLimit('FORMS_RATE_LIMITER', 'review-create'),
  zValidator('json', createReviewSchema, validationHook),
  async (c) => {
    const data = c.req.valid('json');
    const user = await getUserById(c.env.DB, c.get('jwtPayload').sub);
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Utilisateur introuvable.' } }, 401);
    }

    const project = await getProjectById(c.env.DB, data.project_id);
    if (!project || project.user_id !== user.id) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Projet introuvable.' } }, 404);
    }

    // On ne temoigne que sur un travail livre : c'est la regle appliquee par le front
    // (il ne liste que les projets termines), revalidee ici.
    if (project.status !== 'completed') {
      return c.json(
        {
          success: false,
          error: {
            code: 'PROJECT_NOT_COMPLETED',
            message: 'Vous pourrez laisser un avis une fois le projet terminé.',
          },
        },
        409
      );
    }

    if (await getReviewByProjectAndUser(c.env.DB, data.project_id, user.id)) {
      return c.json(
        {
          success: false,
          error: { code: 'REVIEW_ALREADY_EXISTS', message: 'Vous avez déjà laissé un avis sur ce projet.' },
        },
        409
      );
    }

    const id = await createReview(c.env.DB, {
      project_id: data.project_id,
      user_id: user.id,
      author_company: data.author_company,
      author_role: data.author_role,
      rating: data.rating,
      comment_fr: data.comment_fr,
      comment_en: data.comment_en?.trim() || null,
      link: data.link ?? null,
    });

    const created = await getReviewById(c.env.DB, id);

    // Un avis n'est pas publie tant qu'il n'est pas relu : il faut donc prevenir.
    if (created) {
      background(
        c,
        notifyNewReview(c.env, created, project.name).catch((err) =>
          console.error('new review email failed', err)
        )
      );
    }

    return c.json({ success: true, data: { review: created ? toPublicReview(created) : null } }, 201);
  }
);

// PUT /api/reviews/:id — modifier son propre avis (repasse en moderation)
reviews.put('/:id', authMiddleware, zValidator('json', updateReviewSchema, validationHook), async (c) => {
  const reviewId = (c.req.param('id') ?? '');
  const userId = c.get('jwtPayload').sub;
  const data = c.req.valid('json');

  const updated = await updateReview(c.env.DB, reviewId, userId, {
    ...data,
    comment_en: data.comment_en !== undefined ? data.comment_en.trim() || null : undefined,
  });

  if (!updated) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Avis introuvable.' } }, 404);
  }

  const review = await getReviewById(c.env.DB, reviewId);
  return c.json({ success: true, data: { review: review ? toPublicReview(review) : null } });
});

// DELETE /api/reviews/:id — supprimer son propre avis
reviews.delete('/:id', authMiddleware, async (c) => {
  const deleted = await deleteReview(c.env.DB, (c.req.param('id') ?? ''), c.get('jwtPayload').sub);
  if (!deleted) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Avis introuvable.' } }, 404);
  }
  return c.json({ success: true, data: { success: true } });
});

export default reviews;
