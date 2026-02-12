import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import { pageViewSchema } from '../validators/admin';
import { recordPageView } from '../services/analytics';

const tracking = new Hono<AppType>();

// POST /pageview — Endpoint public (pas d'auth)
tracking.post(
  '/pageview',
  zValidator('json', pageViewSchema),
  async (c) => {
    const { path, referrer } = c.req.valid('json');
    const userAgent = c.req.header('User-Agent') ?? null;
    const country = c.req.header('CF-IPCountry') ?? null;

    await recordPageView(c.env.DB, {
      path,
      referrer,
      user_agent: userAgent,
      country,
    });

    return c.json({ success: true }, 201);
  }
);

export default tracking;
