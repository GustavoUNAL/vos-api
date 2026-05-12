/**
 * Auditoría por lote:
 * - Con líneas en `purchase_lot_lines`: `total_value` vs `sumLineTotalsCOP` (tolerancia 1 COP).
 * - Sin líneas (import / legacy): `total_value` vs Σ inventario activo (`quantity × unit_cost`)
 *   con el mismo `lot` que el código del lote (tolerancia 1 COP); si no hay ítems, el total no es contrastable → OK con nota.
 *
 *   npx ts-node --transpile-only scripts/audit-purchase-lot-line-totals.ts
 *   npx ts-node --transpile-only scripts/audit-purchase-lot-line-totals.ts --json
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import {
  purchaseTotalsWithinTolerance,
  sumLineTotalsCOP,
} from '../src/common/purchase-lot-line-math';
import { isMissingPurchaseLotLinesTableError } from '../src/common/prisma-purchase-lot-line-table';

const tolerance = new Prisma.Decimal('1');

type Row = {
  code: string;
  lineCount: number;
  lotTotalCOP: string | null;
  /** Suma comprobante, o Σ inventario si no hay líneas (referencia para el chequeo). */
  referenceSumCOP: string;
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
    let allLines: Array<{
      purchaseLotCode: string;
      inventoryItemId: string | null;
      quantityPurchased: Prisma.Decimal;
      purchaseUnitCostCOP: Prisma.Decimal;
      lineTotalCOP: Prisma.Decimal;
    }> = [];

    try {
      allLines = await prisma.purchaseLotLine.findMany({
        select: {
          purchaseLotCode: true,
          inventoryItemId: true,
          quantityPurchased: true,
          purchaseUnitCostCOP: true,
          lineTotalCOP: true,
        },
      });
    } catch (e) {
      if (isMissingPurchaseLotLinesTableError(e)) {
        linesTableMissing = true;
      } else {
        throw e;
      }
    }

    const linkedIds = [
      ...new Set(
        allLines
          .map((l) => l.inventoryItemId)
          .filter((id): id is string => !!id),
      ),
    ];
    const invRows =
      linkedIds.length > 0
        ? await prisma.inventory.findMany({
            where: { id: { in: linkedIds } },
            select: { id: true, unitCost: true, deletedAt: true },
          })
        : [];
    const invUnitById = new Map(
      invRows
        .filter((r) => r.deletedAt === null)
        .map((r) => [r.id, r.unitCost] as const),
    );

    const byCode = new Map<
      string,
      Array<{
        quantityPurchased: Prisma.Decimal;
        purchaseUnitCostCOP: Prisma.Decimal;
        lineTotalCOP: Prisma.Decimal;
        inventoryUnitCostCOP?: Prisma.Decimal;
      }>
    >();
    for (const ln of allLines) {
      const c = ln.purchaseLotCode.trim();
      const arr = byCode.get(c) ?? [];
      arr.push({
        quantityPurchased: ln.quantityPurchased,
        purchaseUnitCostCOP: ln.purchaseUnitCostCOP,
        lineTotalCOP: ln.lineTotalCOP,
        inventoryUnitCostCOP: ln.inventoryItemId
          ? invUnitById.get(ln.inventoryItemId)
          : undefined,
      });
      byCode.set(c, arr);
    }

    const invSumByLot = new Map<string, Prisma.Decimal>();
    const invForLots = await prisma.inventory.findMany({
      where: { deletedAt: null, lot: { not: null } },
      select: { lot: true, quantity: true, unitCost: true },
    });
    for (const inv of invForLots) {
      const lc = inv.lot?.trim();
      if (!lc) continue;
      const add = inv.quantity.mul(inv.unitCost);
      invSumByLot.set(lc, (invSumByLot.get(lc) ?? new Prisma.Decimal(0)).add(add));
    }

    for (const lot of lots) {
      let lineCount = 0;

      if (linesTableMissing) {
        rows.push({
          code: lot.code,
          lineCount: 0,
          lotTotalCOP: lot.totalValue?.toFixed(2) ?? null,
          referenceSumCOP: '0',
          deltaCOP: '0',
          ok: false,
          note: 'Tabla purchase_lot_lines no existe en esta base.',
        });
        continue;
      }

      const parts = byCode.get(lot.code.trim()) ?? [];
      lineCount = parts.length;
      const linesSum = sumLineTotalsCOP(parts);
      const invSum = invSumByLot.get(lot.code.trim()) ?? new Prisma.Decimal(0);
      const referenceSum =
        lineCount > 0 ? linesSum : invSum;

      const lotTotal =
        lot.totalValue !== null ? new Prisma.Decimal(lot.totalValue) : null;

      let ok = true;
      let note: string | null = null;

      if (lotTotal === null) {
        if (!linesSum.eq(0)) {
          ok = false;
          note = 'Lote sin total_value pero hay líneas con monto > 0.';
        }
      } else if (lineCount > 0) {
        if (!purchaseTotalsWithinTolerance(lotTotal, linesSum, tolerance)) {
          ok = false;
          note = 'Suma de líneas de comprobante ≠ total_value del lote.';
        }
      } else {
        if (lotTotal.eq(0)) {
          /* ok */
        } else if (invSum.gt(0)) {
          if (!purchaseTotalsWithinTolerance(lotTotal, invSum, tolerance)) {
            ok = false;
            note =
              'Sin comprobante: Σ inventario activo (cantidad×costo) ≠ total_value del lote.';
          } else {
            note =
              'Sin líneas de comprobante; total_value alineado con Σ inventario del lote.';
          }
        } else {
          note =
            'Sin comprobante ni inventario activo enlazado a este lote; total_value no contrastable con stock.';
        }
      }

      const delta =
        lotTotal !== null ? lotTotal.sub(referenceSum) : referenceSum.neg();

      rows.push({
        code: lot.code,
        lineCount,
        lotTotalCOP: lotTotal?.toFixed(2) ?? null,
        referenceSumCOP: referenceSum.toFixed(2),
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
      `Auditoría lote: comprobante o inventario vs total_value (tolerancia ${tolerance.toFixed()} COP)\n`,
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
        'Σ ref.',
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
          r.referenceSumCOP.padStart(14),
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
