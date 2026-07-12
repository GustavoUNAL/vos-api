import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  bogotaDateKey,
  bogotaDayBounds,
  bogotaMonthBounds,
  isPastAutoCloseTime,
} from '../common/bogota-time';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import type { UpsertCashCloseDto } from './dto/cash-close.dto';
import { buildCashClosePdf } from './cash-close.pdf';
import {
  cashAmountFromPaymentMethod,
  splitPaymentChannels,
} from '../common/payment-channels';

function dayBounds(dateKey: string): { from: Date; to: Date; shiftDate: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException('date debe ser YYYY-MM-DD');
  }
  const { from, to } = bogotaDayBounds(dateKey);
  return { from, to, shiftDate: from };
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
export class PlatformCashCloseService implements OnModuleInit, OnModuleDestroy {
  private autoCloseTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.runAutoCloseSweep();
    this.autoCloseTimer = setInterval(() => {
      void this.runAutoCloseSweep();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.autoCloseTimer) clearInterval(this.autoCloseTimer);
  }

  private async runAutoCloseSweep() {
    const todayKey = bogotaDateKey(new Date());
    if (!isPastAutoCloseTime(todayKey)) return;

    const companies = await this.prisma.company.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    for (const company of companies) {
      try {
        await this.autoFinalizeIfDue(company.id, todayKey);
      } catch {
        /* ignore per-company failures during sweep */
      }
    }

    const staleDrafts = await this.prisma.cashClose.findMany({
      where: {
        status: 'DRAFT',
        closeDate: { lt: bogotaDayBounds(todayKey).from },
      },
      select: { companyId: true, closeDate: true },
    });
    for (const row of staleDrafts) {
      try {
        await this.autoFinalizeIfDue(
          row.companyId,
          bogotaDateKey(row.closeDate),
        );
      } catch {
        /* ignore */
      }
    }
  }

  private computeExpectedCash(
    payments: { method: string; totalCOP: number }[],
  ): number {
    return payments.reduce((sum, p) => {
      return sum + cashAmountFromPaymentMethod(p.method, p.totalCOP);
    }, 0);
  }

  async getDailyClose(tenant: TenantContext, dateKey: string) {
    await this.autoFinalizeIfDue(tenant.companyId, dateKey);
    return this.buildDailyClose(tenant.companyId, dateKey);
  }

