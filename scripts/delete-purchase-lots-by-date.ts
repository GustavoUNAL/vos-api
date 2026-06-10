import { bogotaDayBounds } from '../src/common/bogota-time';
import { createScriptDb, closeScriptDb } from './lib/script-db';

const dateArg = process.argv[2];
if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
  console.error('Uso: ts-node scripts/delete-purchase-lots-by-date.ts YYYY-MM-DD');
  process.exit(1);
}

async function main() {
  const db = await createScriptDb();
  try {
    const { from, to } = bogotaDayBounds(dateArg);

    const lots = await db.prisma.purchaseLot.findMany({
      where: { purchaseDate: { gte: from, lte: to } },
      select: {
        id: true,
        code: true,
        name: true,
        purchaseDate: true,
        totalValue: true,
        company: { select: { name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { purchaseDate: 'asc' },
    });

    console.log(`Compras (lotes) del ${dateArg} (America/Bogota):`, lots.length);
    for (const lot of lots) {
      console.log(
        ` - ${lot.code} · ${lot.name ?? '—'} · ${lot.company.name} · ${lot._count.lines} líneas · ${Number(lot.totalValue ?? 0)}`,
      );
    }

    if (!lots.length) return;

    const ids = lots.map((l) => l.id);
    await db.prisma.inventoryItem.updateMany({
      where: { purchaseLotId: { in: ids } },
      data: { purchaseLotId: null },
    });
    const result = await db.prisma.purchaseLot.deleteMany({
      where: { id: { in: ids } },
    });
    console.log('Lotes eliminados (líneas en cascada):', result.count);
  } finally {
    await closeScriptDb(db);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
