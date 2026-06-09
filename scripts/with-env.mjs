#!/usr/bin/env node
/**
 * Ejecuta un comando con variables de .env.local o .env.dev (VOS_ENV=dev).
 * Uso: node scripts/with-env.mjs prisma migrate deploy
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const mode = process.env.VOS_ENV?.trim() || 'local';
const candidates =
  mode === 'dev' ? ['.env.dev', '.env'] : ['.env.local', '.env'];

for (const name of candidates) {
  const path = resolve(process.cwd(), name);
  if (existsSync(path)) {
    config({ path });
    break;
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node scripts/with-env.mjs <comando...>');
  process.exit(1);
}

const result = spawnSync(args[0], args.slice(1), {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
