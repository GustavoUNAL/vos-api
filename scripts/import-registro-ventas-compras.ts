/**
 * Importa comandas y cierres desde registro-ventas-compras.txt (libro Pasto).
 */
import 'dotenv/config';
import * as path from 'node:path';
import { Prisma, SaleSource, StaffShiftStatus } from '@prisma/client';
import { closeScriptDb, createScriptDb } from './lib/script-db';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';
import { loadRegistroFromFile, type ParsedComanda } from './lib/parse-registro-comandas';
import { matchSaleLineToCatalog } from './lib/sale-line-product-match';
import { computeShiftPay } from '../src/platform-staff/staff-shift.math';

const IMPORT_TAG = 'import:registro-comandas-pasto';
const DEFAULT_TXT = path.resolve(
  process.cwd(),
  'prisma/data/registro-ventas-compras.txt',
);

function parseArgs() {
  let file = DEFAULT_TXT;
  let dryRun = false;
  let force = true;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--no-force') force = false;
    else if (argv[i] === '--file' && argv[i + 1]) file = path.resolve(argv[++i]);
  }
  return { file, dryRun, force };
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function saleCode(date: string, customer: string, index: number): string {
  return `COMANDA-${date.replace(/-/g, '')}-${String(index).padStart(3, '0')}-${slugify(customer)}`;
}

function purchaseCode(date: string, customer: string, index: number): string {
  return `COMPRA-${date.replace(/-/g, '')}-${String(index).padStart(3, '0')}-${slugify(customer)}`;
}

function shiftCode(date: string): string {
  return `REGISTRO-SHIFT-${date}`;
}

