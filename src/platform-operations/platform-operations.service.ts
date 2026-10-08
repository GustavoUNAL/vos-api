import { BadRequestException, Injectable } from '@nestjs/common';
import { StockMoveType } from '@prisma/client';
import {
  bogotaClock,
  bogotaDateKey,
  bogotaDayBounds,
  utcDateKey,
} from '../common/bogota-time';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

const OPENING_HOUR = 11;
const VARIANCE_ALERT_COP = 5_000;
const LARGE_DISCOUNT_COP = 5_000;

export type DayEvent = {
  at: string;
  kind: 'sale' | 'purchase' | 'waste' | 'count' | 'adjustment' | 'shift' | 'cash';
  title: string;
  detail: string;
  amountCOP: number | null;
  actor: string | null;
};

export type DayAlert = {
  code: string;
  severity: 'info' | 'warn';
  title: string;
  detail: string;
};

function previousDateKey(dateKey: string): string {
  const noon = new Date(`${dateKey}T12:00:00-05:00`);
  noon.setUTCDate(noon.getUTCDate() - 1);
  return utcDateKey(noon);
}

function attendedBy(notes: string | null | undefined, fallback: string | null): string | null {
  const match = notes?.match(/Atendió:\s*([^·]+)/);
  return match?.[1]?.trim() || fallback;
}

