/**
 * Alinea categorías PRODUCT del menú con el modelo canónico (5 nombres en español).
 * Migra productos desde categorías legacy, fusiona duplicados por misma clave normalizada
 * (p. ej. `COMIDA` / `Comida`) y elimina huérfanas.
 *
 *   npm run db:align-menu-categories
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { alignMenuProductCategories } from './lib/menu-categories';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await alignMenuProductCategories(prisma);
    console.log('OK: categorías de menú alineadas.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
