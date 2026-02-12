import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppType } from './types';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import trackingRoutes from './routes/tracking';

const app = new Hono<AppType>();

// CORS
app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      const allowed = [
        'https://raceup.com',
        'https://www.raceup.com',
        'https://race-up.net',
        'https://www.race-up.net',
      ];
      if (!origin) return null;
      // Domaines autorisés
      if (allowed.includes(origin)) return origin;
      // Cloudflare Pages (preview + production)
      if (origin.endsWith('.pages.dev')) return origin;
      // Dev local
      if (origin.startsWith('http://localhost')) return origin;
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

// Health check
app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// Routes d'authentification
app.route('/api/auth', authRoutes);

// Routes admin (protégées par auth + admin middleware)
app.route('/api/admin', adminRoutes);

// Routes tracking (publiques)
app.route('/api/track', trackingRoutes);

// Gestion d'erreur globale
app.onError((err, c) => {
  console.error(err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erreur interne du serveur.',
      },
    },
    500
  );
});

// 404
app.notFound((c) =>
  c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route non trouvée.',
      },
    },
    404
  )
);

export default app;
