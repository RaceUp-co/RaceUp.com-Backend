#!/usr/bin/env node
/**
 * Verifie (sans modifier) qu'un mot de passe est valide pour un admin en prod.
 *
 * Utilise EXACTEMENT la meme logique que src/services/password.ts :
 *   - PBKDF2-SHA-256, 50 000 iterations, cle 256 bits (32 octets)
 *   - Format stocke : "{salt_hex32}:{hash_hex64}"
 *
 * Usage :
 *   node scripts/verify-admin-password.mjs <email> <password>
 *
 * Exemple :
 *   node scripts/verify-admin-password.mjs jacqueslucas.m2101@gmail.com MonMotDePasse
 */

import { pbkdf2Sync } from 'node:crypto';
import { execSync } from 'node:child_process';

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/verify-admin-password.mjs <email> <password>');
  process.exit(1);
}

const emailNorm = email.toLowerCase().trim();

// Recupere le hash stocke en prod
const sql = `SELECT email, password_hash, auth_provider, role FROM users WHERE email = '${emailNorm.replace(/'/g, "''")}' LIMIT 1;`;
const raw = execSync(
  `npx wrangler d1 execute RaceUp-User-Data --remote --json --command "${sql.replace(/"/g, '\\"')}"`,
  { encoding: 'utf8' }
);

let rows;
try {
  const parsed = JSON.parse(raw);
  rows = parsed[0]?.results ?? [];
} catch (e) {
  console.error('Erreur parsing sortie wrangler :', e);
  console.error(raw);
  process.exit(1);
}

if (rows.length === 0) {
  console.error(`Aucun utilisateur trouve pour ${emailNorm}`);
  process.exit(1);
}

const user = rows[0];
console.log(`User trouve : role=${user.role}, auth_provider=${user.auth_provider}`);

if (!user.password_hash) {
  console.log('  => Pas de password_hash (compte OAuth ?)');
  process.exit(1);
}

const [saltHex, hashHex] = user.password_hash.split(':');
if (!saltHex || !hashHex) {
  console.log('  => Format de hash invalide');
  process.exit(1);
}

const salt = Buffer.from(saltHex, 'hex');
const computed = pbkdf2Sync(password, salt, 50_000, 32, 'sha256').toString('hex');

console.log(`Stored hash  : ${hashHex}`);
console.log(`Computed hash: ${computed}`);

if (computed === hashHex) {
  console.log('\nOK — mot de passe VALIDE. Le login devrait fonctionner.');
  process.exit(0);
} else {
  console.log('\nKO — mot de passe INCORRECT pour ce compte.');
  process.exit(2);
}
