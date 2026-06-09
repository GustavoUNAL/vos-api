/**
 * Importa ventas/compras de junio 2026 (01 y 02) con códigos V-0106-* / V-0206-*.
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma, SaleSource, StaffShiftStatus } from '@prisma/client';
import { closeScriptDb, createScriptDb } from './lib/script-db';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';
import { matchSaleLineToCatalog } from './lib/sale-line-product-match';
import { computeShiftPay } from '../src/platform-staff/staff-shift.math';

const IMPORT_TAG = 'import:junio-2026-ledger';
const DATA_FILE = path.resolve(
  process.cwd(),
  'prisma/data/junio-2026-ledger.json',
);

type LedgerLine = { label: string; qty: number; unitPrice: number };
type LedgerSale = {
  code: string;
  date: string;
  customer: string;
  paymentMethod?: string;
  total: number;
  lines: LedgerLine[];
};
type LedgerPurchase = {
  code: string;
  date: string;
  name: string;
  supplier?: string;
  total: number;
  lines: LedgerLine[];
};
type LedgerShift = {
  date: string;
  schedule: string;
  comandas: number;
  salesCOP: number;
  purchasesCOP: number;
};

type LedgerFile = {
  sales: LedgerSale[];
  purchases: LedgerPurchase[];
  shifts: LedgerShift[];
};

function parseArgs() {
  let dryRun = false;
  let replace = true;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
    if (arg === '--no-replace') replace = false;
  }
  return { dryRun, replace };
}

function saleDateUtc(date: string, hour: number): Date {
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

function loadLedger(): LedgerFile {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw) as LedgerFile;
}

async function main() {
  const { dryRun, replace } = parseArgs();
  const ledger = loadLedger();
  const companyId = SEED_COMPANY_ID;
  const db = await createScriptDb();
  const { prisma } = db;

  const stats = {
    salesRemoved: 0,
    salesCreated: 0,
    salesUpdated: 0,
    purchasesRemoved: 0,
    purchasesCreated: 0,
    purchasesUpdated: 0,
    shiftsUpserted: 0,
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

    const juneDates = ['2026-06-01', '2026-06-02'];
    const expectedCodes = new Set([
      ...ledger.sales.map((s) => s.code),
      ...ledger.purchases.map((p) => p.code),
    ]);

    if (replace && !dryRun) {
      const oldSales = await prisma.sale.findMany({
        where: {
          companyId,
          saleDate: {
            gte: new Date('2026-06-01T00:00:00.000Z'),
            lte: new Date('2026-06-02T23:59:59.999Z'),
          },
          OR: [
            { code: { startsWith: 'COMANDA-202606' } },
            { notes: { contains: 'import:registro-comandas-pasto' } },
            { code: { in: [...expectedCodes] } },
          ],
        },
        select: { id: true },
      });
      if (oldSales.length) {
        await prisma.saleLine.deleteMany({
          where: { saleId: { in: oldSales.map((s) => s.id) } },
        });
        await prisma.sale.deleteMany({
          where: { id: { in: oldSales.map((s) => s.id) } },
        });
        stats.salesRemoved = oldSales.length;
      }

      const oldPurchases = await prisma.purchaseLot.findMany({
        where: {
          companyId,
          purchaseDate: {
            gte: new Date('2026-06-01T00:00:00.000Z'),
            lte: new Date('2026-06-02T23:59:59.999Z'),
          },
          OR: [
            { code: { startsWith: 'COMPRA-202606' } },
            { notes: { contains: 'import:registro-comandas-pasto' } },
            { code: { in: [...expectedCodes] } },
          ],
        },
        select: { id: true },
      });
      if (oldPurchases.length) {
        await prisma.purchaseLotLine.deleteMany({
          where: { purchaseLotId: { in: oldPurchases.map((p) => p.id) } },
        });
        await prisma.purchaseLot.deleteMany({
          where: { id: { in: oldPurchases.map((p) => p.id) } },
        });
        stats.purchasesRemoved = oldPurchases.length;
      }
    }

    const salesByDate = new Map<string, number>();
    for (const row of ledger.sales) {
      const n = (salesByDate.get(row.date) ?? 0) + 1;
      salesByDate.set(row.date, n);
      const saleHour = 15 + ((n - 1) % 8);

      const lineData = row.lines.map((l) => {
        const match = matchSaleLineToCatalog(l.label, nameToId);
        const productId = match?.productId ?? null;
        const productName = match?.productName ?? l.label;
        const lineTotal = Math.round(l.qty * l.unitPrice);
        let costAtSale: Prisma.Decimal | null = null;
        if (productId) {
          const prod = products.find((p) => p.id === productId);
          if (prod) {
            const cost = Number(prod.cost ?? 0);
            if (cost > 0) costAtSale = new Prisma.Decimal(cost);
          }
        }
        return {
          productId,
          productName,
          quantity: new Prisma.Decimal(l.qty),
          unitPrice: new Prisma.Decimal(l.unitPrice),
          costAtSale,
          profit:
            costAtSale != null
              ? new Prisma.Decimal(Math.round(lineTotal - Number(costAtSale) * l.qty))
              : null,
        };
      });

      const notes = `${IMPORT_TAG} · Comanda: ${row.customer}`;
      const existing = await prisma.sale.findFirst({
        where: { companyId, code: row.code },
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
              paymentMethod: row.paymentMethod ?? 'Efectivo',
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
            code: row.code,
            saleDate: saleDateUtc(row.date, saleHour),
            total: new Prisma.Decimal(row.total),
            paymentMethod: row.paymentMethod ?? 'Efectivo',
            source: SaleSource.IMPORT,
            notes,
            mesa: row.customer,
            lines: { create: lineData },
          },
        });
        stats.salesCreated++;
      }
    }

    for (const row of ledger.purchases) {
      const existing = await prisma.purchaseLot.findFirst({
        where: { companyId, code: row.code },
      });
      const notes = `${IMPORT_TAG} · ${row.name}`;

      if (dryRun) {
        stats.purchasesCreated++;
        continue;
      }

      const lineRows = row.lines.map((l, i) => ({
        companyId,
        lineName: l.label,
        quantityPurchased: new Prisma.Decimal(l.qty),
        unit: 'und',
        purchaseUnitCostCOP: new Prisma.Decimal(l.unitPrice),
        lineTotalCOP: new Prisma.Decimal(Math.round(l.qty * l.unitPrice)),
        sortOrder: i,
      }));

      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.purchaseLotLine.deleteMany({
            where: { purchaseLotId: existing.id },
          });
          await tx.purchaseLot.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              purchaseDate: saleDateUtc(row.date, 12),
              totalValue: new Prisma.Decimal(row.total),
              itemCount: row.lines.length,
              supplier: row.supplier ?? row.name,
              notes,
            },
          });
          for (const l of lineRows) {
            await tx.purchaseLotLine.create({
              data: { purchaseLotId: existing.id, ...l },
            });
          }
        });
        stats.purchasesUpdated++;
      } else {
        await prisma.purchaseLot.create({
          data: {
            companyId,
            code: row.code,
            name: row.name,
            purchaseDate: saleDateUtc(row.date, 12),
            supplier: row.supplier ?? row.name,
            notes,
            itemCount: row.lines.length,
            totalValue: new Prisma.Decimal(row.total),
            lines: { create: lineRows },
          },
        });
        stats.purchasesCreated++;
      }
    }

    for (const closure of ledger.shifts) {
      if (!staff) continue;
      const times = parseSchedule(closure.date, closure.schedule);
      if (!times) continue;
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
        where: {
          companyId,
          staffMemberId: staff.id,
          shiftDate: new Date(`${closure.date}T00:00:00.000Z`),
        },
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
          `Comandas: ${closure.comandas}`,
          `Ventas libro: $${closure.salesCOP.toLocaleString('es-CO')}`,
          `Compras libro: $${closure.purchasesCOP.toLocaleString('es-CO')}`,
        ].join(' · '),
      };

      if (existing) {
        await prisma.staffShift.update({ where: { id: existing.id }, data });
      } else {
        await prisma.staffShift.create({ data });
      }
      stats.shiftsUpserted++;
    }

    const verify = {
      salesTotal: ledger.sales.reduce((s, r) => s + r.total, 0),
      purchasesTotal: ledger.purchases.reduce((s, r) => s + r.total, 0),
    };

    console.log('Import junio 2026 OK', {
      file: DATA_FILE,
      verify,
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
