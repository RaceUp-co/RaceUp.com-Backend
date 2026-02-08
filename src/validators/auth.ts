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
