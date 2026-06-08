/**
 * Elimina permanentemente productos inactivos o en borrador.
 *
 * Uso:
 *   npm run db:purge-inactive-products
 *   npm run db:purge-inactive-products -- --dry-run
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';

function parseArgs() {
  let companyId = SEED_COMPANY_ID;
  let dryRun = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--company-id=')) {
      companyId = arg.slice('--company-id='.length);
    }
  }
  return { companyId, dryRun };
}

async function main() {
  const { companyId, dryRun } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const products = await prisma.product.findMany({
      where: {
        companyId,
        status: { in: ['INACTIVE', 'DRAFT'] },
      },
      select: { id: true, name: true, sku: true, status: true },
      orderBy: { name: 'asc' },
    });

    if (products.length === 0) {
      console.log(JSON.stringify({ companyId, dryRun, deleted: 0 }, null, 2));
      return;
    }

    for (const p of products) {
      console.log(
        `${dryRun ? '[dry-run] ' : ''}Eliminar: ${p.name} (${p.sku ?? 'sin sku'}) [${p.status}]`,
      );
      if (!dryRun) {
        await prisma.product.delete({ where: { id: p.id } });
      }
    }

    console.log(
      JSON.stringify(
        {
          companyId,
          dryRun,
          deleted: dryRun ? 0 : products.length,
          wouldDelete: products.length,
        },
        null,
        2,
      ),
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
