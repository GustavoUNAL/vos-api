/**
 * Exporta a Excel (.xlsx) todos los lotes de compra (`purchase_lots`) con detalle en varias hojas.
 *
 *   npx ts-node --transpile-only scripts/export-purchase-lots-xlsx.ts [ruta-salida.xlsx]
 *
 * Por defecto: exports/purchase-lots-YYYY-MM-DD-HHmm.xlsx
 *
 * Requiere DATABASE_URL (p. ej. .env en la raíz del API).
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { categoryDisplayName } from '../src/common/category-display-name';

function decStr(v: { toString(): string } | null | undefined): string {
  if (v == null) return '';
  return v.toString();
}

function iso(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString();
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };
  row.alignment = { vertical: 'middle', wrapText: true };
}

function autoWidth(sheet: ExcelJS.Worksheet, minW = 10, maxW = 48): void {
  sheet.columns.forEach((col) => {
    let max = minW;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      const len =
        v == null
          ? 0
          : typeof v === 'object' && v !== null && 'text' in v
            ? String((v as { text: string }).text).length
            : String(v).length;
      if (len > max) max = Math.min(len + 2, maxW);
    });
    col.width = max;
  });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL no está definida.');
    process.exit(1);
  }

  const arg = process.argv[2];
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(0, 12);
  const defaultName = path.join('exports', `purchase-lots-${stamp}.xlsx`);
  const outPath = path.resolve(process.cwd(), arg ?? defaultName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const lots = await prisma.purchaseLot.findMany({
      orderBy: [{ purchaseDate: 'desc' }, { code: 'asc' }],
      include: {
        purchaseLotLines: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: {
            category: { select: { id: true, name: true } },
            inventoryItem: {
              select: {
                id: true,
                name: true,
                lot: true,
                quantity: true,
                unit: true,
                unitCost: true,
                supplier: true,
                deletedAt: true,
                category: { select: { name: true } },
              },
            },
          },
        },
        inventoryItems: {
          orderBy: { name: 'asc' },
          include: { category: { select: { name: true } } },
        },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'vos-api';
    wb.created = new Date();

    // --- Hoja 0: Leyenda ---
    const leyenda = wb.addWorksheet('0_Leyenda');
    leyenda.addRow(['Exportación de lotes de compra (purchase_lots)']);
    leyenda.addRow(['Generado', new Date().toISOString()]);
    leyenda.addRow([]);
    leyenda.addRow(['Hoja', 'Contenido']);
    leyenda.addRow([
      '1_Resumen_lotes',
      'Una fila por compra/lote: montos, conteos, comparación total comprobante vs suma de líneas.',
    ]);
    leyenda.addRow([
      '2_Lineas_comprobante',
      'Cada línea de factura/comprobante (purchase_lot_lines) con datos del lote y vínculo a inventario.',
    ]);
    leyenda.addRow([
      '3_Inventario_por_lote',
      'Ítems de inventario cuyo campo lot = código del lote (activos y dados de baja).',
    ]);
    leyenda.addRow([
      '4_Control_totales',
      'Validaciones: total_value vs Σ líneas; item_count vs ítems activos en inventario.',
    ]);
    leyenda.addRow([
      '5_Lotes_sin_lineas',
      'Lotes registrados sin filas en purchase_lot_lines (solo comprobante agregado o datos históricos).',
    ]);
    leyenda.getColumn(1).width = 22;
    leyenda.getColumn(2).width = 90;

    // --- Hoja 1: Resumen ---
    const w1 = wb.addWorksheet('1_Resumen_lotes', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const h1 = [
      'Código lote',
      'Nombre lote',
      'Fecha compra (UTC)',
      'Proveedor (lote)',
      'Notas lote',
      '# Líneas comprobante',
      'Suma totales líneas COP',
      'Total comprobante COP (total_value)',
      'Diferencia (total − suma líneas)',
      'item_count (persistido)',
      'Ítems inventario activos (lot=código)',
      'Ítems inventario dados de baja',
      'Suma cantidad activos',
      'trace_modified_at',
      'created_at lote',
      'updated_at lote',
      'id interno (cuid)',
    ];
    w1.addRow(h1);
    styleHeaderRow(w1.getRow(1));

    for (const lot of lots) {
      const lines = lot.purchaseLotLines;
      let sumLines = 0;
      for (const ln of lines) {
        sumLines += Number(ln.lineTotalCOP);
      }
      const totalVal = lot.totalValue != null ? Number(lot.totalValue) : null;
      const diff =
        totalVal != null && lines.length > 0 ? totalVal - sumLines : totalVal != null && lines.length === 0
          ? totalVal
          : null;

      const activeInv = lot.inventoryItems.filter((i) => i.deletedAt == null);
      const deletedInv = lot.inventoryItems.filter((i) => i.deletedAt != null);
      let sumQty = 0;
      for (const i of activeInv) {
        sumQty += Number(i.quantity);
      }

      w1.addRow([
        lot.code,
        lot.name ?? '',
        iso(lot.purchaseDate),
        lot.supplier ?? '',
        lot.notes ?? '',
        lines.length,
        lines.length ? sumLines : '',
        totalVal ?? '',
        diff === null ? '' : diff,
        lot.itemCount,
        activeInv.length,
        deletedInv.length,
        activeInv.length ? sumQty : '',
        iso(lot.traceModifiedAt),
        iso(lot.createdAt),
        iso(lot.updatedAt),
        lot.id,
      ]);
    }
    w1.autoFilter = { from: 'A1', to: { row: 1, column: h1.length } };
    autoWidth(w1);

    // --- Hoja 2: Líneas ---
    const w2 = wb.addWorksheet('2_Lineas_comprobante', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const h2 = [
      'Código lote',
      'Fecha compra lote',
      'Proveedor lote',
      'Id línea',
      'sort_order',
      'Nombre línea',
      'Cantidad comprada',
      'Unidad',
      'Costo unitario COP',
      'Total línea COP',
      'Categoría (línea)',
      'Comentario línea',
      'Id inventario vinculado',
      'Nombre ítem inventario',
      'Cantidad actual inventario',
      'Unidad inventario',
      'Inventario dado de baja',
      'created_at línea',
      'updated_at línea',
    ];
    w2.addRow(h2);
    styleHeaderRow(w2.getRow(1));

    for (const lot of lots) {
      for (const ln of lot.purchaseLotLines) {
        const inv = ln.inventoryItem;
        w2.addRow([
          lot.code,
          iso(lot.purchaseDate),
          lot.supplier ?? '',
          ln.id,
          ln.sortOrder,
          ln.lineName,
          decStr(ln.quantityPurchased),
          ln.unit,
          decStr(ln.purchaseUnitCostCOP),
          decStr(ln.lineTotalCOP),
          ln.category ? categoryDisplayName(ln.category.name) : '',
          ln.lineComment ?? '',
          inv?.id ?? '',
          inv?.name ?? '',
          inv ? decStr(inv.quantity) : '',
          inv?.unit ?? '',
          inv?.deletedAt ? 'Sí' : inv ? 'No' : '',
          iso(ln.createdAt),
          iso(ln.updatedAt),
        ]);
      }
    }
    if (lots.some((l) => l.purchaseLotLines.length > 0)) {
      w2.autoFilter = { from: 'A1', to: { row: 1, column: h2.length } };
    }
    autoWidth(w2);

    // --- Hoja 3: Inventario ---
    const w3 = wb.addWorksheet('3_Inventario_por_lote', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const h3 = [
      'Código lote',
      'Fecha compra lote',
      'Proveedor lote',
      'Id inventario',
      'Nombre',
      'Categoría',
      'Cantidad actual',
      'Unidad',
      'Costo unitario COP',
      'Proveedor (ítem)',
      'Código barras interno',
      'Código trazabilidad producto',
      'Stock mínimo',
      'Dado de baja',
      'created_at',
      'updated_at',
    ];
    w3.addRow(h3);
    styleHeaderRow(w3.getRow(1));

    for (const lot of lots) {
      for (const inv of lot.inventoryItems) {
        w3.addRow([
          lot.code,
          iso(lot.purchaseDate),
          lot.supplier ?? '',
          inv.id,
          inv.name,
          categoryDisplayName(inv.category.name),
          decStr(inv.quantity),
          inv.unit,
          decStr(inv.unitCost),
          inv.supplier ?? '',
          inv.internalBarcode ?? '',
          inv.traceProductCode ?? '',
          inv.minStock != null ? decStr(inv.minStock) : '',
          inv.deletedAt ? 'Sí' : 'No',
          iso(inv.createdAt),
          iso(inv.updatedAt),
        ]);
      }
    }
    if (lots.some((l) => l.inventoryItems.length > 0)) {
      w3.autoFilter = { from: 'A1', to: { row: 1, column: h3.length } };
    }
    autoWidth(w3);

    // --- Hoja 4: Control ---
    const w4 = wb.addWorksheet('4_Control_totales', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const h4 = [
      'Código lote',
      'OK total vs líneas',
      'Total comprobante',
      'Suma líneas',
      '|delta|',
      'OK item_count',
      'item_count',
      'Activos en inventario',
      'Notas',
    ];
    w4.addRow(h4);
    styleHeaderRow(w4.getRow(1));

    for (const lot of lots) {
      const lines = lot.purchaseLotLines;
      let sumLines = 0;
      for (const ln of lines) {
        sumLines += Number(ln.lineTotalCOP);
      }
      const totalVal = lot.totalValue != null ? Number(lot.totalValue) : null;
      let okTotal = '';
      let absDelta = '';
      if (lines.length > 0 && totalVal != null) {
        const d = Math.abs(totalVal - sumLines);
        absDelta = d < 0.005 ? '0' : String(d);
        okTotal = d < 0.005 ? 'Sí' : 'No';
      } else if (lines.length === 0) {
        okTotal = 'N/A sin líneas';
      } else {
        okTotal = 'N/A sin total_value';
      }

      const activeCount = lot.inventoryItems.filter((i) => i.deletedAt == null).length;
      const okItems = lot.itemCount === activeCount ? 'Sí' : 'No';
      let notes = '';
      if (lines.length === 0 && (lot.totalValue != null || lot.itemCount > 0)) {
        notes = 'Lote sin líneas de comprobante; revisar registro manual o importación.';
      }
      if (okTotal === 'No') {
        notes = [notes, 'Totales: ejecutar auditoría / backfill de líneas.'].filter(Boolean).join(' ');
      }
      if (okItems === 'No') {
        notes = [notes, 'item_count desincronizado; puede ejecutarse db:sync-purchase-lot-item-counts.'].filter(Boolean).join(' ');
      }

      w4.addRow([
        lot.code,
        okTotal,
        totalVal ?? '',
        lines.length ? sumLines : '',
        absDelta,
        okItems,
        lot.itemCount,
        activeCount,
        notes,
      ]);
    }
    w4.autoFilter = { from: 'A1', to: { row: 1, column: h4.length } };
    autoWidth(w4);

    // --- Hoja 5: Sin líneas ---
    const w5 = wb.addWorksheet('5_Lotes_sin_lineas', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const h5 = [
      'Código lote',
      'Nombre',
      'Fecha compra',
      'Proveedor',
      'total_value COP',
      'item_count',
      'Notas',
    ];
    w5.addRow(h5);
    styleHeaderRow(w5.getRow(1));

    for (const lot of lots) {
      if (lot.purchaseLotLines.length === 0) {
        w5.addRow([
          lot.code,
          lot.name ?? '',
          iso(lot.purchaseDate),
          lot.supplier ?? '',
          lot.totalValue != null ? decStr(lot.totalValue) : '',
          lot.itemCount,
          lot.notes ?? '',
        ]);
      }
    }
    autoWidth(w5);

    await wb.xlsx.writeFile(outPath);
    console.log(`OK: ${outPath} (${lots.length} lotes)`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
