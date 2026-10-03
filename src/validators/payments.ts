import { z } from 'zod';
import type { Context } from 'hono';

const ORDER_STATUSES = [
  'awaiting_payment',
  'pending',
  'processing',
  'paid',
  'failed',
  'expired',
  'refunded',
  'canceled',
] as const;

const catalogId = z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/);

// POST /api/payments/checkout — acompte depuis le configurateur
export const depositCheckoutSchema = z.object({
  service_type: catalogId,
  base: catalogId,
  options: z.array(catalogId).max(20).default([]),
  expected_total: z.number().int().positive().max(1_000_000),
  lang: z.enum(['fr', 'en']).default('fr'),
  // Acceptation explicite des CGV (case a cocher du configurateur)
  accept_terms: z.literal(true),
});

// GET /api/payments/orders?project_id=
export const ordersQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
});

// GET /api/admin/purchases?status=&page=&limit=
export const adminPurchasesQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Hook zValidator : erreurs au format standard {success:false, error:{code, message}}
export function validationHook(
  result: { success: boolean; error?: z.ZodError },
  c: Context
): Response | undefined {
  if (result.success) return undefined;
  const issue = result.error?.issues[0];
  if (issue?.path[0] === 'accept_terms') {
    return c.json(
      { success: false, error: { code: 'TERMS_NOT_ACCEPTED', message: 'Vous devez accepter les CGV.' } },
      400
    );
  }
  return c.json(
    {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: issue ? `${issue.path.join('.') || 'body'} : ${issue.message}` : 'Requête invalide.',
      },
    },
    400
  );
}
