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
