/**
 * Carga variables de entorno antes del resto de la app.
 *
 * Orden (el último gana):
 *   1. `.env` — base (VPS, Docker, plantillas)
 *   2. `.env.local` — overrides en tu máquina (no usar en VPS salvo que sea completo)
 *   3. `.env.dev` — solo con VOS_ENV=dev
 *
 * En el VPS de producción usá solo `.env` (sin `.env.local`) para evitar CORS/PORT viejos.
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const cwd = process.cwd();
const mode = process.env.VOS_ENV?.trim() || 'local';

function loadEnvFile(name: string, override: boolean): void {
  const path = resolve(cwd, name);
  if (existsSync(path)) {
    config({ path, override });
  }
}

loadEnvFile('.env', false);

if (mode === 'dev') {
  loadEnvFile('.env.dev', true);
} else {
  loadEnvFile('.env.local', true);
}
