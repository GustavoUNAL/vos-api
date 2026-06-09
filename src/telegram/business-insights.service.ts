import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

function bogotaDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(d);
}

function monthRangeBogota(): { from: Date; to: Date; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
  const y = Number(parts.year);
  const m = Number(parts.month);
  const from = new Date(Date.UTC(y, m - 1, 1, 5, 0, 0));
  const to = new Date(Date.UTC(y, m, 1, 4, 59, 59));
  const label = new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date(y, m - 1, 15));
  return { from, to, label };
}

function formatCop(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

@Injectable()
export class BusinessInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  defaultCompanyId(): string {
    return (
      this.config.get<string>('TELEGRAM_COMPANY_ID')?.trim() ||
      'seed-arandano-cafe-bar'
    );
  }

  async todayBusiness(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const todayKey = bogotaDateKey();
    const from = new Date(`${todayKey}T00:00:00-05:00`);
    const to = new Date(`${todayKey}T23:59:59-05:00`);

    const sales = await this.prisma.sale.findMany({
      where: { companyId: cid, saleDate: { gte: from, lte: to } },
      select: {
        total: true,
        source: true,
        lines: { select: { profit: true, quantity: true } },
      },
    });

    let total = 0;
    let profit = 0;
    let units = 0;
    const bySource = new Map<string, number>();
    for (const s of sales) {
      const t = Number(s.total);
      total += t;
      bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
      for (const l of s.lines) {
        if (l.profit != null) profit += Number(l.profit);
        units += Number(l.quantity);
      }
    }

    const sources = [...bySource.entries()]
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');

    return [
      `📊 Negocio hoy (${todayKey})`,
      `Ventas: ${sales.length}`,
      `Total vendido: ${formatCop(total)}`,
      `Utilidad en líneas: ${formatCop(Math.round(profit))}`,
      `Unidades: ${Math.round(units * 10) / 10}`,
      sources ? `Origen: ${sources}` : null,
      sales.length === 0
        ? 'Aún no hay ventas registradas hoy.'
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  async purchaseRecommendations(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const items = await this.prisma.inventoryItem.findMany({
      where: { companyId: cid, active: true },
      select: {
        name: true,
        quantity: true,
        minStock: true,
        unit: true,
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    const low = items
      .filter((i) => {
        const min = i.minStock != null ? Number(i.minStock) : null;
        if (min == null || min <= 0) return Number(i.quantity) <= 0;
        return Number(i.quantity) <= min;
      })
      .slice(0, 15);

    if (!low.length) {
      return '🛒 Inventario OK: no hay ítems bajo mínimo ni agotados.';
    }

    const lines = low.map((i) => {
      const qty = Number(i.quantity);
      const min = i.minStock != null ? Number(i.minStock) : 0;
      return `• ${i.name}: ${qty} ${i.unit}${min > 0 ? ` (mín. ${min})` : ''}`;
    });

    return ['🛒 Conviene reponer / revisar:', ...lines].join('\n');
  }

  async monthlyProfit(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const { from, to, label } = monthRangeBogota();

    const sales = await this.prisma.sale.findMany({
      where: { companyId: cid, saleDate: { gte: from, lte: to } },
      select: { total: true, lines: { select: { profit: true } } },
    });

    const purchases = await this.prisma.purchaseLot.aggregate({
      where: { companyId: cid, purchaseDate: { gte: from, lte: to } },
      _sum: { totalValue: true },
    });

    let salesTotal = 0;
    let lineProfit = 0;
    for (const s of sales) {
      salesTotal += Number(s.total);
      for (const l of s.lines) {
        if (l.profit != null) lineProfit += Number(l.profit);
      }
    }
    const purchasesTotal = Number(purchases._sum.totalValue ?? 0);

    return [
      `💰 Utilidad del mes (${label})`,
      `Ventas: ${sales.length} · ${formatCop(salesTotal)}`,
      `Utilidad en productos (líneas): ${formatCop(Math.round(lineProfit))}`,
      `Compras registradas: ${formatCop(Math.round(purchasesTotal))}`,
      `Margen bruto aprox. (ventas − compras): ${formatCop(
        Math.round(salesTotal - purchasesTotal),
      )}`,
    ].join('\n');
  }

  async topProductsByProfit(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const lines = await this.prisma.saleLine.findMany({
      where: {
        sale: { companyId: cid, saleDate: { gte: since } },
      },
      select: {
        productName: true,
        profit: true,
        quantity: true,
        unitPrice: true,
      },
    });

    const agg = new Map<string, { profit: number; revenue: number; qty: number }>();
    for (const l of lines) {
      const name = l.productName.trim() || 'Sin nombre';
      const prev = agg.get(name) ?? { profit: 0, revenue: 0, qty: 0 };
      const qty = Number(l.quantity);
      const profit = l.profit != null ? Number(l.profit) : 0;
      const revenue = qty * Number(l.unitPrice);
      prev.profit += profit;
      prev.revenue += revenue;
      prev.qty += qty;
      agg.set(name, prev);
    }

    const top = [...agg.entries()]
      .sort((a, b) => b[1].profit - a[1].profit)
      .slice(0, 8);

    if (!top.length) {
      return '🏆 Sin ventas en los últimos 30 días para rankear productos.';
    }

    const rows = top.map(([name, v], i) => {
      return `${i + 1}. ${name}\n   Utilidad ${formatCop(Math.round(v.profit))} · ${Math.round(v.qty)} uds`;
    });

    return ['🏆 Productos que más dejan (30 días):', ...rows].join('\n');
  }

  async inactiveCustomers(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const since = new Date();
    since.setDate(since.getDate() - 60);

    const sales = await this.prisma.sale.findMany({
      where: {
        companyId: cid,
        saleDate: { gte: since },
      },
      select: {
        saleDate: true,
        mesa: true,
        customerPhone: true,
      },
      orderBy: { saleDate: 'desc' },
    });

    const lastSeen = new Map<string, Date>();
    for (const s of sales) {
      const label =
        s.mesa?.trim() ||
        s.customerPhone?.trim() ||
        null;
      if (!label) continue;
      if (!lastSeen.has(label)) lastSeen.set(label, s.saleDate);
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 21);

    const inactive = [...lastSeen.entries()]
      .filter(([, d]) => d < cutoff)
      .sort((a, b) => a[1].getTime() - b[1].getTime())
      .slice(0, 12);

    if (!inactive.length) {
      return '👥 No detecté clientes/mesas con más de 3 semanas sin volver (últimos 60 días).';
    }

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('es-CO', { dateStyle: 'short' }).format(d);

    const rows = inactive.map(
      ([name, d]) => `• ${name} — última vez ${fmt(d)}`,
    );

    return ['👥 Clientes o mesas que no han regresado:', ...rows].join('\n');
  }

  async buildContextBundle(companyId?: string): Promise<string> {
    const parts = await Promise.all([
      this.todayBusiness(companyId),
      this.monthlyProfit(companyId),
      this.purchaseRecommendations(companyId),
      this.topProductsByProfit(companyId),
      this.inactiveCustomers(companyId),
    ]);
    return parts.join('\n\n');
  }
}