@Injectable()
export class PlatformOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDay(tenant: TenantContext, dateRaw?: string) {
    const dateKey = (dateRaw?.trim() || bogotaDateKey(new Date())).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new BadRequestException('date debe ser YYYY-MM-DD');
    }
    const { from, to } = bogotaDayBounds(dateKey);
    const shiftDate = from;
    const companyId = tenant.companyId;

    const [
      sales,
      purchases,
      moves,
      shifts,
      cashClose,
      lowStock,
      negativeStock,
      placeholderCount,
      monthExpenses,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        where: { companyId, saleDate: { gte: from, lte: to } },
        orderBy: { saleDate: 'desc' },
        select: {
          id: true,
          code: true,
          saleDate: true,
          total: true,
          paymentMethod: true,
          mesa: true,
          notes: true,
          discountCop: true,
          discountReason: true,
          user: { select: { name: true } },
        },
      }),
      this.prisma.purchaseLot.findMany({
        where: { companyId, purchaseDate: { gte: from, lte: to } },
        orderBy: { purchaseDate: 'desc' },
        select: {
          id: true,
          code: true,
          purchaseDate: true,
          supplier: true,
          totalValue: true,
        },
      }),
      this.prisma.stockMove.findMany({
        where: {
          companyId,
          createdAt: { gte: from, lte: to },
          type: { in: [StockMoveType.WASTE, StockMoveType.COUNT, StockMoveType.ADJUSTMENT] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          quantity: true,
          unit: true,
          note: true,
          createdAt: true,
          inventoryItem: { select: { name: true } },
          user: { select: { name: true } },
        },
      }),
      this.prisma.staffShift.findMany({
        where: { companyId, shiftDate },
        orderBy: { startAt: 'desc' },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          totalPayCOP: true,
          status: true,
          staffMember: { select: { name: true } },
        },
      }),
      this.prisma.cashClose.findUnique({
        where: { companyId_closeDate: { companyId, closeDate: shiftDate } },
      }),
      this.prisma.inventoryItem.findMany({
        where: { companyId, active: true, minStock: { not: null } },
        select: { name: true, quantity: true, minStock: true, unit: true },
        take: 400,
      }),
      this.prisma.inventoryItem.findMany({
        where: { companyId, active: true, quantity: { lt: 0 } },
        select: { name: true, quantity: true, unit: true },
        orderBy: { quantity: 'asc' },
        take: 8,
      }),
      this.prisma.inventoryItem.count({
        where: { companyId, active: true, quantity: 5000 },
      }),
      this.prisma.operatingExpense.count({
        where: {
          companyId,
          expenseMonth: new Date(`${dateKey.slice(0, 7)}-01T00:00:00.000Z`),
        },
      }),
    ]);

    const events: DayEvent[] = [];

    for (const sale of sales) {
      const discount = Number(sale.discountCop ?? 0);
      events.push({
        at: sale.saleDate.toISOString(),
        kind: 'sale',
        title: `Venta ${sale.code ?? ''}`.trim(),
        detail: [
          sale.mesa?.trim() || null,
          sale.paymentMethod?.trim() || null,
          discount > 0
            ? `Descuento ${Math.round(discount).toLocaleString('es-CO')}${sale.discountReason ? ` (${sale.discountReason})` : ' sin motivo'}`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
        amountCOP: Math.round(Number(sale.total)),
        actor: attendedBy(sale.notes, sale.user?.name ?? null),
      });
    }

    for (const lot of purchases) {
      events.push({
        at: lot.purchaseDate.toISOString(),
        kind: 'purchase',
        title: `Compra ${lot.code}`,
        detail: lot.supplier?.trim() || 'Sin proveedor',
        amountCOP:
          lot.totalValue != null ? Math.round(Number(lot.totalValue)) : null,
        actor: null,
      });
    }

    for (const move of moves) {
      const qty = Number(move.quantity);
      const kind =
        move.type === StockMoveType.WASTE
          ? 'waste'
          : move.type === StockMoveType.COUNT
            ? 'count'
            : 'adjustment';
      const label =
        kind === 'waste' ? 'Merma' : kind === 'count' ? 'Conteo' : 'Ajuste';
      events.push({
        at: move.createdAt.toISOString(),
        kind,
        title: `${label}: ${move.inventoryItem.name}`,
        detail: [
          `${qty > 0 ? '+' : ''}${qty} ${move.unit}`,
          move.note?.trim() || null,
        ]
          .filter(Boolean)
          .join(' · '),
        amountCOP: null,
        actor: move.user?.name ?? null,
      });
    }

    for (const shift of shifts) {
      events.push({
        at: shift.startAt.toISOString(),
        kind: 'shift',
        title: `Turno de ${shift.staffMember.name}`,
        detail: shift.endAt
          ? 'Turno cerrado'
          : shift.status === 'OPEN'
            ? 'Turno abierto'
            : shift.status,
        amountCOP:
          shift.totalPayCOP != null
            ? Math.round(Number(shift.totalPayCOP))
            : null,
        actor: shift.staffMember.name,
      });
    }

    if (cashClose) {
      const counted =
        cashClose.countedCashCOP != null
          ? Math.round(Number(cashClose.countedCashCOP))
          : null;
      const variance =
        cashClose.varianceCOP != null
          ? Math.round(Number(cashClose.varianceCOP))
          : null;
      events.push({
        at: (cashClose.closedAt ?? cashClose.updatedAt).toISOString(),
        kind: 'cash',
        title: counted == null ? 'Cierre sin conteo' : 'Arqueo de caja',
        detail:
          counted == null
            ? 'El día quedó archivado. Falta el efectivo contado.'
            : variance != null && variance !== 0
              ? `Diferencia ${variance.toLocaleString('es-CO')}`
              : 'Caja cuadrada',
        amountCOP: variance,
        actor: null,
      });
    }

    events.sort((a, b) => b.at.localeCompare(a.at));

    const alerts: DayAlert[] = [];
    const todayKey = bogotaDateKey(new Date());
    const { hour } = bogotaClock();

    if (dateKey === todayKey && hour >= OPENING_HOUR && sales.length === 0) {
      alerts.push({
        code: 'no-sales',
        severity: 'warn',
        title: 'Hoy no hay ventas',
        detail: `Son más de las ${OPENING_HOUR}:00 y no entró ningún cobro.`,
      });
    }

    const yesterdayKey = previousDateKey(todayKey);
    if (dateKey === todayKey) {
      const yesterday = await this.prisma.cashClose.findUnique({
        where: {
          companyId_closeDate: {
            companyId,
            closeDate: bogotaDayBounds(yesterdayKey).from,
          },
        },
        select: { countedCashCOP: true, status: true },
      });
      const yesterdaySales = await this.prisma.sale.count({
        where: {
          companyId,
          saleDate: {
            gte: bogotaDayBounds(yesterdayKey).from,
            lte: bogotaDayBounds(yesterdayKey).to,
          },
        },
      });
      if (
        (yesterday && yesterday.countedCashCOP == null) ||
        (!yesterday && yesterdaySales > 0)
      ) {
        alerts.push({
          code: 'missing-count',
          severity: 'warn',
          title: 'Ayer falta el arqueo',
          detail: 'El cierre quedó sin el efectivo contado en caja.',
        });
      }
    } else if (cashClose && cashClose.countedCashCOP == null) {
      alerts.push({
        code: 'missing-count',
        severity: 'warn',
        title: 'Falta el efectivo contado',
        detail: 'Este día se archivó solo. Todavía se puede hacer el arqueo.',
      });
    }

    const below = lowStock.filter(
      (item) =>
        item.minStock != null && Number(item.quantity) <= Number(item.minStock),
    );
    if (below.length > 0) {
      const names = below
        .slice(0, 6)
        .map((item) => item.name)
        .join(', ');
      alerts.push({
        code: 'low-stock',
        severity: 'warn',
        title: `${below.length} insumo${below.length === 1 ? '' : 's'} bajo el mínimo`,
        detail: names,
      });
    }

    if (negativeStock.length > 0) {
      alerts.push({
        code: 'negative-stock',
        severity: 'warn',
        title: 'Hay insumos en negativo',
        detail: negativeStock
          .map((item) => `${item.name} (${Number(item.quantity)} ${item.unit})`)
          .join(', '),
      });
    }

    if (placeholderCount > 0) {
      alerts.push({
        code: 'placeholder-stock',
        severity: 'info',
        title: 'Saldos sin contar',
        detail: `${placeholderCount} insumos siguen en 5.000. Hacé un conteo físico antes de fiarte del inventario.`,
      });
    }

    for (const sale of sales) {
      const discount = Number(sale.discountCop ?? 0);
      if (discount <= 0) continue;
      if (!sale.discountReason?.trim() || discount >= LARGE_DISCOUNT_COP) {
        alerts.push({
          code: `discount-${sale.id}`,
          severity: 'warn',
          title: `Descuento en ${sale.code ?? 'una venta'}`,
          detail: sale.discountReason?.trim()
            ? `${Math.round(discount).toLocaleString('es-CO')} COP · ${sale.discountReason.trim()}`
            : `${Math.round(discount).toLocaleString('es-CO')} COP sin motivo`,
        });
      }
    }

    if (cashClose?.varianceCOP != null) {
      const variance = Math.round(Number(cashClose.varianceCOP));
      if (Math.abs(variance) >= VARIANCE_ALERT_COP) {
        alerts.push({
          code: 'cash-variance',
          severity: 'warn',
          title: 'La caja no cuadra',
          detail: `Diferencia de ${variance.toLocaleString('es-CO')} COP entre lo contado y lo esperado.`,
        });
      }
    }

    if (
      dateKey === todayKey &&
      Number(dateKey.slice(8, 10)) >= 5 &&
      monthExpenses === 0
    ) {
      alerts.push({
        code: 'missing-utilities',
        severity: 'info',
        title: 'Faltan los gastos del mes',
        detail: 'Todavía no hay agua, energía ni internet cargados.',
      });
    }

    return {
      date: dateKey,
      events: events.slice(0, 80),
      alerts: alerts.slice(0, 20),
    };
  }
}
