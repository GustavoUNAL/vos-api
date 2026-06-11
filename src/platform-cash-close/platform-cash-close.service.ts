import { BadRequestException, Injectable } from '@nestjs/common';
import { bogotaDayBounds } from '../common/bogota-time';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

function dayBounds(dateKey: string): { from: Date; to: Date; shiftDate: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException('date debe ser YYYY-MM-DD');
  }
  const { from, to } = bogotaDayBounds(dateKey);
  return { from, to, shiftDate: from };
}

@Injectable()
export class PlatformCashCloseService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyClose(tenant: TenantContext, dateKey: string) {
    const { from, to, shiftDate } = dayBounds(dateKey);

    const [company, sales, purchases, shifts] = await Promise.all([
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
      },
      paymentsByMethod: [...payments.entries()].map(([method, totalCOP]) => ({
        method,
        totalCOP,
      })),
      sales: saleRows,
      purchases: purchaseRows,
      shifts: shiftRows,
    };
  }
}
