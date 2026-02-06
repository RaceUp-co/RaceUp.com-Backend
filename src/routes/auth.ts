import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppType } from '../types';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  deleteAccountSchema,
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
  deleteUser,
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  cleanExpiredTokens,
} from '../services/user';
import { authMiddleware } from '../middleware/auth';

const auth = new Hono<AppType>();

// POST /register
auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const existingUser = await getUserByEmail(c.env.DB, email);
  if (existingUser) {
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

  const passwordHash = await hashPassword(password);
  const user = await createUser(c.env.DB, email, passwordHash);

  const accessTokenExpiry = parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10);
  const refreshTokenExpiry = parseInt(c.env.REFRESH_TOKEN_EXPIRY, 10);

  const accessToken = await generateAccessToken(
    user.id,
    user.email,
    c.env.JWT_SECRET,
    accessTokenExpiry
  );

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await hashRefreshToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + refreshTokenExpiry * 1000
  ).toISOString();

  await saveRefreshToken(c.env.DB, user.id, refreshTokenHash, expiresAt);

  return c.json(
    {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
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

  const accessTokenExpiry = parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10);
  const refreshTokenExpiry = parseInt(c.env.REFRESH_TOKEN_EXPIRY, 10);

  const accessToken = await generateAccessToken(
    user.id,
    user.email,
    c.env.JWT_SECRET,
    accessTokenExpiry
  );

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await hashRefreshToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + refreshTokenExpiry * 1000
  ).toISOString();

  await saveRefreshToken(c.env.DB, user.id, refreshTokenHash, expiresAt);

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
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

  // Supprimer l'ancien token (rotation)
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

  const accessTokenExpiry = parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10);
  const refreshTokenExpiry = parseInt(c.env.REFRESH_TOKEN_EXPIRY, 10);

  const newAccessToken = await generateAccessToken(
    user.id,
    user.email,
    c.env.JWT_SECRET,
    accessTokenExpiry
  );

  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = await hashRefreshToken(newRefreshToken);
  const expiresAt = new Date(
    Date.now() + refreshTokenExpiry * 1000
  ).toISOString();

  await saveRefreshToken(c.env.DB, user.id, newRefreshTokenHash, expiresAt);

  return c.json({
    success: true,
    data: {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
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
