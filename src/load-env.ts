/**
 * Carga variables de entorno antes del resto de la app.
 *
 * Convención:
 *   • Producción (VPS, PM2, Docker): solo `.env` — NO usar `.env.local` en el servidor.
 *   • Local (`npm run start:dev`): `.env` (opcional) + `.env.local` (secretos).
 *   • Staging (`VOS_ENV=dev`): `.env` + `.env.dev`.
 *
 * Orden: el último archivo cargado gana sobre el anterior.
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const cwd = process.cwd();
const vosEnv = process.env.VOS_ENV?.trim();
const isProduction =
  process.env.NODE_ENV === 'production' || vosEnv === 'production';

function loadEnvFile(name: string, override: boolean): void {
  const path = resolve(cwd, name);
  if (existsSync(path)) {
    config({ path, override });
  }
}

loadEnvFile('.env', false);

if (isProduction) {
  /* VPS / producción: solo .env */
} else if (vosEnv === 'dev') {
  loadEnvFile('.env.dev', true);
} else {
  loadEnvFile('.env.local', true);
}
