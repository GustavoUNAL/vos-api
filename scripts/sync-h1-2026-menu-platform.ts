/**
 * Sincroniza catálogo y precios H1 2026 (carta comercial Arándano).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { ensureH1MenuProducts, H1_2026_MENU } from './lib/h1-2026-menu';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({
      where: { id: SEED_COMPANY_ID },
    });
    if (!company) {
      throw new Error(`Empresa ${SEED_COMPANY_ID} no encontrada.`);
    }

    const products = await ensureH1MenuProducts(prisma, company.id);
    console.log(
      `Catálogo H1 2026: ${products.size}/${H1_2026_MENU.length} productos activos`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
