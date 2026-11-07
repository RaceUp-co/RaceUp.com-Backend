import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .string()
    .email('Email invalide.')
    .transform((val) => val.toLowerCase().trim()),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
    .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères.')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule.')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule.')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre.'),
  username: z
    .string()
    .min(3, 'Le nom d\'utilisateur doit contenir au moins 3 caractères.')
    .max(30, 'Le nom d\'utilisateur ne peut pas dépasser 30 caractères.')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores.'),
  first_name: z
    .string()
    .min(1, 'Le prénom est requis.')
    .max(50, 'Le prénom ne peut pas dépasser 50 caractères.'),
  last_name: z
    .string()
    .min(1, 'Le nom est requis.')
    .max(50, 'Le nom ne peut pas dépasser 50 caractères.'),
  birth_date: z
    .string()
    .optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email('Email invalide.')
    .transform((val) => val.toLowerCase().trim()),
  password: z.string().min(1, 'Le mot de passe est requis.'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Le refresh token est requis.'),
});

export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, 'Le mot de passe est requis pour confirmer la suppression.'),
});

export const googleAuthSchema = z.object({
  access_token: z.string().min(1, 'Le token Google est requis.'),
});

export const appleAuthSchema = z.object({
  id_token: z.string().min(1, "Le token Apple est requis."),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

// ---------- Verification d'email, mot de passe oublie, parametres du compte ----------

// Regle de robustesse du mot de passe, partagee par l'inscription, la reinitialisation
// et le changement de mot de passe : une seule definition a maintenir.
const passwordRule = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères.')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule.')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule.')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre.');

// Jeton email : 32 octets en hexadecimal (cf. services/email-token.ts)
const emailTokenRule = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Lien invalide ou expiré.');

const langRule = z.enum(['fr', 'en']).optional();

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Email invalide.')
    .transform((val) => val.toLowerCase().trim()),
  lang: langRule,
});

export const resetPasswordSchema = z.object({
  token: emailTokenRule,
  password: passwordRule,
});

export const verifyEmailSchema = z.object({
  token: emailTokenRule,
});

export const resendVerificationSchema = z.object({
  lang: langRule,
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Le mot de passe actuel est requis.'),
  new_password: passwordRule,
});

export const changeEmailSchema = z.object({
  new_email: z
    .string()
    .email('Email invalide.')
    .transform((val) => val.toLowerCase().trim()),
  // Confirmation par mot de passe : changer l'adresse de connexion revient a prendre
  // le controle du compte, on ne se contente pas d'un access token valide.
  password: z.string().min(1, 'Le mot de passe est requis.'),
  lang: langRule,
});

export const confirmEmailChangeSchema = z.object({
  token: emailTokenRule,
});

export const updateProfileSchema = z
  .object({
    first_name: z.string().min(1, 'Le prénom est requis.').max(50).optional(),
    last_name: z.string().min(1, 'Le nom est requis.').max(50).optional(),
    username: z
      .string()
      .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères.")
      .max(30, "Le nom d'utilisateur ne peut pas dépasser 30 caractères.")
      .regex(/^[a-zA-Z0-9_-]+$/, "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores.")
      .optional(),
    birth_date: z.string().max(30).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Aucun champ à modifier.' });
