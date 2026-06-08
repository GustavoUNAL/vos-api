import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import {
  type AnalyticsGranularity,
  bucketsToSeries,
  mergeIntoBuckets,
  parseDateRange,
  periodKey,
  periodLabel,
} from './analytics-period';

@Injectable()
export class PlatformAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinancialOverview(
    tenant: TenantContext,
    opts: {
      dateFrom?: string;
      dateTo?: string;
      granularity?: AnalyticsGranularity;
    },
  ) {
    const granularity = opts.granularity ?? 'day';
    if (!['day', 'week', 'month'].includes(granularity)) {
      throw new BadRequestException('granularity debe ser day, week o month');
    }

    const { from, to, fromKey, toKey } = parseDateRange(
      opts.dateFrom,
      opts.dateTo,
    );

    const [sales, purchases, shifts] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          companyId: tenant.companyId,
          saleDate: { gte: from, lte: to },
          code: { startsWith: 'LEDGER-SALE-' },
        },
        select: {
          saleDate: true,
          total: true,
          lines: { select: { profit: true } },
        },
      }),
      this.prisma.purchaseLot.findMany({
        where: {
          companyId: tenant.companyId,
          purchaseDate: { gte: from, lte: to },
        },
        select: { purchaseDate: true, totalValue: true },
      }),
      this.prisma.staffShift.findMany({
        where: {
          companyId: tenant.companyId,
          shiftDate: {
            gte: new Date(`${fromKey}T00:00:00.000Z`),
            lte: new Date(`${toKey}T00:00:00.000Z`),
          },
        },
        select: {
          shiftDate: true,
          hoursWorked: true,
          totalPayCOP: true,
        },
      }),
    ]);

    const salesBuckets = new Map<string, { count: number; totalCOP: number; profitCOP?: number; hours?: number }>();
    const purchaseBuckets = new Map<string, { count: number; totalCOP: number; profitCOP?: number; hours?: number }>();
    const staffBuckets = new Map<string, { count: number; totalCOP: number; profitCOP?: number; hours?: number }>();

    let salesTotal = 0;
    let salesProfit = 0;
    for (const row of sales) {
      const key = periodKey(row.saleDate, granularity);
      const total = Number(row.total);
      let lineProfit = 0;
      for (const line of row.lines) {
        if (line.profit != null) lineProfit += Number(line.profit);
      }
      salesTotal += total;
      salesProfit += lineProfit;
      mergeIntoBuckets(salesBuckets, key, {
        count: 1,
        totalCOP: total,
        profitCOP: lineProfit,
      });
    }

    let purchasesTotal = 0;
    for (const row of purchases) {
      const key = periodKey(row.purchaseDate, granularity);
      const total = Number(row.totalValue ?? 0);
      purchasesTotal += total;
      mergeIntoBuckets(purchaseBuckets, key, { count: 1, totalCOP: total });
    }

    let staffPayTotal = 0;
    let staffHours = 0;
    for (const row of shifts) {
      const key = periodKey(row.shiftDate, granularity);
      const pay = Number(row.totalPayCOP ?? 0);
      const hours = Number(row.hoursWorked ?? 0);
      staffPayTotal += pay;
      staffHours += hours;
      mergeIntoBuckets(staffBuckets, key, {
        count: 1,
        totalCOP: pay,
        hours,
      });
    }

    const allPeriods = new Set<string>([
      ...salesBuckets.keys(),
      ...purchaseBuckets.keys(),
      ...staffBuckets.keys(),
    ]);

    const combined = [...allPeriods]
      .sort((a, b) => a.localeCompare(b))
      .map((period) => {
        const s = salesBuckets.get(period);
        const p = purchaseBuckets.get(period);
        const st = staffBuckets.get(period);
        const salesCOP = s?.totalCOP ?? 0;
        const purchasesCOP = p?.totalCOP ?? 0;
        const staffCOP = st?.totalCOP ?? 0;
        return {
          period,
          label: periodLabel(period, granularity),
          salesCount: s?.count ?? 0,
          salesCOP: Math.round(salesCOP),
          salesProfitCOP: Math.round(s?.profitCOP ?? 0),
          grossProfitCOP: Math.round(salesCOP - purchasesCOP),
          purchasesCount: p?.count ?? 0,
          purchasesCOP: Math.round(purchasesCOP),
          staffShifts: st?.count ?? 0,
          staffHours: Math.round((st?.hours ?? 0) * 100) / 100,
          staffPayCOP: Math.round(staffCOP),
          netCOP: Math.round(salesCOP - purchasesCOP - staffCOP),
        };
      });

    return {
      granularity,
      dateFrom: fromKey,
      dateTo: toKey,
      sales: {
        series: bucketsToSeries(salesBuckets, granularity),
        totals: {
          count: sales.length,
          totalCOP: Math.round(salesTotal),
          profitCOP: Math.round(salesProfit),
        },
      },
      purchases: {
        series: bucketsToSeries(purchaseBuckets, granularity),
        totals: {
          count: purchases.length,
          totalCOP: Math.round(purchasesTotal),
        },
      },
      staff: {
        series: bucketsToSeries(staffBuckets, granularity),
        totals: {
          shiftCount: shifts.length,
          hours: Math.round(staffHours * 100) / 100,
          totalPayCOP: Math.round(staffPayTotal),
        },
      },
      combined,
      summary: {
        salesCOP: Math.round(salesTotal),
        salesProfitCOP: Math.round(salesProfit),
        grossProfitCOP: Math.round(salesTotal - purchasesTotal),
        purchasesCOP: Math.round(purchasesTotal),
        staffPayCOP: Math.round(staffPayTotal),
        netCOP: Math.round(salesTotal - purchasesTotal - staffPayTotal),
      },
    };
  }
}
