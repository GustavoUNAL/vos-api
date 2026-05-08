/**
 * Auditoría: para cada lote, la suma de `purchase_lot_lines.line_total_cop`
 * debe coincidir con `purchase_lots.total_value` (tolerancia 1 COP, igual que la API).
 *
 *   npx ts-node --transpile-only scripts/audit-purchase-lot-line-totals.ts
 *   npx ts-node --transpile-only scripts/audit-purchase-lot-line-totals.ts --json
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { purchaseTotalsWithinTolerance } from '../src/common/purchase-lot-line-math';
import { isMissingPurchaseLotLinesTableError } from '../src/common/prisma-purchase-lot-line-table';

const tolerance = new Prisma.Decimal('1');

type Row = {
  code: string;
  lineCount: number;
  lotTotalCOP: string | null;
  linesSumCOP: string;
  deltaCOP: string;
  ok: boolean;
  note: string | null;
};

async function main() {
  const json = process.argv.includes('--json');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL no está definida.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  let linesTableMissing = false;
  const lots = await prisma.purchaseLot.findMany({
    select: { code: true, totalValue: true },
    orderBy: { code: 'asc' },
  });

  const rows: Row[] = [];

  try {
    for (const lot of lots) {
      let linesSum = new Prisma.Decimal(0);
      let lineCount = 0;
      try {
        const agg = await prisma.purchaseLotLine.aggregate({
          where: { purchaseLotCode: lot.code },
          _sum: { lineTotalCOP: true },
          _count: { _all: true },
        });
        linesSum = agg._sum.lineTotalCOP ?? new Prisma.Decimal(0);
        lineCount = agg._count._all;
      } catch (e) {
        if (isMissingPurchaseLotLinesTableError(e)) {
          linesTableMissing = true;
          rows.push({
            code: lot.code,
            lineCount: 0,
            lotTotalCOP: lot.totalValue?.toFixed(2) ?? null,
            linesSumCOP: '0',
            deltaCOP: '0',
            ok: false,
            note: 'Tabla purchase_lot_lines no existe en esta base.',
          });
          continue;
        }
        throw e;
      }

      const lotTotal =
        lot.totalValue !== null ? new Prisma.Decimal(lot.totalValue) : null;

      let ok = true;
      let note: string | null = null;

      if (lotTotal === null) {
        if (!linesSum.eq(0)) {
          ok = false;
          note = 'Lote sin total_value pero hay líneas con monto > 0.';
        }
      } else if (lineCount === 0) {
        if (!lotTotal.eq(0)) {
          ok = false;
          note = 'Lote con total_value pero sin líneas de comprobante.';
        }
      } else if (!purchaseTotalsWithinTolerance(lotTotal, linesSum, tolerance)) {
        ok = false;
        note = 'Suma de líneas ≠ total_value del lote.';
      }

      const delta = lotTotal !== null ? lotTotal.sub(linesSum) : linesSum.neg();

      rows.push({
        code: lot.code,
        lineCount,
        lotTotalCOP: lotTotal?.toFixed(2) ?? null,
        linesSumCOP: linesSum.toFixed(2),
        deltaCOP: delta.toFixed(2),
        ok,
        note,
      });
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  const mismatches = rows.filter((r) => !r.ok);
  const okCount = rows.filter((r) => r.ok).length;

  if (json) {
    console.log(
      JSON.stringify(
        {
          linesTableMissing,
          lotsAudited: rows.length,
          okCount,
          mismatchCount: mismatches.length,
          rows,
          mismatches,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `Auditoría lote total vs suma líneas comprobante (tolerancia ${tolerance.toFixed()} COP)\n`,
    );
    if (linesTableMissing) {
      console.warn(
        'ADVERTENCIA: tabla purchase_lot_lines ausente; resultados incompletos.\n',
      );
    }
    console.log(
      [
        'Estado'.padEnd(6),
        'Código lote'.padEnd(36),
        'Líneas',
        'total_value lote',
        'Σ line_total',
        'Δ',
      ].join('  '),
    );
    console.log('-'.repeat(100));
    for (const r of rows) {
      const st = r.ok ? 'OK' : 'FALLO';
      console.log(
        [
          st.padEnd(6),
          r.code.padEnd(36),
          String(r.lineCount).padStart(4),
          (r.lotTotalCOP ?? '—').padStart(16),
          r.linesSumCOP.padStart(14),
          r.deltaCOP.padStart(12),
        ].join('  ') + (r.note ? `  (${r.note})` : ''),
      );
    }
    console.log('-'.repeat(100));
    console.log(
      `Resumen: ${okCount}/${rows.length} lotes OK; ${mismatches.length} con desajuste o anomalía.`,
    );
    if (mismatches.length > 0) {
      console.log('\nLotes a revisar:');
      for (const m of mismatches) {
        console.log(`  • ${m.code}  Δ=${m.deltaCOP} COP${m.note ? ` — ${m.note}` : ''}`);
      }
    }
  }

  if (mismatches.length > 0 || linesTableMissing) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
