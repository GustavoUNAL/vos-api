import { bogotaDayBounds } from '../src/common/bogota-time';
import { createScriptDb, closeScriptDb } from './lib/script-db';

const dateArg = process.argv[2];
if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
  console.error('Uso: ts-node scripts/delete-sales-by-date.ts YYYY-MM-DD');
  process.exit(1);
}

async function main() {
  const db = await createScriptDb();
  try {
    const { from: gte, to: lte } = bogotaDayBounds(dateArg);

    const sales = await db.prisma.sale.findMany({
      where: { saleDate: { gte, lte } },
      select: {
        id: true,
        code: true,
        saleDate: true,
        total: true,
        company: { select: { name: true } },
      },
    });

    console.log(`Ventas ${dateArg} (día Bogotá):`, sales.length);
    for (const s of sales) {
      console.log(
        ` - ${s.code ?? s.id.slice(0, 8)} · ${s.company.name} · ${Number(s.total)}`,
      );
    }

    if (!sales.length) return;

    const ids = sales.map((s) => s.id);
    await db.prisma.saleLine.deleteMany({ where: { saleId: { in: ids } } });
    await db.prisma.shopOrder.updateMany({
      where: { saleId: { in: ids } },
      data: { saleId: null },
    });
    const result = await db.prisma.sale.deleteMany({ where: { id: { in: ids } } });
    console.log('Eliminadas:', result.count);
  } finally {
    await closeScriptDb(db);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
