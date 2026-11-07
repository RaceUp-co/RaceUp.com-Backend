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
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  changePasswordSchema,
  changeEmailSchema,
  confirmEmailChangeSchema,
  updateProfileSchema,
} from '../validators/auth';
import { hashPassword, verifyPassword } from '../services/password';
import { rateLimit } from '../middleware/rate-limit';
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
  updateUserProfile,
  updateUserPassword,
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  cleanExpiredTokens,
  findOrCreateOAuthUser,
} from '../services/user';
import { verifyGoogleToken, verifyAppleToken } from '../services/oauth';
import { authMiddleware } from '../middleware/auth';
import { setSessionCookie, getSessionCookie, clearSessionCookie } from '../services/cookies';
import {
  isLoginLocked,
  LOGIN_LOCK_MINUTES,
  logSecurityEvent,
  loginFailureDetails,
} from '../services/security';
import {
  applyEmailChange,
  consumeEmailToken,
  countRecentTokens,
  createEmailToken,
  markEmailVerified,
  purgeStaleEmailTokens,
  TOKEN_TTL_HOURS,
} from '../services/email-token';
import {
  asLang,
  notifyAccountDeleted,
  notifyEmailChanged,
  notifyLoginLocked,
  notifyNewUser,
  notifyPasswordChanged,
  sendAccountVerification,
  sendEmailChangeConfirmation,
  sendPasswordReset,
} from '../services/notify';
import { background } from '../utils/background';
import { getClientIP } from '../utils/hash';

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
auth.post('/register', rateLimit('AUTH_RATE_LIMITER', 'register'), zValidator('json', registerSchema), async (c) => {
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

  // Cookie HttpOnly pour persistance de session
  setSessionCookie(c, refreshToken, c.env);

  // Emails envoyes APRES la reponse : l'inscription ne doit pas attendre Resend, et un
  // email en echec ne doit pas transformer une inscription reussie en erreur 500.
  const lang = asLang(c.req.header('Accept-Language')?.slice(0, 2));
  background(
    c,
    (async () => {
      const { token, expiresHours } = await createEmailToken(c.env.DB, user.id, 'email_verification');
      await Promise.all([
        sendAccountVerification(c.env, user, token, expiresHours, lang, 'welcome'),
        notifyNewUser(c.env, user),
      ]);
    })().catch((err) => console.error('register emails failed', err))
  );

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
          email_verified: false,
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
auth.post('/login', rateLimit('AUTH_RATE_LIMITER', 'login'), zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;

  // Verrou anti brute-force par email (meme reponse que le compte existe ou non)
  if (await isLoginLocked(c.env.DB, email)) {
    // Alerte le proprietaire legitime : c'est le seul moment ou il peut apprendre qu'on
    // s'attaque a son compte. L'email ne part que si le compte existe, ce qui reste
    // invisible pour l'attaquant (la reponse HTTP est identique dans les deux cas).
    background(
      c,
      (async () => {
        const locked = await getUserByEmail(c.env.DB, email);
        if (locked?.password_hash) {
          // Aucune preference de langue n'est stockee en base : l'alerte part en francais,
          // langue par defaut du site.
          await notifyLoginLocked(c.env, locked, LOGIN_LOCK_MINUTES, 'fr');
        }
      })().catch((err) => console.error('login lock alert failed', err))
    );
    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Trop de tentatives de connexion. Réessayez dans ${LOGIN_LOCK_MINUTES} minutes.`,
        },
      },
      429
    );
  }

  const user = await getUserByEmail(c.env.DB, email);
  if (!user) {
    // await : l'echec doit etre enregistre avant la reponse (il alimente le verrou)
    await logSecurityEvent(c.env.DB, { event_type: 'login_failed', ip, details: loginFailureDetails(email, 'not found') });
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
    await logSecurityEvent(c.env.DB, { event_type: 'login_failed', user_id: user.id, ip, details: loginFailureDetails(email, 'wrong password') });
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

  // Cookie HttpOnly pour persistance de session
  setSessionCookie(c, refreshToken, c.env);

  logSecurityEvent(c.env.DB, { event_type: 'login_success', user_id: user.id, ip });

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
auth.post('/google', rateLimit('AUTH_RATE_LIMITER', 'oauth'), zValidator('json', googleAuthSchema), async (c) => {
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

  // Cookie HttpOnly pour persistance de session
  setSessionCookie(c, refreshToken, c.env);

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
auth.post('/apple', rateLimit('AUTH_RATE_LIMITER', 'oauth'), zValidator('json', appleAuthSchema), async (c) => {
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

  // Cookie HttpOnly pour persistance de session
  setSessionCookie(c, refreshToken, c.env);

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
        email_verified: Boolean(user.email_verified_at),
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

  // Cookie HttpOnly pour persistance de session
  setSessionCookie(c, refreshToken, c.env);

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

// POST /refresh-session - Rafraîchit la session depuis le cookie (pour persistance)
auth.post('/refresh-session', async (c) => {
  const sessionToken = getSessionCookie(c);

  if (!sessionToken) {
    return c.json(
      {
        success: false,
        error: {
          code: 'NO_SESSION',
          message: 'Aucune session active.',
        },
      },
      401
    );
  }

  const tokenHash = await hashRefreshToken(sessionToken);
  const storedToken = await getRefreshToken(c.env.DB, tokenHash);

  if (!storedToken) {
    clearSessionCookie(c, c.env);
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Session invalide ou expirée.',
        },
      },
      401
    );
  }

  await deleteRefreshToken(c.env.DB, tokenHash);

  const user = await getUserById(c.env.DB, storedToken.user_id);
  if (!user) {
    clearSessionCookie(c, c.env);
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

  // Renouvelle le cookie de session
  setSessionCookie(c, refreshToken, c.env);

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

  // Supprime le cookie de session
  clearSessionCookie(c, c.env);

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
  rateLimit('AUTH_RATE_LIMITER', 'account-delete'),
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

    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;
    // Capture avant suppression : apres le DELETE, l'adresse n'existe plus en base.
    const deleted = { email: user.email, first_name: user.first_name };

    await deleteUser(c.env.DB, user.id);
    logSecurityEvent(c.env.DB, { event_type: 'account_deleted', user_id: user.id, ip, details: `email=${user.email} (self-delete)` });

    background(
      c,
      notifyAccountDeleted(c.env, deleted, asLang(c.req.header('Accept-Language')?.slice(0, 2))).catch((err) =>
        console.error('account deleted email failed', err)
      )
    );

    return c.json({
      success: true,
      data: {
        message: 'Compte supprimé avec succès.',
      },
    });
  }
);


// ============================================================================
//  Verification d'adresse email
// ============================================================================

// POST /verify-email — consomme le jeton recu par email (public : le client n'est pas
// forcement connecte dans le navigateur ou il ouvre son courrier).
auth.post(
  '/verify-email',
  rateLimit('AUTH_RATE_LIMITER', 'verify-email'),
  zValidator('json', verifyEmailSchema),
  async (c) => {
    const { token } = c.req.valid('json');

    const claim = await consumeEmailToken(c.env.DB, token, 'email_verification');
    if (!claim) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Ce lien de confirmation est invalide, expiré ou déjà utilisé. Demandez-en un nouveau.',
          },
        },
        400
      );
    }

    await markEmailVerified(c.env.DB, claim.userId);
    logSecurityEvent(c.env.DB, {
      event_type: 'email_verified',
      user_id: claim.userId,
      ip: getClientIP(c.req.raw.headers),
    });

    // Entretien opportuniste : evite une tache planifiee pour quelques lignes.
    background(c, purgeStaleEmailTokens(c.env.DB).catch(() => {}));

    return c.json({ success: true, data: { message: 'Votre adresse email est confirmée.' } });
  }
);

// POST /verify-email/resend — renvoie un lien. Protege par JWT : on ne renvoie un lien
// qu'au titulaire connecte du compte, jamais sur simple saisie d'une adresse.
auth.post(
  '/verify-email/resend',
  authMiddleware,
  rateLimit('AUTH_RATE_LIMITER', 'verify-resend'),
  zValidator('json', resendVerificationSchema),
  async (c) => {
    const user = await getUserById(c.env.DB, c.get('jwtPayload').sub);
    if (!user) {
      return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' } }, 404);
    }
    if (user.email_verified_at) {
      return c.json({ success: true, data: { message: 'Votre adresse est déjà confirmée.' } });
    }

    // Garde-fou par COMPTE, en complement du rate limit par IP : 3 liens par heure
    // suffisent, et empechent d'utiliser le compte comme relais d'envoi.
    if ((await countRecentTokens(c.env.DB, user.id, 'email_verification', 60)) >= 3) {
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Trop de demandes. Réessayez dans une heure ou vérifiez vos spams.',
          },
        },
        429
      );
    }

    const { lang } = c.req.valid('json');
    const { token, expiresHours } = await createEmailToken(c.env.DB, user.id, 'email_verification');
    background(
      c,
      sendAccountVerification(c.env, user, token, expiresHours, asLang(lang), 'resend').catch((err) =>
        console.error('verification resend failed', err)
      )
    );

    return c.json({ success: true, data: { message: 'Un nouveau lien de confirmation vient de partir.' } });
  }
);

// ============================================================================
//  Mot de passe oublie
// ============================================================================

// POST /forgot-password — public. La reponse est TOUJOURS identique (200), que le compte
// existe ou non : sinon l'endpoint devient un oracle permettant d'enumerer les clients.
auth.post(
  '/forgot-password',
  rateLimit('AUTH_RATE_LIMITER', 'forgot-password'),
  zValidator('json', forgotPasswordSchema),
  async (c) => {
    const { email, lang } = c.req.valid('json');
    const generic = {
      success: true,
      data: {
        message: 'Si un compte existe avec cette adresse, un lien de réinitialisation vient de vous être envoyé.',
      },
    };

    const user = await getUserByEmail(c.env.DB, email);

    // Compte OAuth : aucun mot de passe a reinitialiser. On ne le signale pas ici (meme
    // reponse pour tous) ; le client retrouvera son bouton Google sur la page de connexion.
    if (!user || !user.password_hash) return c.json(generic);

    if ((await countRecentTokens(c.env.DB, user.id, 'password_reset', 60)) >= 3) {
      return c.json(generic);
    }

    const { token, expiresHours } = await createEmailToken(c.env.DB, user.id, 'password_reset');
    background(
      c,
      sendPasswordReset(c.env, user, token, expiresHours, asLang(lang)).catch((err) =>
        console.error('password reset email failed', err)
      )
    );

    return c.json(generic);
  }
);

// POST /reset-password — applique le nouveau mot de passe via le jeton
auth.post(
  '/reset-password',
  rateLimit('AUTH_RATE_LIMITER', 'reset-password'),
  zValidator('json', resetPasswordSchema),
  async (c) => {
    const { token, password } = c.req.valid('json');

    const claim = await consumeEmailToken(c.env.DB, token, 'password_reset');
    if (!claim) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Ce lien de réinitialisation est invalide, expiré ou déjà utilisé. Demandez-en un nouveau.',
          },
        },
        400
      );
    }

    const user = await getUserById(c.env.DB, claim.userId);
    if (!user) {
      return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' } }, 404);
    }

    await updateUserPassword(c.env.DB, user.id, await hashPassword(password));

    // Toutes les sessions sont revoquees : si un attaquant etait connecte, il est ejecte.
    // C'est l'interet principal d'une reinitialisation.
    await deleteUserRefreshTokens(c.env.DB, user.id);
    clearSessionCookie(c, c.env);

    const ip = getClientIP(c.req.raw.headers);
    logSecurityEvent(c.env.DB, {
      event_type: 'password_changed',
      user_id: user.id,
      ip,
      details: 'reset par email',
    });

    background(
      c,
      notifyPasswordChanged(c.env, user, ip, 'fr').catch((err) => console.error('password changed email failed', err))
    );

    return c.json({
      success: true,
      data: { message: 'Mot de passe modifié. Vous pouvez vous connecter avec le nouveau.' },
    });
  }
);

// ============================================================================
//  Parametres du compte (appeles par la page Parametres du front)
// ============================================================================

// PATCH /me — mise a jour du profil
auth.patch('/me', authMiddleware, zValidator('json', updateProfileSchema), async (c) => {
  const user = await getUserById(c.env.DB, c.get('jwtPayload').sub);
  if (!user) {
    return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' } }, 404);
  }

  const data = c.req.valid('json');

  // Le username est unique : on verifie avant d'ecrire pour renvoyer une erreur
  // exploitable par le front plutot qu'une violation de contrainte en 500.
  if (data.username && data.username !== user.username) {
    const taken = await getUserByUsername(c.env.DB, data.username);
    if (taken) {
      return c.json(
        { success: false, error: { code: 'USERNAME_ALREADY_EXISTS', message: "Ce nom d'utilisateur est déjà pris." } },
        409
      );
    }
  }

  await updateUserProfile(c.env.DB, user.id, data);
  const updated = (await getUserById(c.env.DB, user.id)) ?? user;

  return c.json({
    success: true,
    data: {
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        first_name: updated.first_name,
        last_name: updated.last_name,
        birth_date: updated.birth_date,
        role: updated.role,
        email_verified: Boolean(updated.email_verified_at),
        created_at: updated.created_at,
      },
    },
  });
});

// POST /change-password — depuis l'espace client (mot de passe actuel requis)
auth.post(
  '/change-password',
  authMiddleware,
  rateLimit('AUTH_RATE_LIMITER', 'change-password'),
  zValidator('json', changePasswordSchema),
  async (c) => {
    const { current_password, new_password } = c.req.valid('json');

    const user = await getUserById(c.env.DB, c.get('jwtPayload').sub);
    if (!user) {
      return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' } }, 404);
    }

    // Compte OAuth : il n'y a pas de mot de passe a remplacer.
    if (!user.password_hash) {
      return c.json(
        {
          success: false,
          error: {
            code: 'OAUTH_ACCOUNT',
            message: `Ce compte utilise la connexion ${user.auth_provider}. Il n'a pas de mot de passe.`,
          },
        },
        400
      );
    }

    if (!(await verifyPassword(current_password, user.password_hash))) {
      return c.json(
        { success: false, error: { code: 'INVALID_PASSWORD', message: 'Mot de passe actuel incorrect.' } },
        401
      );
    }

    await updateUserPassword(c.env.DB, user.id, await hashPassword(new_password));

    // Les autres sessions sont revoquees, mais la session courante est immediatement
    // renouvelee : l'utilisateur n'est pas deconnecte de l'onglet ou il vient d'agir.
    await deleteUserRefreshTokens(c.env.DB, user.id);
    const { accessToken, refreshToken } = await generateTokensForUser(user, c.env);
    setSessionCookie(c, refreshToken, c.env);

    const ip = getClientIP(c.req.raw.headers);
    logSecurityEvent(c.env.DB, { event_type: 'password_changed', user_id: user.id, ip, details: 'espace client' });

    background(
      c,
      notifyPasswordChanged(c.env, user, ip, 'fr').catch((err) => console.error('password changed email failed', err))
    );

    return c.json({
      success: true,
      data: {
        message: 'Mot de passe modifié.',
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    });
  }
);

