import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { computeSaleLineCostProfit } from '../src/sales/recipe-sale-line-cost';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';
import {
  matchSaleLineToCatalog,
  normalizeProductLabel,
} from './lib/sale-line-product-match';

/**
 * Enlaza cada `sale_line` al catálogo activo y rellena costo/utilidad.
 *
 * Uso:
 *   npm run db:backfill-sale-lines
 *   npm run db:backfill-sale-lines -- --company-id=seed-arandano-cafe-bar
 */

function parseArgs() {
  let companyId = SEED_COMPANY_ID;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--company-id=')) {
      companyId = arg.slice('--company-id='.length);
    }
  }
  return { companyId };
}

async function main() {
  const { companyId } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const products = await prisma.product.findMany({
      where: { companyId, status: { not: 'ARCHIVED' } },
      select: { id: true, name: true },
    });
    const nameToId = new Map<string, { id: string; name: string }>();
    for (const p of products) {
      nameToId.set(normalizeProductLabel(p.name), p);
    }

    const lines = await prisma.saleLine.findMany({
      where: { sale: { companyId } },
      select: {
        id: true,
        productName: true,
        productId: true,
        quantity: true,
        unitPrice: true,
      },
    });

    let updated = 0;
    let skipped = 0;
    let noRecipe = 0;
    let namesNormalized = 0;

    for (const line of lines) {
      const hit = matchSaleLineToCatalog(line.productName, nameToId);
      if (!hit) {
        skipped++;
        continue;
      }

      const { costAtSale, profit } = await computeSaleLineCostProfit(
        prisma,
        hit.productId,
        line.quantity,
        line.unitPrice,
        hit.recipeCostMultiplier,
      );

      if (costAtSale == null) noRecipe++;

      const canonicalName = hit.productName;
      if (canonicalName !== line.productName.trim()) namesNormalized++;

      await prisma.saleLine.update({
        where: { id: line.id },
        data: {
          productId: hit.productId,
          productName: canonicalName,
          costAtSale,
          profit,
        },
      });
      updated++;
    }

    console.log(
      JSON.stringify(
        {
          companyId,
          updated,
          namesNormalized,
          noRecipeOrCost: noRecipe,
          skippedNoCatalogMatch: skipped,
          totalLines: lines.length,
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
