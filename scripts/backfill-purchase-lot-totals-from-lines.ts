/**
 * Normaliza `purchase_lot_lines.line_total_cop` y alinea `purchase_lots.total_value`
 * con `sumLineTotalsCOP` (histórico comprobante + costo inventario si el comprobante va en cero).
 *
 *   npx ts-node --transpile-only scripts/backfill-purchase-lot-totals-from-lines.ts
 *   npx ts-node --transpile-only scripts/backfill-purchase-lot-totals-from-lines.ts --dry-run
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import {
  lineTotalForPurchaseAggregationCOP,
  purchaseTotalsWithinTolerance,
  sumLineTotalsCOP,
} from '../src/common/purchase-lot-line-math';
import { isMissingPurchaseLotLinesTableError } from '../src/common/prisma-purchase-lot-line-table';

type LineRow = {
  id: string;
  purchaseLotCode: string;
  inventoryItemId: string | null;
  quantityPurchased: Prisma.Decimal;
  purchaseUnitCostCOP: Prisma.Decimal;
  lineTotalCOP: Prisma.Decimal;
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL no está definida.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  let lineRowsUpdated = 0;
  let lotRowsUpdated = 0;

  try {
    let lines: LineRow[];

    try {
      lines = await prisma.purchaseLotLine.findMany({
        select: {
          id: true,
          purchaseLotCode: true,
          inventoryItemId: true,
          quantityPurchased: true,
          purchaseUnitCostCOP: true,
          lineTotalCOP: true,
        },
        orderBy: [{ purchaseLotCode: 'asc' }, { id: 'asc' }],
      });
    } catch (e) {
      if (isMissingPurchaseLotLinesTableError(e)) {
        console.error(
          'Tabla purchase_lot_lines no existe. Ejecute: npm run db:migrate',
        );
        process.exit(1);
      }
      throw e;
    }

    const linkedIds = [
      ...new Set(
        lines.map((l) => l.inventoryItemId).filter((id): id is string => !!id),
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

    for (const ln of lines) {
      const invUC = ln.inventoryItemId
        ? invUnitById.get(ln.inventoryItemId)
        : undefined;
      const next = lineTotalForPurchaseAggregationCOP({
        quantityPurchased: ln.quantityPurchased,
        purchaseUnitCostCOP: ln.purchaseUnitCostCOP,
        lineTotalCOP: ln.lineTotalCOP,
        inventoryUnitCostCOP: invUC,
      });
      if (!next.equals(ln.lineTotalCOP)) {
        lineRowsUpdated += 1;
        if (!dryRun) {
          await prisma.purchaseLotLine.update({
            where: { id: ln.id },
            data: { lineTotalCOP: next },
          });
        }
      }
    }

    const codes = [...new Set(lines.map((l) => l.purchaseLotCode.trim()))];

    for (const code of codes) {
      const lotLines = await prisma.purchaseLotLine.findMany({
        where: { purchaseLotCode: code },
        select: {
          inventoryItemId: true,
          quantityPurchased: true,
          purchaseUnitCostCOP: true,
          lineTotalCOP: true,
        },
      });
      const enriched = lotLines.map((l) => ({
        quantityPurchased: l.quantityPurchased,
        purchaseUnitCostCOP: l.purchaseUnitCostCOP,
        lineTotalCOP: l.lineTotalCOP,
        inventoryUnitCostCOP: l.inventoryItemId
          ? invUnitById.get(l.inventoryItemId)
          : undefined,
      }));
      const sum = sumLineTotalsCOP(enriched);
      const lot = await prisma.purchaseLot.findUnique({
        where: { code },
        select: { totalValue: true },
      });
      const current =
        lot?.totalValue != null ? new Prisma.Decimal(lot.totalValue) : null;
      const needs =
        current === null
          ? true
          : !purchaseTotalsWithinTolerance(sum, current);
      if (needs) {
        lotRowsUpdated += 1;
        if (!dryRun) {
          await prisma.purchaseLot.update({
            where: { code },
            data: { totalValue: sum },
          });
        }
      }
    }

    console.log(
      dryRun
        ? `[dry-run] Líneas a normalizar: ${lineRowsUpdated}; lotes cuyo total_value cambiaría: ${lotRowsUpdated}.`
        : `OK. Líneas actualizadas: ${lineRowsUpdated}; lotes total_value alineados: ${lotRowsUpdated}.`,
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
