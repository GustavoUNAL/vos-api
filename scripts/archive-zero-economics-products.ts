/**
 * Archiva productos sin costo de producción ni utilidad (precio ≤ costo o costo ≤ 0).
 *
 * Uso:
 *   npm run db:archive-zero-cost-products
 *   npm run db:archive-zero-cost-products -- --dry-run
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ProductStatus } from '@prisma/client';
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

async function main() {
  const { companyId, dryRun } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const candidates = await prisma.product.findMany({
      where: {
        companyId,
        status: { not: ProductStatus.ARCHIVED },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        cost: true,
        salePrice: true,
      },
      orderBy: { name: 'asc' },
    });

    const toArchive = candidates.filter((p) => {
      const cost = Number(p.cost);
      const price = Number(p.salePrice);
      if (!Number.isFinite(cost) || cost <= 0) return true;
      if (!Number.isFinite(price) || price <= cost) return true;
      return false;
    });

    if (toArchive.length === 0) {
      console.log('Nada que archivar.');
      return;
    }

    console.log(
      `${dryRun ? '[dry-run] ' : ''}Archivar ${toArchive.length} producto(s):\n`,
    );
    for (const p of toArchive) {
      console.log(
        `  · ${p.name} (${p.sku ?? 'sin sku'}) — costo $${Number(p.cost)}, precio $${Number(p.salePrice)}`,
      );
    }

    if (dryRun) return;

    const result = await prisma.product.updateMany({
      where: { id: { in: toArchive.map((p) => p.id) } },
      data: { status: ProductStatus.ARCHIVED },
    });

    console.log(`\nArchivados: ${result.count}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
