import type { Context, Next } from 'hono';
import type { AppType } from '../types';

export async function loggerMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<void> {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const path = new URL(c.req.url).pathname;

  // Skip logging dashboard asset requests and the login page itself
  if (path === '/dashboard/login' && c.req.method === 'GET') return;

  // Extract user_id from JWT payload if available
  let userId: string | null = null;
  try {
    const payload = c.get('jwtPayload');
    if (payload?.sub) userId = payload.sub;
  } catch {
    // No JWT payload available
  }

  // Extract error message for failed requests
  let error: string | null = null;
  if (c.res.status >= 400) {
    try {
      const cloned = c.res.clone();
      const body = await cloned.text();
      error = body.substring(0, 500);
    } catch {
      error = null;
    }
  }

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;
  const country = c.req.header('cf-ipcountry') ?? null;
  const userAgent = c.req.header('user-agent') ?? null;

  // Fire-and-forget: don't block the response
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      'INSERT INTO request_logs (method, path, status_code, duration_ms, user_id, ip, country, user_agent, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        c.req.method,
        path,
        c.res.status,
        duration,
        userId,
        ip,
        country,
        userAgent,
        error,
        new Date().toISOString()
      )
      .run()
      .catch((err) => console.error('Logger error:', err))
  );
}
