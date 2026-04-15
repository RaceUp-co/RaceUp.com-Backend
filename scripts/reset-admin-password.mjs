#!/usr/bin/env node
/**
 * Reinitialise le mot de passe d'un admin dans la D1 DE PROD (--remote).
 *
 * Utilise EXACTEMENT la meme logique que src/services/password.ts :
 *   - PBKDF2-SHA-256, 50 000 iterations, cle 256 bits (32 octets)
 *   - Format stocke : "{salt_hex32}:{hash_hex64}"
 *
 * A executer avec precaution. Demande confirmation interactive.
 *
 * Usage :
 *   node scripts/reset-admin-password.mjs <email> <nouveau_password>
 */

import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/reset-admin-password.mjs <email> <nouveau_password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Mot de passe trop court (min 8 caracteres).');
  process.exit(1);
}

const emailNorm = email.toLowerCase().trim();

const salt = randomBytes(16);
const key = pbkdf2Sync(password, salt, 50_000, 32, 'sha256');
const passwordHash = `${salt.toString('hex')}:${key.toString('hex')}`;
const now = new Date().toISOString();

const sql = `UPDATE users SET password_hash = '${passwordHash}', updated_at = '${now}' WHERE email = '${emailNorm.replace(/'/g, "''")}';`;

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question(
  `\nATTENTION : reset prod du mot de passe pour "${emailNorm}". Confirmer ? [oui/non] `,
  (answer) => {
    rl.close();
    if (answer.trim().toLowerCase() !== 'oui') {
      console.log('Annule.');
      process.exit(0);
    }

    const tmp = 'tmp-reset-admin.sql';
    try {
      writeFileSync(tmp, sql);
      execSync(`npx wrangler d1 execute RaceUp-User-Data --remote --file=${tmp}`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      console.log(`\nMot de passe reinitialise pour ${emailNorm}.`);
    } finally {
      try { unlinkSync(tmp); } catch { /* best-effort */ }
    }
  }
);
