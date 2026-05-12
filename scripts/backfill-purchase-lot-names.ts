/**
 * Rellena `purchase_lots.name` con título corto: proveedor + fecha ddmmaa (Bogotá) + sufijo del código.
 *
 *   npm run db:backfill-purchase-lot-names
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { formatPurchaseLotShortName } from '../src/common/purchase-lot-display-name';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const rows = await prisma.purchaseLot.findMany({
      select: { id: true, code: true, supplier: true, purchaseDate: true },
    });
    let n = 0;
    for (const r of rows) {
      const name = formatPurchaseLotShortName(r.supplier, r.purchaseDate, {
        lotCode: r.code,
      });
      await prisma.purchaseLot.update({
        where: { id: r.id },
        data: { name },
      });
      n++;
    }
    console.log(`OK: ${n} lote(s) con name actualizado.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
