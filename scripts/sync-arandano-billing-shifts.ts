/**
 * Sincroniza turnos de David según cuentas de cobro (detalle abr–may 2026).
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma, StaffShiftStatus } from '@prisma/client';
import { closeScriptDb, createScriptDb } from './lib/script-db';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';
import { computeShiftPay } from '../src/platform-staff/staff-shift.math';

const IMPORT_TAG = 'import:arandano-billing-shifts';
const DEFAULT_JSON = path.resolve(
  process.cwd(),
  'prisma/data/arandano-billing-shifts.json',
);

type ShiftRow = {
  date: string;
  hours: number;
  schedule?: string | null;
  notes?: string;
  salesCOP?: number;
  purchasesCOP?: number;
};

type Payload = {
  staffMember: string;
  hourlyRateCOP: number;
  expectedTotalHours?: number;
  shifts: ShiftRow[];
};

function parseArgs() {
  let companyId = SEED_COMPANY_ID;
  let file = DEFAULT_JSON;
  let dryRun = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--file' && process.argv[i + 1]) {
      file = path.resolve(process.argv[++i]);
    } else if (arg.startsWith('--company-id=')) {
      companyId = arg.slice('--company-id='.length);
    }
  }
  return { companyId, file, dryRun };
}

function shiftCode(date: string): string {
  return `BILLING-SHIFT-${date}`;
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

function parseSchedule(
  date: string,
  schedule: string,
): { startAt: Date; endAt: Date } {
  const parts = schedule.split(/\s*[–—-]\s*/);
  if (parts.length !== 2) {
    throw new Error(`Horario inválido: ${schedule}`);
  }
  const start = parseTimeToken(parts[0]!);
  const end = parseTimeToken(parts[1]!);
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

function defaultWindow(date: string, hours: number): { startAt: Date; endAt: Date } {
  const startAt = new Date(`${date}T15:00:00.000-05:00`);
  const endAt = new Date(startAt.getTime() + hours * 60 * 60 * 1000);
  return { startAt, endAt };
}

function buildNotes(row: ShiftRow): string {
  const chunks = [IMPORT_TAG, shiftCode(row.date)];
  if (row.schedule?.trim()) chunks.push(row.schedule.trim());
  if (row.notes?.trim()) chunks.push(row.notes.trim());
  if (row.salesCOP != null) chunks.push(`Ventas: $${row.salesCOP.toLocaleString('es-CO')}`);
  if (row.purchasesCOP != null) {
    chunks.push(`Compras/gastos: $${row.purchasesCOP.toLocaleString('es-CO')}`);
  }
  return chunks.join(' · ');
}

async function main() {
  const { companyId, file, dryRun } = parseArgs();
  if (!fs.existsSync(file)) throw new Error(`No existe: ${file}`);

  const payload = JSON.parse(fs.readFileSync(file, 'utf8')) as Payload;
  const db = await createScriptDb();
  const { prisma } = db;

  const stats = {
    removedBillingShifts: 0,
    removedLedgerShifts: 0,
    upserted: 0,
    skippedZeroHours: 0,
  };

  try {
    const member = await prisma.staffMember.findFirst({
      where: {
        companyId,
        name: { equals: payload.staffMember, mode: 'insensitive' },
      },
    });
    if (!member) {
      throw new Error(
        `Personal "${payload.staffMember}" no encontrado. Ejecuta npm run db:import-arandano-ledger`,
      );
    }

    const hourlyRate = payload.hourlyRateCOP ?? Number(member.defaultHourlyRate);

    if (!dryRun) {
      const removedBilling = await prisma.staffShift.deleteMany({
        where: { companyId, notes: { contains: IMPORT_TAG } },
      });
      stats.removedBillingShifts = removedBilling.count;

      const removedLedger = await prisma.staffShift.deleteMany({
        where: {
          companyId,
          OR: [
            { notes: { contains: 'import:arandano-historical-ledger' } },
            { notes: { contains: 'LEDGER-SHIFT-' } },
          ],
        },
      });
      stats.removedLedgerShifts = removedLedger.count;
    } else {
      stats.removedBillingShifts = await prisma.staffShift.count({
        where: { companyId, notes: { contains: IMPORT_TAG } },
      });
    }

    let totalHours = 0;
    for (const row of payload.shifts) {
      if (!row.date?.trim()) continue;
      if (!Number.isFinite(row.hours) || row.hours <= 0) {
        stats.skippedZeroHours++;
        continue;
      }

      totalHours += row.hours;

      const { startAt, endAt } = row.schedule?.trim()
        ? parseSchedule(row.date, row.schedule.trim())
        : defaultWindow(row.date, row.hours);

      const { hoursWorked, totalPayCOP } = computeShiftPay({
        startAt,
        endAt,
        hourlyRateCOP: hourlyRate,
        hoursWorkedOverride: row.hours,
      });

      const data = {
        companyId,
        staffMemberId: member.id,
        shiftDate: shiftDateOnly(row.date),
        startAt,
        endAt,
        hourlyRateCOP: new Prisma.Decimal(hourlyRate),
        hoursWorked: new Prisma.Decimal(hoursWorked),
        totalPayCOP: new Prisma.Decimal(totalPayCOP),
        status: StaffShiftStatus.CLOSED,
        notes: buildNotes(row),
      };

      if (dryRun) {
        stats.upserted++;
        continue;
      }

      await prisma.staffShift.create({ data });
      stats.upserted++;
    }

    const roundedTotal = Math.round(totalHours * 10000) / 10000;
    console.log(
      JSON.stringify(
        {
          companyId,
          file,
          dryRun,
          hourlyRateCOP: hourlyRate,
          shiftCount: stats.upserted,
          totalHours: roundedTotal,
          totalHoursLabel: `${Math.floor(roundedTotal)} h ${Math.round((roundedTotal % 1) * 60)} min`,
          expectedTotalHours: payload.expectedTotalHours,
          averageHoursPerShift:
            stats.upserted > 0
              ? Math.round((roundedTotal / stats.upserted) * 100) / 100
              : 0,
          ...stats,
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
