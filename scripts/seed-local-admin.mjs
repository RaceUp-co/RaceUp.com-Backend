#!/usr/bin/env node
/**
 * Crée un super_admin dans la D1 locale pour le développement.
 * Utilise exactement les mêmes paramètres que services/password.ts
 *
 * Usage :
 *   node scripts/seed-local-admin.mjs [email] [password] [username]
 *
 * Exemples :
 *   node scripts/seed-local-admin.mjs
 *   node scripts/seed-local-admin.mjs admin@raceup.com MonMotDePasse1! myadmin
 */

import { randomBytes, pbkdf2Sync, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ─── Paramètres (identiques à services/password.ts) ────────────────────────
const PBKDF2_ITERATIONS = 50_000;
const KEY_LENGTH_BYTES  = 32;        // 256 bits
const HASH_ALGORITHM    = 'sha256';

// ─── Arguments CLI ───────────────────────────────────────────────────────────
const email     = (process.argv[2] ?? 'admin@raceup.com').toLowerCase().trim();
const password  = process.argv[3] ?? 'Admin1234!';
const username  = process.argv[4] ?? 'superadmin';

// ─── Génération du hash ───────────────────────────────────────────────────────
const salt         = randomBytes(16);
const key          = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH_BYTES, HASH_ALGORITHM);
const passwordHash = `${salt.toString('hex')}:${key.toString('hex')}`;

const id  = randomUUID();
const now = new Date().toISOString();

// ─── SQL d'insertion ──────────────────────────────────────────────────────────
const sql = `
INSERT OR REPLACE INTO users
  (id, email, password_hash, username, first_name, last_name, auth_provider, role, created_at, updated_at)
VALUES
  ('${id}', '${email}', '${passwordHash}', '${username}', 'Super', 'Admin', 'email', 'super_admin', '${now}', '${now}');
`;

// ─── Exécution via Wrangler ───────────────────────────────────────────────────
const tmpFile = 'tmp-seed-admin.sql';
try {
  writeFileSync(tmpFile, sql);
  execSync(`npx wrangler d1 execute RaceUp-User-Data --local --file=${tmpFile}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  console.log('\nAdmin local créé avec succès :');
  console.log(`  Email    : ${email}`);
  console.log(`  Password : ${password}`);
  console.log(`  Username : ${username}`);
  console.log(`  Role     : super_admin`);
} finally {
  try { unlinkSync(tmpFile); } catch { /* best-effort */ }
}
