import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppType } from './types';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import projectRoutes from './routes/projects';
import trackingRoutes from './routes/tracking';
import consentRoutes from './routes/consent';
import supportRoutes from './routes/support';
import emailRoutes from './routes/emails';
import reviewRoutes from './routes/reviews';
import maintenanceRoutes from './routes/maintenance';
import paymentRoutes from './routes/payments';
import { loggerMiddleware } from './middleware/logger';
import { isCorsAllowedOrigin } from './utils/origins';
import { dashboardAuthMiddleware } from './dashboard/session';
import dashboardAuthRoutes from './dashboard/routes/auth';
import overviewRoutes from './dashboard/routes/overview';
import logsRoutes from './dashboard/routes/logs';
import errorsRoutes from './dashboard/routes/errors';
import usersRoutes from './dashboard/routes/users';
import projectsDashRoutes from './dashboard/routes/projects';
import databaseRoutes from './dashboard/routes/database';
import docsRoutes from './dashboard/routes/docs';
import configRoutes from './dashboard/routes/config';
import emailsDashRoutes from './dashboard/routes/emails';
import consentDashRoutes from './dashboard/routes/consent';
import paymentsDashRoutes from './dashboard/routes/payments';

const app = new Hono<AppType>();

// Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// Logger — intercepts all requests for dashboard metrics
app.use('*', loggerMiddleware);

// CORS (API only)
app.use(
  '/api/*',
  cors({
    origin: (origin) => (isCorsAllowedOrigin(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

// Health check
app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/track', trackingRoutes);
app.route('/api/consent', consentRoutes);
app.route('/api/support', supportRoutes);
app.route('/api/emails', emailRoutes);
app.route('/api/reviews', reviewRoutes);
app.route('/api/maintenance', maintenanceRoutes);
app.route('/api/payments', paymentRoutes);

// Dashboard — public routes (login/logout)
app.route('/dashboard', dashboardAuthRoutes);

// Dashboard — protected routes (session cookie required)
app.use('/dashboard', dashboardAuthMiddleware);
app.use('/dashboard/*', dashboardAuthMiddleware);
app.get('/dashboard/', (c) => c.redirect('/dashboard'));
app.route('/dashboard', overviewRoutes);
app.route('/dashboard', logsRoutes);
app.route('/dashboard', errorsRoutes);
app.route('/dashboard', usersRoutes);
app.route('/dashboard', projectsDashRoutes);
app.route('/dashboard', paymentsDashRoutes);
app.route('/dashboard', databaseRoutes);
app.route('/dashboard', docsRoutes);
app.route('/dashboard', configRoutes);
app.route('/dashboard', emailsDashRoutes);
app.route('/', consentDashRoutes);

// Global error handler
app.onError((err, c) => {
  console.error(err);
  const isDev = new URL(c.req.url).hostname === 'localhost' || new URL(c.req.url).hostname === '127.0.0.1';
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev ? String(err?.message ?? err) : 'Erreur interne du serveur.',
        ...(isDev && { stack: String(err?.stack ?? '') }),
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
