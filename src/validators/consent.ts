import { z } from 'zod';

export const consentCategoriesSchema = z.object({
  functional: z.boolean(),
  analytics: z.boolean(),
  marketing: z.boolean(),
});

export const consentInputSchema = z.object({
  consent_id: z.string().uuid().optional(),
  categories: consentCategoriesSchema,
  policy_version: z.string().regex(/^v\d+\.\d+\.\d+$/),
  consent_method: z.enum(['accept_all', 'reject_all', 'custom', 'banner_dismiss']),
  source_url: z.string().url().optional(),
});

export const withdrawInputSchema = z.object({
  consent_id: z.string().uuid(),
  reason: z.enum(['user_request', 'policy_change', 'expired']).optional(),
});

export const consentStatusQuerySchema = z.object({
  consent_id: z.string().uuid(),
});

export const consentFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  policy_version: z.string().optional(),
  user_id: z.string().optional(),
  consent_method: z.enum(['accept_all', 'reject_all', 'custom', 'banner_dismiss']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  status: z.enum(['active', 'withdrawn', 'expired']).optional(),
});

export type ConsentInput = z.infer<typeof consentInputSchema>;
export type WithdrawInput = z.infer<typeof withdrawInputSchema>;
