/**
 * Upsert Cigarrillos $1000 en Arándano y corrige purchaseDate off-by-one (UTC).
 * Uso: npm run db:upsert-cigarrillos
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { bogotaDateKey, bogotaDayBounds } from '../src/common/bogota-time';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const ARANDANO_ID = 'seed-arandano-cafe-bar';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const category = await prisma.productCategory.upsert({
      where: {
        companyId_slug: { companyId: ARANDANO_ID, slug: 'otros' },
      },
      create: {
        companyId: ARANDANO_ID,
        name: 'Otros',
        slug: 'otros',
        sortOrder: 90,
      },
      update: { name: 'Otros', active: true },
    });

    const existing = await prisma.product.findFirst({
      where: {
        companyId: ARANDANO_ID,
        OR: [{ sku: '7001' }, { name: 'Cigarrillos' }],
      },
    });

    const productData = {
      categoryId: category.id,
      name: 'Cigarrillos',
      description: 'Unidad de cigarrillo.',
      salePrice: 1000,
      cost: 700,
      costSource: 'MANUAL' as const,
      status: 'ACTIVE' as const,
      sku: '7001',
    };

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: productData,
      });
      console.log('Cigarrillos actualizado:', existing.id);
    } else {
      const created = await prisma.product.create({
        data: { companyId: ARANDANO_ID, ...productData },
      });
      console.log('Cigarrillos creado:', created.id);
    }

    // Reparar compras guardadas como medianoche UTC (día anterior en Bogotá)
    const lots = await prisma.purchaseLot.findMany({
      select: { id: true, purchaseDate: true, code: true },
    });
    let fixed = 0;
    for (const lot of lots) {
      const iso = lot.purchaseDate.toISOString();
      // Heurística: exactamente 00:00:00.000Z → era date-only mal parseado
      if (!iso.endsWith('T00:00:00.000Z')) continue;
      const utcDay = iso.slice(0, 10);
      const intended = utcDay; // el string enviado era ese día
      const correct = bogotaDayBounds(intended).from;
      if (bogotaDateKey(lot.purchaseDate) === intended) continue;
      await prisma.purchaseLot.update({
        where: { id: lot.id },
        data: { purchaseDate: correct },
      });
      fixed += 1;
    }
    console.log(`Compras reparadas (fecha Bogotá): ${fixed}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
