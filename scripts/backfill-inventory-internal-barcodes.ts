/**
 * Asigna `internal_barcode` (EAN-13 interno) a filas de inventario que aún no lo tienen.
 *
 *   npm run db:backfill-inventory-internal-barcodes
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { generateInternalInventoryEan13 } from '../src/common/inventory-internal-barcode';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const rows = await prisma.inventory.findMany({
      where: { internalBarcode: null },
      select: { id: true },
    });
    let n = 0;
    for (const r of rows) {
      let assigned = '';
      for (let i = 0; i < 40; i++) {
        const tryCode = generateInternalInventoryEan13();
        const hit = await prisma.inventory.findUnique({
          where: { internalBarcode: tryCode },
          select: { id: true },
        });
        if (!hit) {
          assigned = tryCode;
          break;
        }
      }
      if (!assigned) {
        throw new Error(`No se pudo generar código único para inventory ${r.id}`);
      }
      await prisma.inventory.update({
        where: { id: r.id },
        data: { internalBarcode: assigned },
      });
      n++;
    }
    console.log(`OK: ${n} ítem(s) con internal_barcode asignado.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
