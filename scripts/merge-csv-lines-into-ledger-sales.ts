/**
 * Fusiona líneas detalladas del CSV en ventas LEDGER del mismo día
 * (misma fecha de negocio) para que el catálogo muestre unidades vendidas
 * sin duplicar cabeceras de venta.
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, SaleSource } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { csvRowsToObjects, parseCsv } from './lib/parse-csv';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';
import {
  matchSaleLineToCatalog,
  normalizeProductLabel,
} from './lib/sale-line-product-match';

type LineRow = {
  sale_id: string;
  fecha: string;
  product_id: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  line_subtotal: string;
};

function parseArgs() {
  let companyId = SEED_COMPANY_ID;
  let linesFile = path.resolve(
    process.cwd(),
    'prisma/data/ventas-lineas-detalle.csv',
  );
  let dryRun = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (argv(i) === '--dry-run') dryRun = true;
    else if (argv(i) === '--company-id' && process.argv[i + 1]) {
      companyId = process.argv[++i];
    } else if (argv(i) === '--lines-file' && process.argv[i + 1]) {
      linesFile = path.resolve(process.argv[++i]);
    }
  }
  return { companyId, linesFile, dryRun };
}

function argv(i: number): string {
  return process.argv[i] ?? '';
}

async function main() {
  const { companyId, linesFile, dryRun } = parseArgs();
  if (!fs.existsSync(linesFile)) throw new Error(`No existe: ${linesFile}`);

  const lines = csvRowsToObjects<LineRow>(
    parseCsv(fs.readFileSync(linesFile, 'utf8')),
  );
  const linesByDate = new Map<string, LineRow[]>();
  for (const line of lines) {
    const date = line.fecha?.trim();
    if (!date) continue;
    const bucket = linesByDate.get(date) ?? [];
    bucket.push(line);
    linesByDate.set(date, bucket);
  }

  const pool = new Pool(pgPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const products = await prisma.product.findMany({
      where: { companyId, status: { not: 'ARCHIVED' } },
      select: { id: true, name: true, cost: true },
    });
    const nameToId = new Map<
      string,
      { id: string; name: string; cost: Prisma.Decimal }
    >();
    for (const p of products) {
      nameToId.set(normalizeProductLabel(p.name), {
        id: p.id,
        name: p.name,
        cost: p.cost,
      });
    }

    const ledgerSales = await prisma.sale.findMany({
      where: { companyId, code: { startsWith: 'LEDGER-SALE-' } },
      select: { id: true, code: true, total: true },
    });

    const stats = {
      mergedDates: 0,
      linesAdded: 0,
      duplicatesRemoved: 0,
      skippedNoCsv: 0,
    };

    for (const sale of ledgerSales) {
      const date = sale.code!.replace('LEDGER-SALE-', '');
      const csvLines = linesByDate.get(date);
      if (!csvLines?.length) {
        stats.skippedNoCsv++;
        continue;
      }

      const lineCreates: Prisma.SaleLineCreateManyInput[] = [];
      let linesSubtotal = 0;

      for (const line of csvLines) {
        const rawName = line.product_name?.trim() || '(sin nombre)';
        const qty = Number(line.quantity || 0);
        const unitPrice = Number(line.unit_price || 0);
        if (qty <= 0) continue;
        linesSubtotal += qty * unitPrice;

        const hit = matchSaleLineToCatalog(rawName, nameToId);
        lineCreates.push({
          saleId: sale.id,
          productId: hit?.productId ?? null,
          productName: hit?.productName ?? rawName,
          quantity: new Prisma.Decimal(qty),
          unitPrice: new Prisma.Decimal(unitPrice),
        });
      }

      const ledgerTotal = Number(sale.total);
      const diff = Math.round(ledgerTotal - linesSubtotal);
      if (diff !== 0 && lineCreates.length > 0) {
        lineCreates.push({
          saleId: sale.id,
          productId: null,
          productName: 'Ajuste registro (libro vs detalle CSV)',
          quantity: new Prisma.Decimal(1),
          unitPrice: new Prisma.Decimal(diff),
        });
      }

      if (dryRun) {
        stats.mergedDates++;
        stats.linesAdded += lineCreates.length;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.saleLine.deleteMany({ where: { saleId: sale.id } });
        if (lineCreates.length) {
          await tx.saleLine.createMany({ data: lineCreates });
        }
      });

      stats.mergedDates++;
      stats.linesAdded += lineCreates.length;
    }

    // Quitar ventas CSV duplicadas en fechas que ya tienen LEDGER.
    const ledgerDates = new Set(
      ledgerSales.map((s) => s.code!.replace('LEDGER-SALE-', '')),
    );
    const duplicateCsvSales = await prisma.sale.findMany({
      where: {
        companyId,
        code: null,
        saleDate: {
          gte: new Date('2020-01-01'),
        },
      },
      select: { id: true, saleDate: true },
    });

    for (const row of duplicateCsvSales) {
      const dateKey = row.saleDate.toISOString().slice(0, 10);
      if (!ledgerDates.has(dateKey)) continue;
      if (dryRun) {
        stats.duplicatesRemoved++;
        continue;
      }
      await prisma.sale.delete({ where: { id: row.id } });
      stats.duplicatesRemoved++;
    }

    console.log(JSON.stringify({ companyId, dryRun, ...stats }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
