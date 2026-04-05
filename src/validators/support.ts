import { z } from 'zod';

const CATEGORIES = [
  'account_issue',
  'account_hacked',
  'project_inaccessible',
  'bug',
  'billing',
  'gdpr',
  'question',
  'other',
] as const;

const metadataSchema = z.object({
  account_email: z.string().email().optional(),
  username: z.string().max(30).optional(),
  incident_date: z.string().optional(),
  project_name: z.string().max(100).optional(),
  page_url: z.string().max(500).optional(),
  browser: z.string().max(100).optional(),
  order_number: z.string().max(50).optional(),
}).optional();

export const createSupportTicketSchema = z.object({
  email: z
    .string()
    .email('Email invalide.')
    .transform((val) => val.toLowerCase().trim()),
  name: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères.')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères.'),
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: 'Catégorie invalide.' }),
  }),
  message: z
    .string()
    .min(10, 'Le message doit contenir au moins 10 caractères.')
    .max(5000, 'Le message ne peut pas dépasser 5000 caractères.'),
  metadata: metadataSchema,
});

export const supportTicketFilterSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(['urgent', 'normal', 'low']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const closeSupportTicketSchema = z.object({
  status: z.literal('closed'),
});
