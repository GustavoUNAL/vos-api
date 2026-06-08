/**
 * Asegura producto Hervido (cóctel de frutas), sincroniza menú H1 y unifica ventas.
 *
 * Uso:
 *   npm run db:sync-arandano-catalog-sales
 */
import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { closeScriptDb, createScriptDb } from './lib/script-db';
import { estimateProductionCostCOP } from '../src/common/estimate-product-cost';
import { ensureH1MenuProducts } from './lib/h1-2026-menu';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';
import { execSync } from 'node:child_process';

async function main() {
  const companyId = SEED_COMPANY_ID;
  const db = await createScriptDb();
  const { prisma } = db;

  try {
    await ensureH1MenuProducts(prisma, companyId);

    const hervido = await prisma.product.findFirst({
      where: { companyId, sku: '4000' },
      include: { category: { select: { slug: true } } },
    });
    if (!hervido) throw new Error('No se pudo crear el producto Hervido (SKU 4000)');

    const cost =
      Number(hervido.cost) > 0
        ? hervido.cost
        : new Prisma.Decimal(
            estimateProductionCostCOP(
              Number(hervido.salePrice),
              hervido.category.slug,
            ),
          );

    await prisma.product.update({
      where: { id: hervido.id },
      data: {
        name: 'Hervido',
        description: 'Cóctel de frutas cítricas (hervido de temporada).',
        salePrice: new Prisma.Decimal(8000),
        cost,
        costSource: 'MANUAL',
        status: 'ACTIVE',
      },
    });

    const oldHervido = await prisma.product.findFirst({
      where: {
        companyId,
        name: { equals: 'Hervido de fruta de temporada', mode: 'insensitive' },
      },
    });
    if (oldHervido && oldHervido.id !== hervido.id) {
      await prisma.saleLine.updateMany({
        where: { productId: oldHervido.id },
        data: { productId: hervido.id, productName: 'Hervido' },
      });
      await prisma.product.delete({ where: { id: oldHervido.id } });
    }

    console.log(
      JSON.stringify(
        {
          hervido: {
            id: hervido.id,
            cost: Number(cost),
            salePrice: 8000,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await closeScriptDb(db);
  }

  execSync('npm run db:backfill-sale-lines', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  execSync('npm run db:sync-arandano-billing-shifts', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
