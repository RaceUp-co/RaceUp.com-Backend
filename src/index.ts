import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppType } from './types';
import authRoutes from './routes/auth';

const app = new Hono<AppType>();

// CORS
app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      const allowed = [
        'https://race-up.net',
        'https://www.race-up.net',
      ];
      // En dev, autoriser localhost
      if (origin && (allowed.includes(origin) || origin.startsWith('http://localhost'))) {
        return origin;
      }
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
