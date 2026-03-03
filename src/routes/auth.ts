import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  deleteAccountSchema,
  googleAuthSchema,
  appleAuthSchema,
} from '../validators/auth';
import { hashPassword, verifyPassword } from '../services/password';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../services/token';
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  deleteUser,
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  cleanExpiredTokens,
  findOrCreateOAuthUser,
} from '../services/user';
import { verifyGoogleToken, verifyAppleToken } from '../services/oauth';
import { authMiddleware } from '../middleware/auth';

const auth = new Hono<AppType>();

// Génère les tokens JWT et refresh pour un utilisateur (réutilisé par plusieurs routes)
async function generateTokensForUser(
  user: { id: string; email: string; username: string },
  env: { JWT_SECRET: string; ACCESS_TOKEN_EXPIRY: string; REFRESH_TOKEN_EXPIRY: string; DB: D1Database }
) {
  const accessTokenExpiry = parseInt(env.ACCESS_TOKEN_EXPIRY, 10);
  const refreshTokenExpiry = parseInt(env.REFRESH_TOKEN_EXPIRY, 10);

  const accessToken = await generateAccessToken(
    user.id,
    user.email,
    user.username,
    env.JWT_SECRET,
    accessTokenExpiry
  );

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await hashRefreshToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + refreshTokenExpiry * 1000
  ).toISOString();

  await saveRefreshToken(env.DB, user.id, refreshTokenHash, expiresAt);

  return { accessToken, refreshToken };
}

// POST /register
auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, username, first_name, last_name, birth_date } = c.req.valid('json');

  const existingEmail = await getUserByEmail(c.env.DB, email);
  if (existingEmail) {
    return c.json(
      {
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Un compte avec cet email existe déjà.',
        },
      },
      409
    );
  }

  const existingUsername = await getUserByUsername(c.env.DB, username);
  if (existingUsername) {
    return c.json(
      {
        success: false,
        error: {
          code: 'USERNAME_ALREADY_EXISTS',
          message: 'Ce nom d\'utilisateur est déjà pris.',
        },
      },
      409
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(
    c.env.DB,
    email,
    passwordHash,
    username,
    first_name,
    last_name,
    birth_date
  );

  const { accessToken, refreshToken } = await generateTokensForUser(user, c.env);

  return c.json(
    {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          created_at: user.created_at,
        },
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    },
    201
  );
});

// POST /login
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await getUserByEmail(c.env.DB, email);
  if (!user) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email ou mot de passe incorrect.',
        },
      },
      401
    );
  }

  // Compte OAuth sans mot de passe
  if (!user.password_hash) {
    return c.json(
      {
        success: false,
        error: {
          code: 'OAUTH_ACCOUNT',
          message: `Ce compte utilise la connexion ${user.auth_provider === 'google' ? 'Google' : user.auth_provider === 'apple' ? 'Apple' : 'sociale'}. Utilisez le bouton correspondant pour vous connecter.`,
        },
      },
      400
    );
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email ou mot de passe incorrect.',
        },
      },
      401
    );
  }

  await cleanExpiredTokens(c.env.DB, user.id);

  const { accessToken, refreshToken } = await generateTokensForUser(user, c.env);

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    },
  });
});

// POST /google - Connexion/inscription via Google
auth.post('/google', zValidator('json', googleAuthSchema), async (c) => {
  const { access_token } = c.req.valid('json');

  const googleUser = await verifyGoogleToken(access_token);
  if (!googleUser) {
    return c.json(
      {
        success: false,
        error: {
          code: 'GOOGLE_AUTH_FAILED',
          message: 'Échec de la vérification Google. Veuillez réessayer.',
        },
      },
      401
    );
  }

  const user = await findOrCreateOAuthUser(
    c.env.DB,
    googleUser.email,
    googleUser.given_name || '',
    googleUser.family_name || '',
    'google'
  );

  const { accessToken, refreshToken } = await generateTokensForUser(user, c.env);

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    },
  });
});

// POST /apple - Connexion/inscription via Apple
auth.post('/apple', zValidator('json', appleAuthSchema), async (c) => {
  const { id_token, first_name, last_name } = c.req.valid('json');

  const applePayload = await verifyAppleToken(id_token, c.env.APPLE_CLIENT_ID);
  if (!applePayload) {
    return c.json(
      {
        success: false,
        error: {
          code: 'APPLE_AUTH_FAILED',
          message: 'Échec de la vérification Apple. Veuillez réessayer.',
        },
      },
      401
    );
  }

  // Apple ne renvoie le nom que lors de la première connexion
  const user = await findOrCreateOAuthUser(
    c.env.DB,
    applePayload.email,
    first_name || '',
    last_name || '',
    'apple'
  );

  const { accessToken, refreshToken } = await generateTokensForUser(user, c.env);

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    },
  });
});

// GET /me (protégé)
auth.get('/me', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) {
    return c.json(
      {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Utilisateur introuvable.',
        },
      },
      404
    );
  }

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        birth_date: user.birth_date,
        role: user.role,
        created_at: user.created_at,
      },
    },
  });
});

// POST /refresh
auth.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  const { refresh_token } = c.req.valid('json');

  const tokenHash = await hashRefreshToken(refresh_token);
  const storedToken = await getRefreshToken(c.env.DB, tokenHash);

  if (!storedToken) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token invalide ou expiré.',
        },
      },
      401
    );
  }

  await deleteRefreshToken(c.env.DB, tokenHash);

  const user = await getUserById(c.env.DB, storedToken.user_id);
  if (!user) {
    return c.json(
      {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Utilisateur introuvable.',
        },
      },
      401
    );
  }

  const { accessToken, refreshToken } = await generateTokensForUser(user, c.env);

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    },
  });
});

// POST /logout (protégé)
auth.post('/logout', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  await deleteUserRefreshTokens(c.env.DB, payload.sub);

  return c.json({
    success: true,
    data: {
      message: 'Déconnecté avec succès.',
    },
  });
});

// DELETE /account (protégé)
auth.delete(
  '/account',
  authMiddleware,
  zValidator('json', deleteAccountSchema),
  async (c) => {
    const payload = c.get('jwtPayload');
    const { password } = c.req.valid('json');

    const user = await getUserById(c.env.DB, payload.sub);
    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Utilisateur introuvable.',
          },
        },
        404
      );
    }

    // Les comptes OAuth n'ont pas de mot de passe - vérification via token suffisante
    if (user.password_hash) {
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return c.json(
          {
            success: false,
            error: {
              code: 'INVALID_PASSWORD',
              message: 'Mot de passe incorrect.',
            },
          },
          401
        );
      }
    }

    await deleteUser(c.env.DB, user.id);

    return c.json({
      success: true,
      data: {
        message: 'Compte supprimé avec succès.',
      },
    });
  }
);

export default auth;
