import { Hono } from 'hono';
import type { AppType } from '../../types';
import { LoginLayout } from '../layout';
import {
  authenticateDashboardUser,
  createSessionCookie,
  clearSessionCookie,
} from '../session';
import { rateLimit } from '../../middleware/rate-limit';

const authRoutes = new Hono<AppType>();

// Messages affiches sur la page de connexion. L'URL ne transporte qu'un CODE : un lien piege
// ne peut pas faire afficher un texte arbitraire (hameconnage) ni casser le decodage.
const LOGIN_ERRORS: Record<string, string> = {
  missing: 'Email et mot de passe requis.',
  invalid: 'Email ou mot de passe incorrect.',
  oauth: 'Compte OAuth — connexion par mot de passe impossible.',
  forbidden: 'Acces reserve aux administrateurs.',
  rate_limited: 'Trop de tentatives. Reessayez dans une minute.',
};

function loginErrorCode(message: string | undefined): string {
  if (message?.startsWith('Compte OAuth')) return 'oauth';
  if (message?.startsWith('Acces reserve')) return 'forbidden';
  return 'invalid';
}

authRoutes.get('/login', (c) => {
  const error = LOGIN_ERRORS[c.req.query('error') ?? ''];
  return c.html(
    <LoginLayout>
      <div class="login-box">
        <h1>RaceUp Dashboard</h1>
        {error && <div class="login-error">{error}</div>}
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

authRoutes.post(
  '/login',
  rateLimit('AUTH_RATE_LIMITER', 'dashboard-login', (c) => c.redirect('/dashboard/login?error=rate_limited')),
  async (c) => {
    const body = await c.req.parseBody();
    const email = String(body['email'] ?? '').toLowerCase().trim();
    const password = String(body['password'] ?? '');

    if (!email || !password) {
      return c.redirect('/dashboard/login?error=missing');
    }

    const result = await authenticateDashboardUser(c, email, password);
    if (!result.success) {
      return c.redirect(`/dashboard/login?error=${loginErrorCode(result.error)}`);
    }

    await createSessionCookie(c, result.userId!, email, result.role!);
    return c.redirect('/dashboard');
  }
);

authRoutes.get('/logout', (c) => {
  clearSessionCookie(c);
  return c.redirect('/dashboard/login');
});

export default authRoutes;
