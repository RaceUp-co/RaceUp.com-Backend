import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import { createSupportTicketSchema } from '../validators/support';
import { createSupportTicket } from '../services/support';

const support = new Hono<AppType>();

// POST /api/support — Créer un ticket (public)
support.post('/', zValidator('json', createSupportTicketSchema), async (c) => {
  const { email, name, category, message, metadata } = c.req.valid('json');

  const ticket = await createSupportTicket(
    c.env.DB,
    email,
    name,
    category,
    message,
    metadata
  );

  return c.json(
    {
      success: true,
      data: {
        ticket_id: ticket.id,
        message: 'Votre ticket a été créé avec succès. Nous reviendrons vers vous par email.',
      },
    },
    201
  );
});

export default support;