function saleDateUtc(date: string, hour = 20): Date {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:30:00.000Z`);
}

function parseSchedule(
  date: string,
  schedule: string,
): { startAt: Date; endAt: Date } | null {
  const parts = schedule.split(/\s*[–—-]\s*/);
  if (parts.length !== 2) return null;
  const parseToken = (raw: string) => {
    const s = raw.trim().toLowerCase().replace(/\./g, '');
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    const ampm = m[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  };
  const start = parseToken(parts[0]!);
  const end = parseToken(parts[1]!);
  if (!start || !end) return null;
  const startAt = new Date(
    `${date}T${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}:00.000Z`,
  );
  let endAt = new Date(
    `${date}T${String(end.hour).padStart(2, '0')}:${String(end.minute).padStart(2, '0')}:00.000Z`,
  );
  if (endAt <= startAt) {
    endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { startAt, endAt };
}

async function main() {
  const { file, dryRun, force } = parseArgs();
  const companyId = SEED_COMPANY_ID;
  const parsed = loadRegistroFromFile(file);

  const db = await createScriptDb();
  const { prisma } = db;

  const stats = {
    salesCreated: 0,
    salesUpdated: 0,
    purchasesCreated: 0,
    purchasesUpdated: 0,
    shiftsUpserted: 0,
    skipped: 0,
  };

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new Error('Ejecuta npm run db:seed-platform primero');

    const products = await prisma.product.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true, name: true, cost: true },
    });
    const nameToId = new Map(
      products.map((p) => [
        p.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(),
        { id: p.id, name: p.name },
      ]),
    );

    let staff = await prisma.staffMember.findFirst({
      where: { companyId, name: { equals: 'David', mode: 'insensitive' } },
    });
    if (!staff && !dryRun) {
      staff = await prisma.staffMember.create({
        data: {
          companyId,
          name: 'David',
          defaultHourlyRate: new Prisma.Decimal(9000),
          active: true,
          notes: IMPORT_TAG,
        },
      });
    }

    const sales = parsed.comandas.filter((c) => c.kind === 'sale');
    const purchases = parsed.comandas.filter((c) => c.kind === 'purchase');

    const salesByDate = new Map<string, number>();
    for (const row of sales) {
      const n = (salesByDate.get(row.date) ?? 0) + 1;
      salesByDate.set(row.date, n);
      const saleHour = 14 + ((n - 1) % 10);
      const code = saleCode(row.date, row.customer, n);
      const existing = await prisma.sale.findFirst({ where: { companyId, code } });

      if (existing && !force) {
        stats.skipped++;
        continue;
      }

      const notes = [
        IMPORT_TAG,
        `Comanda: ${row.customer}`,
        row.city ? `Ciudad: ${row.city}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const lineData = row.lines.map((l) => {
        const match = matchSaleLineToCatalog(l.label, nameToId);
        const productId = match?.productId ?? null;
        const productName = match?.productName ?? l.label;
        const unitPrice = l.unitPrice;
        const lineTotal = Math.round(l.lineTotal);
        let costAtSale: Prisma.Decimal | null = null;
        if (productId) {
          const prod = products.find((p) => p.id === productId);
          if (prod && 'cost' in prod) {
            const cost = Number((prod as { cost?: unknown }).cost ?? 0);
            if (cost > 0) costAtSale = new Prisma.Decimal(cost);
          }
        }
        return {
          productId,
          productName,
          quantity: new Prisma.Decimal(l.qty),
          unitPrice: new Prisma.Decimal(unitPrice),
          costAtSale,
          profit:
            costAtSale != null
              ? new Prisma.Decimal(Math.round(lineTotal - Number(costAtSale) * l.qty))
              : null,
        };
      });

      if (dryRun) {
        stats.salesCreated++;
        continue;
      }

      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.saleLine.deleteMany({ where: { saleId: existing.id } });
          await tx.sale.update({
            where: { id: existing.id },
            data: {
              saleDate: saleDateUtc(row.date, saleHour),
              total: new Prisma.Decimal(row.total),
              paymentMethod: row.paymentMethod,
              source: SaleSource.IMPORT,
              notes,
              mesa: row.customer,
            },
          });
          for (const l of lineData) {
            await tx.saleLine.create({ data: { saleId: existing.id, ...l } });
          }
        });
        stats.salesUpdated++;
      } else {
        await prisma.sale.create({
          data: {
            companyId,
            code,
            saleDate: saleDateUtc(row.date, saleHour),
            total: new Prisma.Decimal(row.total),
            paymentMethod: row.paymentMethod,
            source: SaleSource.IMPORT,
            notes,
            mesa: row.customer,
            lines: { create: lineData },
          },
        });
        stats.salesCreated++;
      }
    }

    const purByDate = new Map<string, number>();
    for (const row of purchases) {
      const n = (purByDate.get(row.date) ?? 0) + 1;
      purByDate.set(row.date, n);
      const code = purchaseCode(row.date, row.customer, n);
      const existing = await prisma.purchaseLot.findFirst({
        where: { companyId, code },
      });
      if (existing && !force) {
        stats.skipped++;
        continue;
      }

      const lineName = row.lines.map((l) => `${l.qty}x ${l.label}`).join(', ');
      const notes = `${IMPORT_TAG} · ${row.customer}`;

      if (dryRun) {
        stats.purchasesCreated++;
        continue;
      }

      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.purchaseLotLine.deleteMany({ where: { purchaseLotId: existing.id } });
          await tx.purchaseLot.update({
            where: { id: existing.id },
            data: {
              purchaseDate: saleDateUtc(row.date, 12),
              totalValue: new Prisma.Decimal(row.total),
              itemCount: row.lines.length,
              supplier: row.customer,
              notes,
            },
          });
          for (const [i, l] of row.lines.entries()) {
            await tx.purchaseLotLine.create({
              data: {
                companyId,
                purchaseLotId: existing.id,
                lineName: l.label,
                quantityPurchased: new Prisma.Decimal(l.qty),
                unit: 'und',
                purchaseUnitCostCOP: new Prisma.Decimal(l.unitPrice),
                lineTotalCOP: new Prisma.Decimal(l.lineTotal),
                sortOrder: i,
              },
            });
          }
        });
        stats.purchasesUpdated++;
      } else {
        await prisma.purchaseLot.create({
          data: {
            companyId,
            code,
            name: row.customer,
            purchaseDate: saleDateUtc(row.date, 12),
            supplier: row.customer,
            notes,
            itemCount: row.lines.length,
            totalValue: new Prisma.Decimal(row.total),
            lines: {
              create: row.lines.map((l, i) => ({
                companyId,
                lineName: l.label,
                quantityPurchased: new Prisma.Decimal(l.qty),
                unit: 'und',
                purchaseUnitCostCOP: new Prisma.Decimal(l.unitPrice),
                lineTotalCOP: new Prisma.Decimal(l.lineTotal),
                sortOrder: i,
                lineComment: lineName,
              })),
            },
          },
        });
        stats.purchasesCreated++;
      }
    }

    for (const closure of parsed.closures) {
      if (!closure.schedule || !staff) continue;
      const times = parseSchedule(closure.date, closure.schedule);
      if (!times) continue;
      const code = shiftCode(closure.date);
      const rate = Number(staff.defaultHourlyRate) || 9000;
      const { hoursWorked, totalPayCOP } = computeShiftPay({
        startAt: times.startAt,
        endAt: times.endAt,
        hourlyRateCOP: rate,
      });

      if (dryRun) {
        stats.shiftsUpserted++;
        continue;
      }

      const existing = await prisma.staffShift.findFirst({
        where: { companyId, staffMemberId: staff.id, shiftDate: new Date(`${closure.date}T00:00:00.000Z`) },
      });

      const data = {
        companyId,
        staffMemberId: staff.id,
        shiftDate: new Date(`${closure.date}T00:00:00.000Z`),
        startAt: times.startAt,
        endAt: times.endAt,
        hourlyRateCOP: new Prisma.Decimal(rate),
        hoursWorked: new Prisma.Decimal(hoursWorked.toFixed(4)),
        totalPayCOP: new Prisma.Decimal(totalPayCOP),
        status: StaffShiftStatus.CLOSED,
        notes: [
          IMPORT_TAG,
          closure.comandas != null ? `Comandas: ${closure.comandas}` : null,
          closure.salesCOP != null ? `Ventas libro: $${closure.salesCOP}` : null,
          closure.purchasesCOP != null ? `Compras libro: $${closure.purchasesCOP}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };

      if (existing) {
        await prisma.staffShift.update({ where: { id: existing.id }, data });
      } else {
        await prisma.staffShift.create({ data });
      }
      stats.shiftsUpserted++;
    }

    console.log('Import registro comandas OK', {
      file,
      parsed: {
        comandas: parsed.comandas.length,
        sales: sales.length,
        purchases: purchases.length,
        closures: parsed.closures.length,
      },
      stats,
      dryRun,
    });
  } finally {
    await closeScriptDb(db);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