// POST /change-email — demande de changement. Rien n'est applique avant que le client
// ait prouve qu'il recoit bien le courrier a la NOUVELLE adresse.
auth.post(
  '/change-email',
  authMiddleware,
  rateLimit('AUTH_RATE_LIMITER', 'change-email'),
  zValidator('json', changeEmailSchema),
  async (c) => {
    const { new_email, password, lang } = c.req.valid('json');

    const user = await getUserById(c.env.DB, c.get('jwtPayload').sub);
    if (!user) {
      return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' } }, 404);
    }
    if (!user.password_hash) {
      return c.json(
        {
          success: false,
          error: {
            code: 'OAUTH_ACCOUNT',
            message: `Ce compte utilise la connexion ${user.auth_provider} : l'adresse est gérée par ce fournisseur.`,
          },
        },
        400
      );
    }
    if (!(await verifyPassword(password, user.password_hash))) {
      return c.json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect.' } }, 401);
    }
    if (new_email === user.email) {
      return c.json(
        { success: false, error: { code: 'SAME_EMAIL', message: 'Cette adresse est déjà celle de votre compte.' } },
        400
      );
    }
    if (await getUserByEmail(c.env.DB, new_email)) {
      return c.json(
        { success: false, error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Un compte avec cet email existe déjà.' } },
        409
      );
    }

    const { token, expiresHours } = await createEmailToken(c.env.DB, user.id, 'email_change', new_email);
    background(
      c,
      sendEmailChangeConfirmation(c.env, user, new_email, token, expiresHours, asLang(lang)).catch((err) =>
        console.error('email change confirmation failed', err)
      )
    );

    return c.json({
      success: true,
      data: {
        message: `Un lien de confirmation vient d'être envoyé à ${new_email}. Votre adresse actuelle reste active jusqu'à la confirmation.`,
      },
    });
  }
);

// POST /change-email/confirm — applique le changement (lien clique dans la nouvelle boite)
auth.post(
  '/change-email/confirm',
  rateLimit('AUTH_RATE_LIMITER', 'confirm-email-change'),
  zValidator('json', confirmEmailChangeSchema),
  async (c) => {
    const { token } = c.req.valid('json');

    const claim = await consumeEmailToken(c.env.DB, token, 'email_change');
    if (!claim?.newEmail) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Ce lien est invalide, expiré ou déjà utilisé. Relancez la demande depuis vos paramètres.',
          },
        },
        400
      );
    }

    const user = await getUserById(c.env.DB, claim.userId);
    if (!user) {
      return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' } }, 404);
    }

    const previousEmail = user.email;
    const applied = await applyEmailChange(c.env.DB, user.id, claim.newEmail);
    if (!applied) {
      return c.json(
        {
          success: false,
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'Cette adresse a été prise entre-temps par un autre compte.',
          },
        },
        409
      );
    }

    // L'email est l'identifiant de connexion : toutes les sessions repartent de zero.
    await deleteUserRefreshTokens(c.env.DB, user.id);
    clearSessionCookie(c, c.env);

    logSecurityEvent(c.env.DB, {
      event_type: 'email_changed',
      user_id: user.id,
      ip: getClientIP(c.req.raw.headers),
      details: `${previousEmail} -> ${claim.newEmail}`,
    });

    // Alerte l'ANCIENNE adresse : si le changement n'est pas legitime, son titulaire
    // l'apprend tant qu'il controle encore cette boite.
    background(
      c,
      notifyEmailChanged(c.env, user, previousEmail, claim.newEmail, 'fr').catch((err) =>
        console.error('email changed alert failed', err)
      )
    );

    return c.json({
      success: true,
      data: {
        message: 'Votre adresse email est mise à jour. Reconnectez-vous avec la nouvelle adresse.',
        email: claim.newEmail,
      },
    });
  }
);

export default auth;
