import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import { createSupportTicketSchema } from '../validators/support';
import { createSupportTicket } from '../services/support';
import { rateLimit } from '../middleware/rate-limit';
import { notifySupportTicket } from '../services/notify';
import { background } from '../utils/background';

const support = new Hono<AppType>();

// POST /api/support — Créer un ticket (public)
support.post('/', rateLimit('FORMS_RATE_LIMITER', 'support'), zValidator('json', createSupportTicketSchema), async (c) => {
  const { email, name, category, message, metadata } = c.req.valid('json');

  const ticket = await createSupportTicket(
    c.env.DB,
    email,
    name,
    category,
    message,
    metadata
  );

  // Deux emails partent apres la reponse : l'accuse de reception au demandeur et
  // l'alerte complete vers la boite RaceUp (avec reply-to sur l'adresse du demandeur,
  // pour repondre sans copier-coller).
  background(
    c,
    notifySupportTicket(c.env, ticket).catch((err) => console.error('support emails failed', err))
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
