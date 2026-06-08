/**
 * Importa ventas históricas desde CSV (export Arándano) al esquema platform.
 * Fechas = columna `fecha` del CSV (día de negocio). Productos = id legacy + inferencia H1 2026.
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, SaleSource } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import {
  ensureH1MenuProducts,
  parseCsvSaleDateTime,
} from './lib/h1-2026-menu';
import { csvRowsToObjects, parseCsv } from './lib/parse-csv';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';
import {
  matchSaleLineToCatalog,
  normalizeProductLabel,
} from './lib/sale-line-product-match';

type SaleRow = {
  id: string;
  fecha: string;
  hora: string;
  total: string;
  metodo_pago: string;
  mesa: string;
  notas: string;
  es_deuda_aporte: string;
  saldo_deuda: string;
  nombre_deuda: string;
};

type LineRow = {
  sale_id: string;
  fecha: string;
  hora: string;
  product_id: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  line_subtotal: string;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const root = process.cwd();
  let salesFile = path.resolve(root, 'prisma/data/ventas-registradas.csv');
  let linesFile = path.resolve(root, 'prisma/data/ventas-lineas-detalle.csv');
  let companyId = SEED_COMPANY_ID;
  let skipExisting = true;
  let force = false;
  let syncMenu = true;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sales-file' && argv[i + 1]) {
      salesFile = path.resolve(argv[++i]);
    } else if (argv[i] === '--lines-file' && argv[i + 1]) {
      linesFile = path.resolve(argv[++i]);
    } else if (argv[i] === '--company-id' && argv[i + 1]) {
      companyId = argv[++i];
    } else if (argv[i] === '--force') {
      force = true;
      skipExisting = false;
    } else if (argv[i] === '--skip-existing') {
      skipExisting = true;
    } else if (argv[i] === '--no-sync-menu') {
      syncMenu = false;
    }
  }
  return { salesFile, linesFile, companyId, skipExisting, force, syncMenu };
}

function buildNotes(row: SaleRow): string | null {
  const parts: string[] = [];
  if (row.notas?.trim()) parts.push(row.notas.trim());
  if (row.es_deuda_aporte?.toLowerCase() === 'si') {
    const debt = row.saldo_deuda?.trim();
    const name = row.nombre_deuda?.trim();
    if (debt || name) {
      parts.push(
        `[APORTE/DEUDA]${name ? ` ${name}:` : ''}${debt ? ` saldo $${debt}` : ''}`.trim(),
      );
    }
  }
  return parts.length ? parts.join(' | ') : null;
}

function lineCostProfit(
  unitCost: Prisma.Decimal,
  qty: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  multiplier: number,
): { costAtSale: Prisma.Decimal; profit: Prisma.Decimal } {
  const mult = new Prisma.Decimal(multiplier);
  const costAtSale = unitCost.mul(qty).mul(mult);
  const revenue = unitPrice.mul(qty);
  return { costAtSale, profit: revenue.sub(costAtSale) };
}

async function main() {
  const { salesFile, linesFile, companyId, skipExisting, force, syncMenu } =
    parseArgs();
  if (!fs.existsSync(salesFile)) throw new Error(`No existe: ${salesFile}`);
  if (!fs.existsSync(linesFile)) throw new Error(`No existe: ${linesFile}`);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const sales = csvRowsToObjects<SaleRow>(
    parseCsv(fs.readFileSync(salesFile, 'utf8')),
  );
  const lines = csvRowsToObjects<LineRow>(
    parseCsv(fs.readFileSync(linesFile, 'utf8')),
  );

  const linesBySale = new Map<string, LineRow[]>();
  for (const line of lines) {
    const sid = line.sale_id?.trim();
    if (!sid) continue;
    const bucket = linesBySale.get(sid) ?? [];
    bucket.push(line);
    linesBySale.set(sid, bucket);
  }

  const salesById = new Map(sales.map((s) => [s.id.trim(), s]));

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new Error(`Empresa ${companyId} no encontrada. Ejecutá db:seed-platform.`);
    }

    if (syncMenu) {
      await ensureH1MenuProducts(prisma, companyId);
    }

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

    let created = 0;
    let skipped = 0;
    let replaced = 0;
    let linesTotal = 0;
    let linesLinked = 0;
    const unmatched = new Map<string, number>();
    const dateMismatches: string[] = [];

    for (const row of sales) {
      const saleId = row.id?.trim();
      if (!saleId) continue;

      const existing = await prisma.sale.findFirst({
        where: { id: saleId, companyId },
        select: { id: true },
      });

      if (existing) {
        if (skipExisting) {
          skipped++;
          continue;
        }
        if (force) {
          await prisma.saleLine.deleteMany({ where: { saleId } });
          await prisma.sale.delete({ where: { id: saleId } });
          replaced++;
        } else {
          skipped++;
          continue;
        }
      }

      const saleLines = linesBySale.get(saleId) ?? [];
      const lineCreates: Prisma.SaleLineCreateWithoutSaleInput[] = [];
      let linesSubtotal = 0;

      for (const line of saleLines) {
        linesTotal++;
        const legacyId = line.product_id?.trim() || null;
        const rawName = line.product_name?.trim() || '(sin nombre)';
        const qty = new Prisma.Decimal(Number(line.quantity || 0));
        const unitPrice = new Prisma.Decimal(Number(line.unit_price || 0));
        const lineSubtotal = Number(line.line_subtotal || 0) || Number(qty.mul(unitPrice));
        linesSubtotal += lineSubtotal;

        const hit = matchSaleLineToCatalog(rawName, nameToId, legacyId);
        const displayName = hit?.productName ?? rawName;
        let productId: string | null = null;
        let costAtSale: Prisma.Decimal | null = null;
        let profit: Prisma.Decimal | null = null;

        if (hit) {
          productId = hit.productId;
          linesLinked++;
          const prod = nameToId.get(normalizeProductLabel(hit.productName));
          if (prod && Number(prod.cost) > 0) {
            const cp = lineCostProfit(
              prod.cost,
              qty,
              unitPrice,
              hit.recipeCostMultiplier,
            );
            costAtSale = cp.costAtSale;
            profit = cp.profit;
          }
        } else {
          unmatched.set(rawName, (unmatched.get(rawName) ?? 0) + 1);
        }

        lineCreates.push({
          ...(productId ? { product: { connect: { id: productId } } } : {}),
          productName: displayName,
          quantity: qty,
          unitPrice,
          costAtSale,
          profit,
        });
      }

      const fecha = row.fecha?.trim() || saleLines[0]?.fecha?.trim();
      const hora = row.hora?.trim() || saleLines[0]?.hora?.trim() || '12';
      if (!fecha) {
        throw new Error(`Venta ${saleId} sin fecha`);
      }

      const saleDate = parseCsvSaleDateTime(fecha, hora);
      const headerTotal = Number(row.total || 0);
      const total =
        headerTotal > 0 ? headerTotal : Math.round(linesSubtotal);

      if (
        headerTotal > 0 &&
        Math.abs(headerTotal - linesSubtotal) > 1 &&
        saleLines.length > 0
      ) {
        dateMismatches.push(
          `${saleId} (${fecha}): total cabecera $${headerTotal} vs líneas $${Math.round(linesSubtotal)}`,
        );
      }

      await prisma.sale.create({
        data: {
          id: saleId,
          companyId,
          saleDate,
          total: new Prisma.Decimal(total),
          paymentMethod: row.metodo_pago?.trim() || null,
          mesa: row.mesa?.trim() || null,
          notes: buildNotes(row),
          source: SaleSource.IMPORT,
          lines: { create: lineCreates },
        },
      });
      created++;
    }

    console.log(
      JSON.stringify(
        {
          companyId,
          salesInFile: sales.length,
          salesCreated: created,
          salesSkipped: skipped,
          salesReplaced: replaced,
          linesTotal,
          linesLinkedToProduct: linesLinked,
          linesUnlinked: linesTotal - linesLinked,
          unmatchedProductNames: [...unmatched.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count })),
          totalHeaderVsLinesDiff: dateMismatches.length,
          totalDiffSamples: dateMismatches.slice(0, 5),
        },
        null,
        2,
      ),
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
