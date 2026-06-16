import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  bogotaDateKey,
  bogotaDayBounds,
  bogotaMonthBounds,
} from '../common/bogota-time';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import type { UpsertCashCloseDto } from './dto/cash-close.dto';

function dayBounds(dateKey: string): { from: Date; to: Date; shiftDate: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException('date debe ser YYYY-MM-DD');
  }
  const { from, to } = bogotaDayBounds(dateKey);
  return { from, to, shiftDate: from };
}

function parseCopToken(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function cashAmountFromPaymentMethod(method: string, saleTotal: number): number {
  const trimmed = method.trim();
  if (!trimmed) return 0;
  const lower = trimmed.toLowerCase();
  if (lower === 'efectivo' || lower === 'cash') return saleTotal;
  const segmentMatch = trimmed.match(/efectivo[^0-9]*([\d.,]+)/i);
  if (segmentMatch?.[1]) return parseCopToken(segmentMatch[1]);
  if (lower.includes('efectivo') && !lower.includes('·') && !lower.includes('|')) {
    return saleTotal;
  }
  return 0;
}

function formatRecord(row: {
  id: string;
  closeDate: Date;
  status: string;
  salesTotalCOP: Prisma.Decimal;
  purchasesTotalCOP: Prisma.Decimal;
  laborTotalCOP: Prisma.Decimal | null;
  expectedCashCOP: Prisma.Decimal | null;
  openingFloatCOP: Prisma.Decimal | null;
  countedCashCOP: Prisma.Decimal | null;
  varianceCOP: Prisma.Decimal | null;
  notes: string | null;
  closedAt: Date | null;
}) {
  return {
    id: row.id,
    closeDate: bogotaDateKey(row.closeDate),
    status: row.status,
    salesTotalCOP: Number(row.salesTotalCOP),
    purchasesTotalCOP: Number(row.purchasesTotalCOP),
    laborTotalCOP:
      row.laborTotalCOP != null ? Number(row.laborTotalCOP) : null,
    expectedCashCOP:
      row.expectedCashCOP != null ? Number(row.expectedCashCOP) : null,
    openingFloatCOP:
      row.openingFloatCOP != null ? Number(row.openingFloatCOP) : null,
    countedCashCOP:
      row.countedCashCOP != null ? Number(row.countedCashCOP) : null,
    varianceCOP: row.varianceCOP != null ? Number(row.varianceCOP) : null,
    notes: row.notes,
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class PlatformCashCloseService {
  constructor(private readonly prisma: PrismaService) {}

  private computeExpectedCash(
    payments: { method: string; totalCOP: number }[],
  ): number {
    return payments.reduce((sum, p) => {
      return sum + cashAmountFromPaymentMethod(p.method, p.totalCOP);
    }, 0);
  }

  async getDailyClose(tenant: TenantContext, dateKey: string) {
    const { from, to, shiftDate } = dayBounds(dateKey);

    const [company, sales, purchases, shifts, record] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: tenant.companyId },
        select: { name: true },
      }),
      this.prisma.sale.findMany({
        where: {
          companyId: tenant.companyId,
          saleDate: { gte: from, lte: to },
        },
        include: {
          lines: { orderBy: { productName: 'asc' } },
        },
        orderBy: { saleDate: 'asc' },
      }),
      this.prisma.purchaseLot.findMany({
        where: {
          companyId: tenant.companyId,
          purchaseDate: { gte: from, lte: to },
        },
        include: { lines: true },
        orderBy: { purchaseDate: 'asc' },
      }),
      this.prisma.staffShift.findMany({
        where: {
          companyId: tenant.companyId,
          shiftDate,
        },
        include: { staffMember: { select: { id: true, name: true } } },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.cashClose.findUnique({
        where: {
          companyId_closeDate: {
            companyId: tenant.companyId,
            closeDate: shiftDate,
          },
        },
      }),
    ]);

    const payments = new Map<string, number>();
    let salesTotal = 0;
    const saleRows = sales.map((s) => {
      const total = Number(s.total);
      salesTotal += total;
      const method = s.paymentMethod?.trim() || 'Sin especificar';
      payments.set(method, (payments.get(method) ?? 0) + total);
      const customerLabel =
        s.customerPhone?.trim() ||
        s.mesa?.trim() ||
        s.notes?.trim() ||
        s.code ||
        'Venta';
      return {
        id: s.id,
        code: s.code,
        customer: customerLabel,
        customerPhone: s.customerPhone,
        mesa: s.mesa,
        notes: s.notes,
        source: s.source,
        saleDate: s.saleDate.toISOString(),
        total,
        paymentMethod: method,
        lineCount: s.lines.length,
        lines: s.lines.map((ln) => ({
          id: ln.id,
          productName: ln.productName,
          quantity: Number(ln.quantity),
          unitPrice: Number(ln.unitPrice),
          lineTotal: Number(ln.quantity) * Number(ln.unitPrice),
          lineUnit: ln.lineUnit,
        })),
      };
    });

    let purchasesTotal = 0;
    const purchaseRows = purchases.map((p) => {
      const total = Number(p.totalValue ?? 0);
      purchasesTotal += total;
      return {
        id: p.id,
        code: p.code,
        name: p.name ?? p.supplier ?? 'Compra',
        purchaseDate: p.purchaseDate.toISOString(),
        total,
        lineCount: p.lines.length,
      };
    });

    const shiftRows = shifts.map((sh) => ({
      id: sh.id,
      staffName: sh.staffMember.name,
      startAt: sh.startAt.toISOString(),
      endAt: sh.endAt?.toISOString() ?? null,
      hoursWorked: sh.hoursWorked != null ? Number(sh.hoursWorked) : null,
      totalPayCOP: sh.totalPayCOP != null ? Number(sh.totalPayCOP) : null,
      notes: sh.notes,
    }));

    const laborTotal = shiftRows.reduce((s, r) => s + (r.totalPayCOP ?? 0), 0);
    const paymentsByMethod = [...payments.entries()].map(([method, totalCOP]) => ({
      method,
      totalCOP,
    }));
    const expectedCashCOP = this.computeExpectedCash(paymentsByMethod);

    return {
      date: dateKey,
      companyName: company?.name ?? '—',
      summary: {
        saleCount: sales.length,
        salesTotalCOP: salesTotal,
        purchaseCount: purchases.length,
        purchasesTotalCOP: purchasesTotal,
        netCOP: salesTotal - purchasesTotal,
        laborTotalCOP: laborTotal,
        shiftCount: shifts.length,
        expectedCashCOP,
      },
      paymentsByMethod,
      sales: saleRows,
      purchases: purchaseRows,
      shifts: shiftRows,
      record: record ? formatRecord(record) : null,
    };
  }

  async getCalendar(tenant: TenantContext, year: number, month: number) {
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new BadRequestException('year/month fuera de rango.');
    }
    const { from: start, to: end } = bogotaMonthBounds(year, month);

    const [sales, records] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          companyId: tenant.companyId,
          saleDate: { gte: start, lt: end },
        },
        select: { saleDate: true, total: true },
      }),
      this.prisma.cashClose.findMany({
        where: {
          companyId: tenant.companyId,
          closeDate: { gte: start, lt: end },
        },
        select: {
          closeDate: true,
          status: true,
          salesTotalCOP: true,
          countedCashCOP: true,
        },
      }),
    ]);

    const byDay = new Map<
      string,
      { salesTotal: number; saleCount: number; status: string | null }
    >();

    for (const row of sales) {
      const day = bogotaDateKey(row.saleDate);
      const prev = byDay.get(day) ?? {
        salesTotal: 0,
        saleCount: 0,
        status: null,
      };
      prev.salesTotal += Number(row.total);
      prev.saleCount += 1;
      byDay.set(day, prev);
    }

    for (const row of records) {
      const day = bogotaDateKey(row.closeDate);
      const prev = byDay.get(day) ?? {
        salesTotal: Number(row.salesTotalCOP),
        saleCount: 0,
        status: null,
      };
      prev.status = row.status;
      byDay.set(day, prev);
    }

    const days = Array.from(byDay.entries())
      .map(([date, agg]) => ({
        date,
        count: agg.saleCount,
        totalCOP: String(Math.round(agg.salesTotal)),
        closeStatus: agg.status,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      year,
      month,
      days,
      totals: {
        count: sales.length,
        totalCOP: days
          .reduce((acc, d) => acc.add(d.totalCOP), new Prisma.Decimal(0))
          .toFixed(0),
        closedDays: records.filter((r) => r.status === 'CLOSED').length,
      },
    };
  }

  async upsertRecord(
    tenant: TenantContext,
    dateKey: string,
    dto: UpsertCashCloseDto,
  ) {
    const daily = await this.getDailyClose(tenant, dateKey);
    const { shiftDate } = dayBounds(dateKey);
    const openingFloat =
      dto.openingFloatCOP != null ? Math.round(dto.openingFloatCOP) : null;
    const countedCash =
      dto.countedCashCOP != null ? Math.round(dto.countedCashCOP) : null;
    const expected =
      (daily.summary.expectedCashCOP ?? 0) + (openingFloat ?? 0);
    const variance =
      countedCash != null ? countedCash - expected : null;

    const existing = await this.prisma.cashClose.findUnique({
      where: {
        companyId_closeDate: {
          companyId: tenant.companyId,
          closeDate: shiftDate,
        },
      },
    });
    if (existing?.status === 'CLOSED') {
      throw new BadRequestException('Este día ya fue cerrado.');
    }

    const row = await this.prisma.cashClose.upsert({
      where: {
        companyId_closeDate: {
          companyId: tenant.companyId,
          closeDate: shiftDate,
        },
      },
      create: {
        companyId: tenant.companyId,
        closeDate: shiftDate,
        status: 'DRAFT',
        salesTotalCOP: new Prisma.Decimal(daily.summary.salesTotalCOP),
        purchasesTotalCOP: new Prisma.Decimal(daily.summary.purchasesTotalCOP),
        laborTotalCOP: new Prisma.Decimal(daily.summary.laborTotalCOP),
        expectedCashCOP: new Prisma.Decimal(expected),
        openingFloatCOP:
          openingFloat != null ? new Prisma.Decimal(openingFloat) : null,
        countedCashCOP:
          countedCash != null ? new Prisma.Decimal(countedCash) : null,
        varianceCOP:
          variance != null ? new Prisma.Decimal(variance) : null,
        notes: dto.notes?.trim() || null,
      },
      update: {
        salesTotalCOP: new Prisma.Decimal(daily.summary.salesTotalCOP),
        purchasesTotalCOP: new Prisma.Decimal(daily.summary.purchasesTotalCOP),
        laborTotalCOP: new Prisma.Decimal(daily.summary.laborTotalCOP),
        expectedCashCOP: new Prisma.Decimal(expected),
        openingFloatCOP:
          openingFloat != null ? new Prisma.Decimal(openingFloat) : null,
        countedCashCOP:
          countedCash != null ? new Prisma.Decimal(countedCash) : null,
        varianceCOP:
          variance != null ? new Prisma.Decimal(variance) : null,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      },
    });

    return {
      ...daily,
      record: formatRecord(row),
    };
  }

  async finalizeRecord(tenant: TenantContext, dateKey: string) {
    const { shiftDate } = dayBounds(dateKey);
    const existing = await this.prisma.cashClose.findUnique({
      where: {
        companyId_closeDate: {
          companyId: tenant.companyId,
          closeDate: shiftDate,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Guardá el arqueo antes de cerrar el día.');
    }
    if (existing.status === 'CLOSED') {
      throw new BadRequestException('Este día ya está cerrado.');
    }
    if (existing.countedCashCOP == null) {
      throw new BadRequestException(
        'Indicá el efectivo contado antes de cerrar la caja.',
      );
    }

    const daily = await this.getDailyClose(tenant, dateKey);
    const row = await this.prisma.cashClose.update({
      where: { id: existing.id },
      data: {
        status: 'CLOSED',
        salesTotalCOP: new Prisma.Decimal(daily.summary.salesTotalCOP),
        purchasesTotalCOP: new Prisma.Decimal(daily.summary.purchasesTotalCOP),
        laborTotalCOP: new Prisma.Decimal(daily.summary.laborTotalCOP),
        closedByUserId: tenant.userId,
        closedAt: new Date(),
      },
    });

    return {
      ...daily,
      record: formatRecord(row),
    };
  }
}
