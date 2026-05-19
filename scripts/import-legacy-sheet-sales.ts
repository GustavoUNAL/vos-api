import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma, SaleSource } from '@prisma/client';
import { matchSaleLineToCatalog, normalizeProductLabel } from './lib/sale-line-product-match';
import {
  closeScriptDb,
  createScriptDb,
  withDbRetry,
} from './lib/script-db';
import { unitRecipeCostCOP } from '../src/sales/recipe-sale-line-cost';

type SheetData = {
  clients: { code: string; name: string }[];
  sales: {
    code: string;
    date: string;
    clientCode: string;
    paymentMethod: string;
    total: number;
    note?: string;
  }[];
  lines: {
    code: string;
    saleCode: string;
    quantity: number;
    product: string;
    unitPrice: number;
  }[];
};

function parseArgs() {
  const argv = process.argv.slice(2);
  let file = path.resolve(process.cwd(), 'prisma/data/legacy-sheet-sales.json');
  let force = false;
  let skipCost = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) file = path.resolve(argv[++i]);
    if (argv[i] === '--force') force = true;
    if (argv[i] === '--with-cost') skipCost = false;
    if (argv[i] === '--skip-cost') skipCost = true;
  }
  return { file, force, skipCost };
}

/** Fecha hoja DD/MM/YYYY (día/mes/año). */
export function parseSheetDate(raw: string): Date {
  const [d, m, y] = raw.trim().split('/').map((x) => parseInt(x, 10));
  if (!d || !m || !y) throw new Error(`Fecha inválida: ${raw}`);
  return new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
}

async function main() {
  const { file, force, skipCost } = parseArgs();
  if (!fs.existsSync(file)) throw new Error(`No existe: ${file}`);

  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SheetData;
  const db = await createScriptDb();
  const { prisma } = db;

  try {
    const products = await withDbRetry('products', () =>
      prisma.product.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      }),
    );

    const nameToId = new Map<string, { id: string; name: string }>();
    for (const p of products) {
      nameToId.set(normalizeProductLabel(p.name), p);
    }

    const unitCostCache = new Map<string, Prisma.Decimal | null>();
    if (!skipCost) {
      console.log('Precalculando costos de receta (puede tardar)…');
      const productIds = [...new Set([...nameToId.values()].map((p) => p.id))];
      for (const productId of productIds) {
        const unitCost = await withDbRetry(`recipe:${productId}`, () =>
          unitRecipeCostCOP(prisma, productId, 1),
        );
        unitCostCache.set(productId, unitCost);
      }
    }

    let clientsCreated = 0;
    let clientsSkipped = 0;
    const clientIdByCode = new Map<string, string>();

    for (const c of data.clients) {
      await withDbRetry(`client:${c.code}`, async () => {
        const existing = await prisma.client.findUnique({
          where: { code: c.code },
        });
        if (existing) {
          clientIdByCode.set(c.code, existing.id);
          if (!force) {
            clientsSkipped++;
            return;
          }
          await prisma.client.update({
            where: { code: c.code },
            data: { name: c.name.trim() },
          });
          return;
        }
        const row = await prisma.client.create({
          data: { code: c.code, name: c.name.trim() },
        });
        clientIdByCode.set(c.code, row.id);
        clientsCreated++;
      });
    }

    let salesCreated = 0;
    let salesSkipped = 0;
    let linesLinked = 0;

    for (const s of data.sales) {
      await withDbRetry(`sale:${s.code}`, async () => {
        const existing = await prisma.sale.findFirst({
          where: { OR: [{ id: s.code }, { code: s.code }] },
          select: { id: true },
        });
        if (existing && !force) {
          salesSkipped++;
          return;
        }
        if (existing && force) {
          await prisma.saleLine.deleteMany({ where: { saleId: existing.id } });
          await prisma.sale.delete({ where: { id: existing.id } });
        }

        const clientId = clientIdByCode.get(s.clientCode);
        if (!clientId) {
          throw new Error(
            `Cliente ${s.clientCode} no encontrado para venta ${s.code}`,
          );
        }

        const saleLines = data.lines.filter((l) => l.saleCode === s.code);
        const lineCreates: Prisma.SaleLineCreateWithoutSaleInput[] = [];

        for (const line of saleLines) {
          const qty = new Prisma.Decimal(line.quantity);
          const unitPrice = new Prisma.Decimal(line.unitPrice);
          const productName = line.product.trim();
          const hit = matchSaleLineToCatalog(productName, nameToId);
          let productId: string | null = null;
          let costAtSale: Prisma.Decimal | null = null;
          let profit: Prisma.Decimal | null = null;

          if (hit) {
            productId = hit.productId;
            linesLinked++;
            if (!skipCost) {
              const unitCost =
                unitCostCache.get(hit.productId) ??
                (await unitRecipeCostCOP(
                  prisma,
                  hit.productId,
                  hit.recipeCostMultiplier,
                ));
              if (unitCost != null) {
                costAtSale = unitCost.mul(qty);
                profit = unitPrice.mul(qty).sub(costAtSale);
              }
            }
          }

          lineCreates.push({
            code: line.code,
            ...(productId ? { product: { connect: { id: productId } } } : {}),
            productName,
            quantity: qty,
            unitPrice,
            costAtSale,
            profit,
          });
        }

        await prisma.sale.create({
          data: {
            id: s.code,
            code: s.code,
            saleDate: parseSheetDate(s.date),
            total: new Prisma.Decimal(s.total),
            paymentMethod: s.paymentMethod,
            notes: s.note?.trim() || null,
            source: SaleSource.MANUAL,
            clientId,
            lines: { create: lineCreates },
          },
        });
        salesCreated++;
      });
    }

    console.log(
      JSON.stringify(
        {
          clientsCreated,
          clientsSkipped,
          salesCreated,
          salesSkipped,
          linesInFile: data.lines.length,
          linesLinkedToProduct: linesLinked,
          skipCost,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeScriptDb(db);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