  private async buildDailyClose(companyId: string, dateKey: string) {
    const { from, to, shiftDate } = dayBounds(dateKey);

    const [company, sales, purchases, shifts, record] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
      this.prisma.sale.findMany({
        where: {
          companyId,
          saleDate: { gte: from, lte: to },
        },
        include: {
          lines: { orderBy: { productName: 'asc' } },
        },
        orderBy: { saleDate: 'asc' },
      }),
      this.prisma.purchaseLot.findMany({
        where: {
          companyId,
          purchaseDate: { gte: from, lte: to },
        },
        include: { lines: true },
        orderBy: { purchaseDate: 'asc' },
      }),
      this.prisma.staffShift.findMany({
        where: {
          companyId,
          shiftDate,
        },
        include: { staffMember: { select: { id: true, name: true } } },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.cashClose.findUnique({
        where: {
          companyId_closeDate: {
            companyId,
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

    let cashCOP = 0;
    let nequiCOP = 0;
    let otherPayCOP = 0;
    for (const p of paymentsByMethod) {
      const ch = splitPaymentChannels(p.method, p.totalCOP);
      cashCOP += ch.cashCOP;
      nequiCOP += ch.nequiCOP;
      otherPayCOP += ch.otherCOP;
    }

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
        cashCOP,
        nequiCOP,
        otherPayCOP,
      },
      paymentsByMethod,
      sales: saleRows,
      purchases: purchaseRows,
      shifts: shiftRows,
      record: record ? formatRecord(record) : null,
      meta: {
        autoCloseAt: '23:59',
        timezone: 'America/Bogota',
        isEditable: record
          ? record.status !== 'CLOSED' && !isPastAutoCloseTime(dateKey)
          : !isPastAutoCloseTime(dateKey),
      },
    };
  }

  private async autoFinalizeIfDue(companyId: string, dateKey: string) {
    if (!isPastAutoCloseTime(dateKey)) return;

    const { shiftDate, to } = dayBounds(dateKey);
    const existing = await this.prisma.cashClose.findUnique({
      where: {
        companyId_closeDate: { companyId, closeDate: shiftDate },
      },
    });
    if (existing?.status === 'CLOSED') return;

    const daily = await this.buildDailyClose(companyId, dateKey);
    const openingFloat =
      existing?.openingFloatCOP != null
        ? Number(existing.openingFloatCOP)
        : 0;
    const expected =
      (daily.summary.expectedCashCOP ?? 0) + openingFloat;
    const counted =
      existing?.countedCashCOP != null
        ? Number(existing.countedCashCOP)
        : expected;
    const variance = counted - expected;

    await this.prisma.cashClose.upsert({
      where: {
        companyId_closeDate: { companyId, closeDate: shiftDate },
      },
      create: {
        companyId,
        closeDate: shiftDate,
        status: 'CLOSED',
        salesTotalCOP: new Prisma.Decimal(daily.summary.salesTotalCOP),
        purchasesTotalCOP: new Prisma.Decimal(daily.summary.purchasesTotalCOP),
        laborTotalCOP: new Prisma.Decimal(daily.summary.laborTotalCOP),
        expectedCashCOP: new Prisma.Decimal(expected),
        openingFloatCOP:
          existing?.openingFloatCOP != null
            ? existing.openingFloatCOP
            : null,
        countedCashCOP: new Prisma.Decimal(counted),
        varianceCOP: new Prisma.Decimal(variance),
        notes: existing?.notes ?? null,
        closedAt: to,
      },
      update: {
        status: 'CLOSED',
        salesTotalCOP: new Prisma.Decimal(daily.summary.salesTotalCOP),
        purchasesTotalCOP: new Prisma.Decimal(daily.summary.purchasesTotalCOP),
        laborTotalCOP: new Prisma.Decimal(daily.summary.laborTotalCOP),
        expectedCashCOP: new Prisma.Decimal(expected),
        countedCashCOP: new Prisma.Decimal(counted),
        varianceCOP: new Prisma.Decimal(variance),
        closedAt: existing?.closedAt ?? to,
      },
    });
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
    if (isPastAutoCloseTime(dateKey)) {
      throw new BadRequestException(
        'Este día ya cerró automáticamente a las 11:59 p. m.',
      );
    }
    const daily = await this.buildDailyClose(tenant.companyId, dateKey);
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
      meta: {
        autoCloseAt: '23:59',
        timezone: 'America/Bogota',
        isEditable: true,
      },
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
      throw new BadRequestException(
        'Guardá el arqueo antes de cerrar el día.',
      );
    }
    if (existing.status === 'CLOSED') {
      throw new BadRequestException('Este día ya está cerrado.');
    }
    if (existing.countedCashCOP == null) {
      throw new BadRequestException(
        'Indicá el efectivo contado antes de cerrar la caja.',
      );
    }

    const daily = await this.buildDailyClose(tenant.companyId, dateKey);
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
      meta: {
        autoCloseAt: '23:59',
        timezone: 'America/Bogota',
        isEditable: false,
      },
    };
  }

  async buildReportPdf(tenant: TenantContext, dateKey: string) {
    const daily = await this.getDailyClose(tenant, dateKey);
    const buffer = await buildCashClosePdf({
      date: daily.date,
      companyName: daily.companyName,
      summary: daily.summary,
      paymentsByMethod: daily.paymentsByMethod,
      sales: daily.sales.map((s) => ({
        code: s.code,
        customer: s.customer,
        paymentMethod: s.paymentMethod,
        total: s.total,
      })),
      purchases: daily.purchases.map((p) => ({
        code: p.code,
        name: p.name,
        total: p.total,
      })),
      shifts: daily.shifts.map((s) => ({
        staffName: s.staffName,
        hoursWorked: s.hoursWorked,
        totalPayCOP: s.totalPayCOP,
      })),
      record: daily.record,
    });
    const slug = (daily.companyName ?? 'empresa')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    return {
      buffer,
      filename: `cierre-caja-${dateKey}-${slug || 'empresa'}.pdf`,
    };
  }
}
