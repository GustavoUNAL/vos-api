import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { estimateProductionCostCOP } from '../src/common/estimate-product-cost';
import { pgPoolConfig } from '../src/common/pg-pool-config';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const products = await prisma.product.findMany({
      where: { status: { not: 'ARCHIVED' } },
      include: { category: { select: { slug: true } } },
    });

    let updated = 0;
    for (const product of products) {
      const salePrice = Number(product.salePrice);
      const currentCost = Number(product.cost);
      const estimated = estimateProductionCostCOP(
        salePrice,
        product.category.slug,
      );

      if (currentCost > 0 && product.costSource === 'RECIPE') continue;

      if (currentCost === estimated && product.costSource === 'MANUAL') continue;

      await prisma.product.update({
        where: { id: product.id },
        data: {
          cost: estimated,
          costSource: 'MANUAL',
        },
      });
      updated += 1;
    }

    console.log(
      `Costos de producción estimados: ${updated} productos actualizados (${products.length} en catálogo).`,
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
