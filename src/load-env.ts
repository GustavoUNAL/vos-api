/**
 * Carga .env.local (default) o .env.dev (VOS_ENV=dev) antes del resto de la app.
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

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
