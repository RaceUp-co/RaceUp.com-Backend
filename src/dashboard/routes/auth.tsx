import { Hono } from 'hono';
import type { AppType } from '../../types';
import { LoginLayout } from '../layout';
import {
  authenticateDashboardUser,
  createSessionCookie,
  clearSessionCookie,
} from '../session';

const authRoutes = new Hono<AppType>();

authRoutes.get('/login', (c) => {
  const error = c.req.query('error');
  return c.html(
    <LoginLayout>
      <div class="login-box">
        <h1>RaceUp Dashboard</h1>
        {error && <div class="login-error">{decodeURIComponent(error)}</div>}
        <form method="post" action="/dashboard/login">
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label>Mot de passe</label>
            <input type="password" name="password" required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn" style="width:100%;margin-top:8px;">
            Se connecter
          </button>
        </form>
      </div>
    </LoginLayout>
  );
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body['email'] ?? '');
  const password = String(body['password'] ?? '');

  if (!email || !password) {
    return c.redirect('/dashboard/login?error=' + encodeURIComponent('Email et mot de passe requis.'));
  }

  const result = await authenticateDashboardUser(c, email, password);
  if (!result.success) {
    return c.redirect('/dashboard/login?error=' + encodeURIComponent(result.error!));
  }

  await createSessionCookie(c, result.userId!, email, result.role!);
  return c.redirect('/dashboard/');
});

authRoutes.get('/logout', (c) => {
  clearSessionCookie(c);
  return c.redirect('/dashboard/login');
});

export default authRoutes;
