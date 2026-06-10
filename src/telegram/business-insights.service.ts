import { Injectable } from '@nestjs/common';
import { ShopOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

function bogotaDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(d);
}

function bogotaDayBounds(dateKey: string): { from: Date; to: Date } {
  return {
    from: new Date(`${dateKey}T00:00:00-05:00`),
    to: new Date(`${dateKey}T23:59:59-05:00`),
  };
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

function shiftDateKey(d: Date, days: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return bogotaDateKey(x);
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

  private async companyName(companyId: string): Promise<string> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    return row?.name ?? 'Tu negocio';
  }

  private async salesDayStats(
    companyId: string,
    dateKey: string,
  ): Promise<{
    count: number;
    total: number;
    profit: number;
    units: number;
    bySource: Record<string, number>;
    topProducts: { name: string; qty: number; revenue: number }[];
  }> {
    const { from, to } = bogotaDayBounds(dateKey);
    const sales = await this.prisma.sale.findMany({
      where: { companyId, saleDate: { gte: from, lte: to } },
      select: {
        total: true,
        source: true,
        lines: {
          select: {
            productName: true,
            profit: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
    });

    let total = 0;
    let profit = 0;
    let units = 0;
    const bySource: Record<string, number> = {};
    const productAgg = new Map<string, { qty: number; revenue: number }>();

    for (const s of sales) {
      total += Number(s.total);
      bySource[s.source] = (bySource[s.source] ?? 0) + 1;
      for (const l of s.lines) {
        if (l.profit != null) profit += Number(l.profit);
        const qty = Number(l.quantity);
        units += qty;
        const name = l.productName.trim() || 'Sin nombre';
        const prev = productAgg.get(name) ?? { qty: 0, revenue: 0 };
        prev.qty += qty;
        prev.revenue += qty * Number(l.unitPrice);
        productAgg.set(name, prev);
      }
    }

    const topProducts = [...productAgg.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      count: sales.length,
      total,
      profit,
      units,
      bySource,
      topProducts,
    };
  }

  async todayBusiness(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const todayKey = bogotaDateKey();
    const yesterdayKey = shiftDateKey(new Date(), -1);
    const today = await this.salesDayStats(cid, todayKey);
    const yesterday = await this.salesDayStats(cid, yesterdayKey);

    const sources = Object.entries(today.bySource)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');

    const topLines =
      today.topProducts.length > 0
        ? today.topProducts
            .map(
              (p, i) =>
                `${i + 1}. ${p.name} · ${formatCop(Math.round(p.revenue))}`,
            )
            .join('\n')
        : null;

    const delta =
      yesterday.total > 0
        ? Math.round(((today.total - yesterday.total) / yesterday.total) * 100)
        : null;

    return [
      `📊 Negocio hoy (${todayKey})`,
      `Ventas: ${today.count}`,
      `Total vendido: ${formatCop(Math.round(today.total))}`,
      `Utilidad en líneas: ${formatCop(Math.round(today.profit))}`,
      `Unidades: ${Math.round(today.units * 10) / 10}`,
      delta != null
        ? `Vs ayer: ${delta >= 0 ? '+' : ''}${delta}% (${formatCop(Math.round(yesterday.total))} ayer)`
        : null,
      sources ? `Origen: ${sources}` : null,
      topLines ? `\nTop productos hoy:\n${topLines}` : null,
      today.count === 0 ? 'Aún no hay ventas registradas hoy.' : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  async weekSummary(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const sinceKey = shiftDateKey(new Date(), -6);
    const { from } = bogotaDayBounds(sinceKey);
    const { to } = bogotaDayBounds(bogotaDateKey());

    const sales = await this.prisma.sale.findMany({
      where: { companyId: cid, saleDate: { gte: from, lte: to } },
      select: {
        saleDate: true,
        total: true,
        lines: { select: { profit: true } },
      },
    });

    let total = 0;
    let profit = 0;
    const byDay = new Map<string, number>();
    for (const s of sales) {
      const key = bogotaDateKey(s.saleDate);
      const t = Number(s.total);
      total += t;
      byDay.set(key, (byDay.get(key) ?? 0) + t);
      for (const l of s.lines) {
        if (l.profit != null) profit += Number(l.profit);
      }
    }

    const dayLines = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => `• ${d}: ${formatCop(Math.round(v))}`);

    return [
      '📈 Últimos 7 días',
      `Ventas: ${sales.length} · ${formatCop(Math.round(total))}`,
      `Utilidad en líneas: ${formatCop(Math.round(profit))}`,
      dayLines.length ? '\nPor día:\n' + dayLines.join('\n') : null,
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

  async inventoryOverview(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const items = await this.prisma.inventoryItem.findMany({
      where: { companyId: cid, active: true },
      select: { quantity: true, unitCost: true, minStock: true },
    });
    let skus = items.length;
    let low = 0;
    let value = 0;
    for (const i of items) {
      const qty = Number(i.quantity);
      value += qty * Number(i.unitCost ?? 0);
      const min = i.minStock != null ? Number(i.minStock) : null;
      if (min != null && min > 0 && qty <= min) low += 1;
      else if (qty <= 0) low += 1;
    }
    return [
      '📦 Inventario',
      `Ítems activos: ${skus}`,
      `Bajo mínimo o agotados: ${low}`,
      `Valor estimado en stock: ${formatCop(Math.round(value))}`,
    ].join('\n');
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

    const staff = await this.prisma.staffShift.aggregate({
      where: {
        companyId: cid,
        shiftDate: { gte: from, lte: to },
      },
      _sum: { totalPayCOP: true, hoursWorked: true },
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
    const staffPay = Number(staff._sum.totalPayCOP ?? 0);
    const staffHours = Number(staff._sum.hoursWorked ?? 0);
    const netApprox = salesTotal - purchasesTotal - staffPay;

    return [
      `💰 Finanzas del mes (${label})`,
      `Ventas: ${sales.length} · ${formatCop(Math.round(salesTotal))}`,
      `Utilidad en productos (líneas): ${formatCop(Math.round(lineProfit))}`,
      `Compras: ${formatCop(Math.round(purchasesTotal))}`,
      `Nómina (turnos): ${formatCop(Math.round(staffPay))} · ${Math.round(staffHours * 10) / 10} h`,
      `Resultado aprox. (ventas − compras − nómina): ${formatCop(Math.round(netApprox))}`,
    ].join('\n');
  }

  async purchasesRecent(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const { from, label } = monthRangeBogota();
    const lots = await this.prisma.purchaseLot.findMany({
      where: { companyId: cid, purchaseDate: { gte: from } },
      orderBy: { purchaseDate: 'desc' },
      take: 8,
      select: {
        code: true,
        name: true,
        supplier: true,
        purchaseDate: true,
        totalValue: true,
      },
    });
    if (!lots.length) {
      return `🧾 Sin compras registradas en ${label}.`;
    }
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('es-CO', { dateStyle: 'short' }).format(d);
    const lines = lots.map((l) => {
      const label = l.name?.trim() || l.code;
      const sup = l.supplier?.trim() ? ` · ${l.supplier.trim()}` : '';
      return `• ${fmt(l.purchaseDate)} ${label}${sup}: ${formatCop(Math.round(Number(l.totalValue ?? 0)))}`;
    });
    return [`🧾 Compras del mes (${label}):`, ...lines].join('\n');
  }

  async staffMonthSummary(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const { from, label } = monthRangeBogota();
    const shifts = await this.prisma.staffShift.findMany({
      where: { companyId: cid, shiftDate: { gte: from, lte: new Date() } },
      select: {
        hoursWorked: true,
        totalPayCOP: true,
        staffMember: { select: { name: true } },
      },
      orderBy: { shiftDate: 'desc' },
      take: 200,
    });
    if (!shifts.length) {
      return `👨‍🍳 Sin turnos de personal registrados en ${label}.`;
    }
    let hours = 0;
    let pay = 0;
    const byMember = new Map<string, number>();
    for (const s of shifts) {
      hours += Number(s.hoursWorked);
      pay += Number(s.totalPayCOP);
      const name = s.staffMember?.name?.trim() || 'Sin nombre';
      byMember.set(name, (byMember.get(name) ?? 0) + Number(s.totalPayCOP));
    }
    const top = [...byMember.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([n, v]) => `• ${n}: ${formatCop(Math.round(v))}`);
    return [
      `👨‍🍳 Personal (${label})`,
      `Turnos: ${shifts.length} · ${Math.round(hours * 10) / 10} h`,
      `Pago total: ${formatCop(Math.round(pay))}`,
      top.length ? '\nPor persona:\n' + top.join('\n') : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  async shopOrdersStatus(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const orders = await this.prisma.shopOrder.groupBy({
      by: ['status'],
      where: { companyId: cid },
      _count: { _all: true },
    });
    const pending = await this.prisma.shopOrder.findMany({
      where: {
        companyId: cid,
        status: { in: [ShopOrderStatus.PENDING, ShopOrderStatus.PREPARING] },
      },
      orderBy: { createdAt: 'asc' },
      take: 6,
      select: {
        orderCode: true,
        status: true,
        customerName: true,
        total: true,
      },
    });
    if (!orders.length && !pending.length) {
      return '🛍️ Tienda online: sin pedidos registrados.';
    }
    const counts = orders
      .map((o) => `${o.status}: ${o._count._all}`)
      .join(' · ');
    const lines = pending.map(
      (o) =>
        `• ${o.orderCode} (${o.status}) ${o.customerName?.trim() || 'Cliente'}: ${formatCop(Math.round(Number(o.total)))}`,
    );
    return [
      '🛍️ Pedidos tienda online',
      counts || 'Sin pedidos',
      lines.length ? '\nActivos:\n' + lines.join('\n') : null,
    ]
      .filter(Boolean)
      .join('\n');
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
      prev.profit += profit;
      prev.revenue += qty * Number(l.unitPrice);
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
      return `${i + 1}. ${name}\n   Utilidad ${formatCop(Math.round(v.profit))} · Ventas ${formatCop(Math.round(v.revenue))} · ${Math.round(v.qty)} uds`;
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
      const label = s.mesa?.trim() || s.customerPhone?.trim() || null;
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

  helpText(): string {
    return [
      '🤖 Soy tu gerente digital. Preguntame sobre:',
      '',
      '• Ventas de hoy, la semana o el mes',
      '• Utilidad, compras y nómina',
      '• Qué reponer en inventario',
      '• Productos más rentables',
      '• Clientes que no han vuelto',
      '• Pedidos de la tienda online',
      '• Tareas y pendientes del día',
      '• Resumen financiero del negocio',
      '',
      'También podés saludarme o contarme en tus palabras qué te preocupa.',
    ].join('\n');
  }

  async tasksTodaySummary(companyId?: string): Promise<string> {
    const cid = companyId ?? this.defaultCompanyId();
    const name = await this.companyName(cid);
    const todayKey = bogotaDateKey();
    const tasks = await this.prisma.companyTask.findMany({
      where: { companyId: cid, taskDate: todayKey },
      orderBy: [{ completed: 'asc' }, { sortOrder: 'asc' }],
      select: { title: true, completed: true, description: true },
      take: 20,
    });

    if (!tasks.length) {
      return [
        `📋 Tareas de hoy (${todayKey}) — ${name}`,
        '',
        'No hay tareas cargadas para hoy.',
        'Podés crearlas en el módulo Tareas del panel.',
      ].join('\n');
    }

    const pending = tasks.filter((t) => !t.completed);
    const done = tasks.filter((t) => t.completed);
    const lines = [
      `📋 Tareas de hoy — ${name}`,
      `• Pendientes: ${pending.length} · Hechas: ${done.length}`,
      '',
    ];

    if (pending.length) {
      lines.push('Pendientes:');
      for (const t of pending.slice(0, 8)) {
        lines.push(`• ${t.title}`);
      }
      if (pending.length > 8) {
        lines.push(`• … y ${pending.length - 8} más`);
      }
    } else {
      lines.push('✅ ¡Todas las tareas de hoy están completadas!');
    }

    return lines.join('\n');
  }

  async buildStructuredContext(companyId?: string): Promise<Record<string, unknown>> {
    const cid = companyId ?? this.defaultCompanyId();
    const todayKey = bogotaDateKey();
    const yesterdayKey = shiftDateKey(new Date(), -1);
    const { from: monthFrom, label: monthLabel } = monthRangeBogota();

    const [
      name,
      today,
      yesterday,
      weekSales,
      monthSalesAgg,
      monthPurchases,
      monthStaff,
      lowInventory,
      shopGroups,
      pendingShop,
      todayTasks,
    ] = await Promise.all([
      this.companyName(cid),
      this.salesDayStats(cid, todayKey),
      this.salesDayStats(cid, yesterdayKey),
      this.prisma.sale.aggregate({
        where: {
          companyId: cid,
          saleDate: {
            gte: bogotaDayBounds(shiftDateKey(new Date(), -6)).from,
            lte: bogotaDayBounds(todayKey).to,
          },
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.sale.findMany({
        where: { companyId: cid, saleDate: { gte: monthFrom } },
        select: { total: true, lines: { select: { profit: true } } },
        take: 5000,
      }),
      this.prisma.purchaseLot.aggregate({
        where: { companyId: cid, purchaseDate: { gte: monthFrom } },
        _sum: { totalValue: true },
        _count: { _all: true },
      }),
      this.prisma.staffShift.aggregate({
        where: { companyId: cid, shiftDate: { gte: monthFrom } },
        _sum: { totalPayCOP: true, hoursWorked: true },
        _count: { _all: true },
      }),
      this.prisma.inventoryItem.findMany({
        where: { companyId: cid, active: true },
        select: { name: true, quantity: true, minStock: true, unit: true },
        take: 500,
      }),
      this.prisma.shopOrder.groupBy({
        by: ['status'],
        where: { companyId: cid },
        _count: { _all: true },
      }),
      this.prisma.shopOrder.findMany({
        where: {
          companyId: cid,
          status: { in: [ShopOrderStatus.PENDING, ShopOrderStatus.PREPARING] },
        },
        select: { orderCode: true, status: true, total: true },
        take: 10,
      }),
      this.prisma.companyTask.findMany({
        where: { companyId: cid, taskDate: todayKey },
        orderBy: [{ completed: 'asc' }, { sortOrder: 'asc' }],
        select: { title: true, completed: true },
        take: 12,
      }),
    ]);

    let monthSalesTotal = 0;
    let monthProfit = 0;
    for (const s of monthSalesAgg) {
      monthSalesTotal += Number(s.total);
      for (const l of s.lines) {
        if (l.profit != null) monthProfit += Number(l.profit);
      }
    }

    const inventoryLow = lowInventory
      .filter((i) => {
        const min = i.minStock != null ? Number(i.minStock) : null;
        const qty = Number(i.quantity);
        if (min == null || min <= 0) return qty <= 0;
        return qty <= min;
      })
      .slice(0, 12)
      .map((i) => ({
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit,
        minStock: i.minStock != null ? Number(i.minStock) : null,
      }));

    return {
      empresa: name,
      fechaConsulta: todayKey,
      hoy: {
        ventas: today.count,
        totalCOP: Math.round(today.total),
        utilidadLineasCOP: Math.round(today.profit),
        topProductos: today.topProducts,
        porOrigen: today.bySource,
      },
      ayer: {
        ventas: yesterday.count,
        totalCOP: Math.round(yesterday.total),
        utilidadLineasCOP: Math.round(yesterday.profit),
      },
      semana: {
        ventas: weekSales._count._all,
        totalCOP: Math.round(Number(weekSales._sum.total ?? 0)),
      },
      mes: {
        etiqueta: monthLabel,
        ventas: monthSalesAgg.length,
        totalCOP: Math.round(monthSalesTotal),
        utilidadLineasCOP: Math.round(monthProfit),
        comprasCOP: Math.round(Number(monthPurchases._sum.totalValue ?? 0)),
        comprasCount: monthPurchases._count._all,
        nominaCOP: Math.round(Number(monthStaff._sum.totalPayCOP ?? 0)),
        horasPersonal: Number(monthStaff._sum.hoursWorked ?? 0),
        turnos: monthStaff._count._all,
        resultadoAproxCOP: Math.round(
          monthSalesTotal -
            Number(monthPurchases._sum.totalValue ?? 0) -
            Number(monthStaff._sum.totalPayCOP ?? 0),
        ),
      },
      inventarioBajo: inventoryLow,
      tiendaOnline: {
        porEstado: Object.fromEntries(
          shopGroups.map((g) => [g.status, g._count._all]),
        ),
        pedidosActivos: pendingShop.map((o) => ({
          codigo: o.orderCode,
          estado: o.status,
          totalCOP: Math.round(Number(o.total)),
        })),
      },
      tareasHoy: {
        total: todayTasks.length,
        pendientes: todayTasks.filter((t) => !t.completed).length,
        completadas: todayTasks.filter((t) => t.completed).length,
        pendientesTitulos: todayTasks
          .filter((t) => !t.completed)
          .slice(0, 6)
          .map((t) => t.title),
      },
    };
  }

  async buildContextBundle(companyId?: string): Promise<string> {
    const parts = await Promise.all([
      this.todayBusiness(companyId),
      this.weekSummary(companyId),
      this.monthlyProfit(companyId),
      this.purchaseRecommendations(companyId),
      this.inventoryOverview(companyId),
      this.purchasesRecent(companyId),
      this.staffMonthSummary(companyId),
      this.shopOrdersStatus(companyId),
      this.topProductsByProfit(companyId),
      this.inactiveCustomers(companyId),
    ]);
    return parts.join('\n\n');
  }
}
