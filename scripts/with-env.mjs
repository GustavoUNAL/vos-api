#!/usr/bin/env node
/**
 * Ejecuta un comando cargando las mismas variables que src/load-env.ts.
 *
 *   Local:  .env + .env.local
 *   Staging: VOS_ENV=dev → .env + .env.dev
 *   Prod:   NODE_ENV=production → solo .env
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const cwd = process.cwd();
const vosEnv = process.env.VOS_ENV?.trim();
const isProduction =
  process.env.NODE_ENV === 'production' || vosEnv === 'production';

function loadEnvFile(name, override) {
  const path = resolve(cwd, name);
  if (existsSync(path)) {
    config({ path, override });
  }
}

loadEnvFile('.env', false);

if (isProduction) {
  /* solo .env */
} else if (vosEnv === 'dev') {
  loadEnvFile('.env.dev', true);
} else {
  loadEnvFile('.env.local', true);
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
