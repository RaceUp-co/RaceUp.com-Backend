import { z } from 'zod';

export const createProjectSchema = z.object({
  user_id: z.string().min(1, 'ID utilisateur requis.'),
  name: z.string().min(1, 'Le nom est requis.').max(200),
  description: z.string().max(2000).default(''),
  service_type: z.string().min(1, 'Le type de service est requis.'),
  status: z
    .enum(['in_progress', 'completed', 'paused'])
    .default('in_progress'),
  start_date: z.string().min(1, 'La date de début est requise.'),
  end_date: z.string().optional(),
  progress: z.number().min(0).max(100).default(0),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export const pageViewSchema = z.object({
  path: z.string().min(1).max(500),
  referrer: z.string().max(500).optional(),
});
