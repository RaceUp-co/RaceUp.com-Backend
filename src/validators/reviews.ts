import { z } from 'zod';

// Un avis finit sur la page d'accueil : les bornes de longueur evitent qu'un temoignage
// casse la mise en page du carrousel, et le lien est restreint a http(s) pour qu'on ne
// puisse pas y glisser un `javascript:`.

const linkRule = z
  .string()
  .trim()
  .max(300, 'Le lien ne peut pas dépasser 300 caractères.')
  .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), {
    message: 'Le lien doit commencer par http:// ou https://.',
  })
  .transform((v) => (v === '' ? null : v))
  .optional();

export const createReviewSchema = z.object({
  project_id: z.string().min(1, 'Le projet est requis.'),
  author_company: z
    .string()
    .trim()
    .min(1, 'La société est requise.')
    .max(100, 'La société ne peut pas dépasser 100 caractères.'),
  author_role: z
    .string()
    .trim()
    .min(1, 'La fonction est requise.')
    .max(100, 'La fonction ne peut pas dépasser 100 caractères.'),
  rating: z.coerce.number().int().min(1, 'La note va de 1 à 5.').max(5, 'La note va de 1 à 5.'),
  comment_fr: z
    .string()
    .trim()
    .min(10, 'Le commentaire doit contenir au moins 10 caractères.')
    .max(1500, 'Le commentaire ne peut pas dépasser 1500 caractères.'),
  comment_en: z.string().trim().max(1500).optional(),
  link: linkRule,
});

export const updateReviewSchema = z
  .object({
    author_company: z.string().trim().min(1).max(100).optional(),
    author_role: z.string().trim().min(1).max(100).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    comment_fr: z.string().trim().min(10).max(1500).optional(),
    comment_en: z.string().trim().max(1500).optional(),
    link: linkRule,
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Aucun champ à modifier.' });

export const reviewVisibilitySchema = z.object({
  is_visible: z.boolean(),
});
