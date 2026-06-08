/**
 * Elimina permanentemente productos sin costo de producción ni utilidad real
 * (costo ≤ 0 o precio ≤ costo).
 *
 * Uso:
 *   npm run db:purge-zero-economics-products
 *   npm run db:purge-zero-economics-products -- --dry-run
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';

function parseArgs() {
  let companyId = SEED_COMPANY_ID;
  let dryRun = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--company-id=')) {
      companyId = arg.slice('--company-id='.length);
    }
  }
  return { companyId, dryRun };
}

function lacksEconomics(cost: number, price: number): boolean {
  if (!Number.isFinite(cost) || cost <= 0) return true;
  if (!Number.isFinite(price) || price <= cost) return true;
  return false;
}

async function main() {
  const { companyId, dryRun } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const candidates = await prisma.product.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        sku: true,
        cost: true,
        salePrice: true,
        marginPercent: true,
      },
      orderBy: { name: 'asc' },
    });

    const toDelete = candidates.filter((p) =>
      lacksEconomics(Number(p.cost), Number(p.salePrice)),
    );

    if (toDelete.length === 0) {
      console.log(JSON.stringify({ companyId, dryRun, deleted: 0 }, null, 2));
      return;
    }

    for (const p of toDelete) {
      console.log(
        `${dryRun ? '[dry-run] ' : ''}Eliminar: ${p.name} (${p.sku ?? 'sin sku'}) — costo $${Number(p.cost)}, precio $${Number(p.salePrice)}`,
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
          deleted: dryRun ? 0 : toDelete.length,
          wouldDelete: toDelete.length,
          remaining: candidates.length - toDelete.length,
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
