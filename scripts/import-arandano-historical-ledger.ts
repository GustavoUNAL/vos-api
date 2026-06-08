import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import {
  Prisma,
  SaleSource,
  StaffShiftStatus,
} from '@prisma/client';
import { closeScriptDb, createScriptDb } from './lib/script-db';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';

const IMPORT_TAG = 'import:arandano-historical-ledger';
const DEFAULT_XLSX = path.resolve(
  process.cwd(),
  'prisma/data/Arandano_Base_Datos.xlsx',
);

type SaleRow = {
  date: string;
  comandas: number | null;
  salesCOP: number;
  purchasesInlineCOP: number | null;
  grossProfitCOP: number | null;
  observaciones?: string | null;
};

type PurchaseRow = {
  date: string;
  valueCOP: number;
  detail: string;
};

type ShiftRow = {
  date: string;
  employee: string;
  startLabel: string;
  endLabel: string;
  hours: number;
  hourlyRateCOP: number;
  laborCostCOP: number;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  let file = DEFAULT_XLSX;
  let dryRun = false;
  let force = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) file = path.resolve(argv[++i]);
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--no-force') force = false;
  }
  return { file, dryRun, force };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value && 'result' in value) {
    return cellText((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  if (typeof value === 'object' && value && 'text' in value) {
    return String((value as ExcelJS.CellRichTextValue).text ?? '');
  }
  return String(value);
}

function parseSheetDate(value: ExcelJS.CellValue): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const s = cellText(value).trim();
  const [d, m, y] = s.split('/').map((x) => x.trim());
  if (!d || !m || !y) throw new Error(`Fecha inválida: ${s}`);
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseOptionalInt(value: ExcelJS.CellValue): number | null {
  if (value == null || cellText(value).trim() === '') return null;
  const n = Number(cellText(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseRequiredInt(value: ExcelJS.CellValue, label: string): number {
  const n = parseOptionalInt(value);
  if (n == null) throw new Error(`Valor entero requerido (${label}): ${cellText(value)}`);
  return n;
}

function saleCode(date: string): string {
  return `LEDGER-SALE-${date}`;
}

function purchaseCode(date: string): string {
  return `LEDGER-PUR-${date}`;
}

function shiftCode(date: string): string {
  return `LEDGER-SHIFT-${date}`;
}

function saleDateAtNoonUtc(date: string): Date {
  return new Date(`${date}T15:00:00.000Z`);
}

function purchaseDateAtNoonUtc(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

function shiftDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function parseTimeToken(raw: string): { hour: number; minute: number } {
  const s = raw.trim().toLowerCase().replace(/\./g, '');
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) throw new Error(`Hora inválida: ${raw}`);
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function parseShiftStart(date: string, startLabel: string): Date {
  const start = parseTimeToken(startLabel);
  return new Date(
    `${date}T${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}:00.000-05:00`,
  );
}

function isMissingShiftEnd(label: string): boolean {
  const s = label.trim().toLowerCase();
  return (
    !s ||
    s.includes('no registrado') ||
    s.includes('ilegible') ||
    s === '?' ||
    s === '-'
  );
}

function parseShiftTimes(
  date: string,
  startLabel: string,
  endLabel: string,
): { startAt: Date; endAt: Date } {
  const start = parseTimeToken(startLabel);
  const end = parseTimeToken(endLabel);
  const startAt = new Date(
    `${date}T${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}:00.000-05:00`,
  );
  let endAt = new Date(
    `${date}T${String(end.hour).padStart(2, '0')}:${String(end.minute).padStart(2, '0')}:00.000-05:00`,
  );
  if (endAt.getTime() <= startAt.getTime()) {
    endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { startAt, endAt };
}

async function loadWorkbook(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`No existe el archivo: ${file}`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const ventas = wb.getWorksheet('Ventas');
  const compras = wb.getWorksheet('Compras');
  const personal = wb.getWorksheet('Personal');
  if (!ventas || !compras || !personal) {
    throw new Error('El Excel debe tener hojas Ventas, Compras y Personal');
  }

  const sales: SaleRow[] = [];
  ventas.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const dateCell = row.getCell(1).value;
    if (!dateCell || cellText(dateCell).trim() === '') return;
    const date = parseSheetDate(dateCell);
    sales.push({
      date,
      comandas: parseOptionalInt(row.getCell(2).value),
      salesCOP: parseRequiredInt(row.getCell(3).value, `Ventas ${date}`),
      purchasesInlineCOP: parseOptionalInt(row.getCell(4).value),
      grossProfitCOP: parseOptionalInt(row.getCell(5).value),
      observaciones: cellText(row.getCell(6).value).trim() || null,
    });
  });

  const purchases: PurchaseRow[] = [];
  compras.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const dateCell = row.getCell(1).value;
    if (!dateCell || cellText(dateCell).trim() === '') return;
    const date = parseSheetDate(dateCell);
    purchases.push({
      date,
      valueCOP: parseRequiredInt(row.getCell(2).value, `Compra ${date}`),
      detail: cellText(row.getCell(3).value).trim() || 'Compra registrada',
    });
  });

  const shifts: ShiftRow[] = [];
  personal.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const dateCell = row.getCell(1).value;
    if (!dateCell || cellText(dateCell).trim() === '') return;
    const date = parseSheetDate(dateCell);
    shifts.push({
      date,
      employee: cellText(row.getCell(2).value).trim() || 'David',
      startLabel: cellText(row.getCell(3).value).trim(),
      endLabel: cellText(row.getCell(4).value).trim(),
      hours: Number(row.getCell(5).value ?? 0),
      hourlyRateCOP: parseRequiredInt(row.getCell(6).value, `Valor hora ${date}`),
      laborCostCOP: parseRequiredInt(row.getCell(7).value, `Costo laboral ${date}`),
    });
  });

  return { sales, purchases, shifts };
}

function buildSaleNotes(row: SaleRow): string {
  const chunks = [IMPORT_TAG, 'Arandano_Base_Datos.xlsx · Ventas'];
  if (row.comandas != null) chunks.push(`Comandas: ${row.comandas}`);
  else chunks.push('Comandas: no registrado');
  if (row.grossProfitCOP != null) {
    chunks.push(`Utilidad bruta (libro): ${row.grossProfitCOP}`);
  }
  if (row.observaciones) chunks.push(row.observaciones);
  return chunks.join(' · ');
}

async function main() {
  const { file, dryRun, force } = parseArgs();
  const companyId = SEED_COMPANY_ID;
  const { sales, purchases, shifts } = await loadWorkbook(file);

  const db = await createScriptDb();
  const { prisma } = db;

  const stats = {
    salesCreated: 0,
    salesUpdated: 0,
    salesSkipped: 0,
    salesDeleted: 0,
    purchasesCreated: 0,
    purchasesUpdated: 0,
    purchasesDeleted: 0,
    shiftsCreated: 0,
    shiftsUpdated: 0,
    shiftsSkipped: 0,
    staffUpserted: 0,
  };

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new Error(`Empresa ${companyId} no encontrada. Ejecuta npm run db:seed-platform`);
    }

    const employeeName = shifts[0]?.employee ?? 'David';
    const defaultRate = shifts[0]?.hourlyRateCOP ?? 0;

    if (dryRun) {
      stats.staffUpserted = 1;
    } else {
      const existingMember = await prisma.staffMember.findFirst({
        where: {
          companyId,
          name: { equals: employeeName, mode: 'insensitive' },
        },
      });
      if (existingMember) {
        await prisma.staffMember.update({
          where: { id: existingMember.id },
          data: {
            defaultHourlyRate: new Prisma.Decimal(defaultRate),
            active: true,
            notes: `${IMPORT_TAG} · Fuente: Arandano_Base_Datos.xlsx`,
          },
        });
      } else {
        await prisma.staffMember.create({
          data: {
            companyId,
            name: employeeName,
            defaultHourlyRate: new Prisma.Decimal(defaultRate),
            active: true,
            notes: `${IMPORT_TAG} · Fuente: Arandano_Base_Datos.xlsx`,
          },
        });
      }
      stats.staffUpserted = 1;
    }

    const member = dryRun
      ? null
      : await prisma.staffMember.findFirstOrThrow({
          where: {
            companyId,
            name: { equals: employeeName, mode: 'insensitive' },
          },
        });

    if (!dryRun) {
      const staleSales = await prisma.sale.findMany({
        where: {
          companyId,
          OR: [{ code: null }, { NOT: { code: { startsWith: 'LEDGER-SALE-' } } }],
        },
        select: { id: true },
      });
      if (staleSales.length > 0) {
        await prisma.saleLine.deleteMany({
          where: { saleId: { in: staleSales.map((s) => s.id) } },
        });
        await prisma.sale.deleteMany({
          where: { id: { in: staleSales.map((s) => s.id) } },
        });
        stats.salesDeleted = staleSales.length;
      }
    }

    for (const row of sales) {
      const code = saleCode(row.date);
      const existing = await prisma.sale.findFirst({
        where: { companyId, code },
      });

      if (existing && !force) {
        stats.salesSkipped++;
        continue;
      }

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
              saleDate: saleDateAtNoonUtc(row.date),
              total: new Prisma.Decimal(row.salesCOP),
              source: SaleSource.IMPORT,
              notes: buildSaleNotes(row),
            },
          });
          await tx.saleLine.create({
            data: {
              saleId: existing.id,
              productName: 'Registro histórico — ventas del día',
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(row.salesCOP),
            },
          });
        });
        stats.salesUpdated++;
      } else {
        await prisma.sale.create({
          data: {
            companyId,
            code,
            saleDate: saleDateAtNoonUtc(row.date),
            total: new Prisma.Decimal(row.salesCOP),
            source: SaleSource.IMPORT,
            notes: buildSaleNotes(row),
            lines: {
              create: {
                productName: 'Registro histórico — ventas del día',
                quantity: new Prisma.Decimal(1),
                unitPrice: new Prisma.Decimal(row.salesCOP),
              },
            },
          },
        });
        stats.salesCreated++;
      }
    }

    const validPurchaseCodes = new Set(purchases.map((p) => purchaseCode(p.date)));
    if (!dryRun) {
      const stale = await prisma.purchaseLot.findMany({
        where: {
          companyId,
          code: { startsWith: 'LEDGER-PUR-' },
        },
        select: { id: true, code: true },
      });
      for (const lot of stale) {
        if (!validPurchaseCodes.has(lot.code)) {
          await prisma.purchaseLotLine.deleteMany({
            where: { purchaseLotId: lot.id },
          });
          await prisma.purchaseLot.delete({ where: { id: lot.id } });
          stats.purchasesDeleted++;
        }
      }
    }

    for (const row of purchases) {
      const code = purchaseCode(row.date);
      const existing = await prisma.purchaseLot.findFirst({
        where: { companyId, code },
      });
      const notes = `${IMPORT_TAG} · Arandano_Base_Datos.xlsx · Compras · ${row.detail}`;

      if (dryRun) {
        stats.purchasesCreated++;
        continue;
      }

      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.purchaseLotLine.deleteMany({
            where: { purchaseLotId: existing.id },
          });
          await tx.purchaseLot.update({
            where: { id: existing.id },
            data: {
              purchaseDate: purchaseDateAtNoonUtc(row.date),
              totalValue: new Prisma.Decimal(row.valueCOP),
              itemCount: 1,
              name: `Compra ${row.date}`,
              notes,
            },
          });
          await tx.purchaseLotLine.create({
            data: {
              companyId,
              purchaseLotId: existing.id,
              lineName: row.detail,
              quantityPurchased: new Prisma.Decimal(1),
              unit: 'lote',
              purchaseUnitCostCOP: new Prisma.Decimal(row.valueCOP),
              lineTotalCOP: new Prisma.Decimal(row.valueCOP),
              lineComment: notes,
            },
          });
        });
        stats.purchasesUpdated++;
      } else {
        await prisma.purchaseLot.create({
          data: {
            companyId,
            code,
            name: `Compra ${row.date}`,
            purchaseDate: purchaseDateAtNoonUtc(row.date),
            totalValue: new Prisma.Decimal(row.valueCOP),
            itemCount: 1,
            notes,
            lines: {
              create: {
                companyId,
                lineName: row.detail,
                quantityPurchased: new Prisma.Decimal(1),
                unit: 'lote',
                purchaseUnitCostCOP: new Prisma.Decimal(row.valueCOP),
                lineTotalCOP: new Prisma.Decimal(row.valueCOP),
                lineComment: notes,
              },
            },
          },
        });
        stats.purchasesCreated++;
      }
    }

    for (const row of shifts) {
      if (!member) continue;
      const code = shiftCode(row.date);
      const existing = await prisma.staffShift.findFirst({
        where: {
          companyId,
          notes: { contains: code },
        },
      });
      const startAt = isMissingShiftEnd(row.endLabel)
        ? parseShiftStart(row.date, row.startLabel)
        : parseShiftTimes(row.date, row.startLabel, row.endLabel).startAt;
      const endAt = isMissingShiftEnd(row.endLabel)
        ? null
        : parseShiftTimes(row.date, row.startLabel, row.endLabel).endAt;
      const shiftNotes = `${IMPORT_TAG} · ${code} · ${row.startLabel} – ${row.endLabel}`;

      if (existing && !force) {
        stats.shiftsSkipped++;
        continue;
      }

      if (dryRun) {
        stats.shiftsCreated++;
        continue;
      }

      const data = {
        companyId,
        staffMemberId: member.id,
        shiftDate: shiftDateOnly(row.date),
        startAt,
        endAt,
        hourlyRateCOP: new Prisma.Decimal(row.hourlyRateCOP),
        hoursWorked: new Prisma.Decimal(row.hours),
        totalPayCOP: new Prisma.Decimal(row.laborCostCOP),
        status: endAt ? StaffShiftStatus.CLOSED : StaffShiftStatus.OPEN,
        notes: shiftNotes,
      };

      if (existing) {
        await prisma.staffShift.update({ where: { id: existing.id }, data });
        stats.shiftsUpdated++;
      } else {
        await prisma.staffShift.create({ data });
        stats.shiftsCreated++;
      }
    }

    const purchaseByDate = new Map(purchases.map((p) => [p.date, p.valueCOP]));
    const mismatches: string[] = [];
    for (const sale of sales) {
      const sheetPurch = purchaseByDate.get(sale.date);
      if (sheetPurch == null) continue;
      const inline = sale.purchasesInlineCOP ?? sheetPurch;
      if (inline !== sheetPurch) {
        mismatches.push(
          `${sale.date}: Ventas (col. Compras)=${sale.purchasesInlineCOP} vs hoja Compras=${sheetPurch}`,
        );
      }
      const expectedProfit = sale.salesCOP - sheetPurch;
      if (
        sale.grossProfitCOP != null &&
        sale.grossProfitCOP !== expectedProfit
      ) {
        mismatches.push(
          `${sale.date}: Utilidad bruta=${sale.grossProfitCOP} vs esperada=${expectedProfit}`,
        );
      }
    }

    console.log(
      JSON.stringify(
        {
          companyId,
          file,
          dryRun,
          force,
          salesRows: sales.length,
          purchaseRows: purchases.length,
          shiftRows: shifts.length,
          mismatches,
          ...stats,
          totals: {
            salesCOP: sales.reduce((s, r) => s + r.salesCOP, 0),
            purchasesCOP: purchases.reduce((s, r) => s + r.valueCOP, 0),
            laborCOP: shifts.reduce((s, r) => s + r.laborCostCOP, 0),
            davidHours: shifts.reduce((s, r) => s + r.hours, 0),
          },
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
