import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma, SaleSource } from '@prisma/client';
import {
  bogotaDateKey,
  bogotaDayBounds,
  bogotaMonthBounds,
} from '../common/bogota-time';
import { mapCategoryRelation } from '../common/category-display-name';
import { nextHumanCodeTx } from '../common/human-code';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ReplaceSaleLinesDto } from './dto/replace-sale-lines.dto';
import { SaleLineInputDto } from './dto/sale-line-input.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import {
  decStr,
  iso,
  sumPaidAmount,
  sumPendingAmount,
} from './sales-format';

type PaginationParams = {
  page: number;
  limit: number;
  search?: string;
  source?: SaleSource;
  dateFrom?: string;
  dateTo?: string;
};

const saleListInclude = {
  client: {
    select: { id: true, code: true, name: true },
  },
  user: {
    select: { id: true, name: true, email: true, role: true, active: true },
  },
  cart: {
    select: {
      id: true,
      status: true,
      sessionId: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  payments: {
    select: {
      id: true,
      gateway: true,
      gatewayPaymentId: true,
      amount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { lines: true, payments: true, stockMovements: true } },
} satisfies Prisma.SaleInclude;

const saleDetailInclude = {
  client: {
    select: { id: true, code: true, name: true, notes: true },
  },
  user: {
    select: { id: true, name: true, email: true, role: true, active: true },
  },
  cart: {
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      items: {
        orderBy: { id: 'asc' as const },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              type: true,
              price: true,
              imageUrl: true,
              active: true,
              size: true,
              saleUnit: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
  lines: {
    orderBy: { id: 'asc' as const },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          imageUrl: true,
          active: true,
          size: true,
          saleUnit: true,
          description: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  },
  payments: { orderBy: { createdAt: 'asc' as const } },
  stockMovements: {
    orderBy: { movementDate: 'desc' as const },
    include: {
      inventoryItem: {
        select: { id: true, name: true, unit: true, lot: true },
      },
      user: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.SaleInclude;

type SaleListRow = Prisma.SaleGetPayload<{
  include: typeof saleListInclude;
}>;

type SaleDetailRow = Prisma.SaleGetPayload<{
  include: typeof saleDetailInclude;
}>;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private formatSaleListItem(sale: SaleListRow) {
    const paid = sumPaidAmount(sale.payments);
    const pending = sumPendingAmount(sale.payments);
    const totalNum = Number(sale.total.toString());
    const displayPerson = sale.user?.name ?? sale.cart?.user?.name ?? null;
    return {
      id: sale.id,
      code: sale.code ?? sale.id,
      clientId: sale.clientId,
      clientCode: sale.client?.code ?? null,
      clientName: sale.client?.name ?? null,
      /** ISO 8601 (UTC). Misma semántica que antes con Prisma `Date` serializado a JSON. */
      saleDate: iso(sale.saleDate),
      /** Solo fecha `YYYY-MM-DD` (Colombia) para columnas tipo “día de venta”. */
      saleDateOnly: bogotaDateKey(sale.saleDate),
      createdAt: iso(sale.createdAt),
      updatedAt: iso(sale.updatedAt),
      /**
       * Total en COP como número (compatibilidad con tablas que usan `row.total`).
       */
      total: totalNum,
      totalCOP: decStr(sale.total, 2),
      paymentMethod: sale.paymentMethod,
      source: sale.source,
      mesa: sale.mesa,
      notes: sale.notes,
      userId: sale.userId,
      cartId: sale.cartId,
      /** Quien registró la venta (si existe). */
      user: sale.user
        ? {
            id: sale.user.id,
            name: sale.user.name,
            email: sale.user.email,
            role: sale.user.role,
            active: sale.user.active,
          }
        : null,
      /** Texto listo para mostrar en tabla (empleado o cliente de carrito). */
      displayPerson: displayPerson ?? '—',
      recordedByUserId: sale.userId,
      recordedByName: sale.user?.name ?? null,
      lineCount: sale._count.lines,
      cart: sale.cart
        ? {
            id: sale.cart.id,
            status: sale.cart.status,
            sessionId: sale.cart.sessionId,
            userId: sale.cart.userId,
            createdAt: iso(sale.cart.createdAt),
            updatedAt: iso(sale.cart.updatedAt),
            user: sale.cart.user
              ? {
                  id: sale.cart.user.id,
                  name: sale.cart.user.name,
                  email: sale.cart.user.email,
                }
              : null,
          }
        : null,
      payments: sale.payments.map((p) => ({
        id: p.id,
        gateway: p.gateway,
        gatewayPaymentId: p.gatewayPaymentId,
        amountCOP: decStr(p.amount, 2),
        status: p.status,
        createdAt: iso(p.createdAt),
        updatedAt: iso(p.updatedAt),
      })),
      paymentSummary: {
        count: sale.payments.length,
        paidCOP: decStr(paid, 2),
        pendingCOP: decStr(pending, 2),
      },
      counts: {
        lines: sale._count.lines,
        payments: sale._count.payments,
        stockMovements: sale._count.stockMovements,
      },
    };
  }

  private formatSaleDetail(sale: SaleDetailRow) {
    const lines = sale.lines.map((ln) => {
      const subtotal = ln.quantity.mul(ln.unitPrice);
      return {
        id: ln.id,
        code: ln.code ?? null,
        productId: ln.productId,
        productName: ln.productName,
        lineUnit: ln.lineUnit ?? null,
        lineSize: ln.lineSize ?? null,
        quantity: ln.quantity.toString(),
        /** Compatibilidad con UIs que usan número. */
        unitPrice: Number(ln.unitPrice.toString()),
        lineTotal: Number(subtotal.toString()),
        unitPriceCOP: decStr(ln.unitPrice, 2),
        lineSubtotalCOP: decStr(subtotal, 2),
        costAtSaleCOP: decStr(ln.costAtSale, 2),
        profitCOP: decStr(ln.profit, 2),
        product: ln.product
          ? {
              id: ln.product.id,
              name: ln.product.name,
              type: ln.product.type,
              priceCOP: decStr(ln.product.price, 2),
              imageUrl: ln.product.imageUrl,
              active: ln.product.active,
              size: ln.product.size,
              saleUnit: ln.product.saleUnit,
              description: ln.product.description,
              category: ln.product.category
                ? mapCategoryRelation(ln.product.category)
                : null,
            }
          : null,
      };
    });

    let sumCost = new Prisma.Decimal(0);
    let sumProfit = new Prisma.Decimal(0);
    for (const ln of sale.lines) {
      // `costAtSale` / `profit` son totales por línea (no por unidad).
      if (ln.costAtSale != null) sumCost = sumCost.add(ln.costAtSale);
      if (ln.profit != null) sumProfit = sumProfit.add(ln.profit);
    }

    const paid = sumPaidAmount(sale.payments);
    const pending = sumPendingAmount(sale.payments);
    const totalNum = Number(sale.total.toString());
    const displayPerson =
      sale.user?.name ??
      sale.cart?.user?.name ??
      null;

    return {
      id: sale.id,
      code: sale.code ?? sale.id,
      saleDate: iso(sale.saleDate),
      saleDateOnly: bogotaDateKey(sale.saleDate),
      createdAt: iso(sale.createdAt),
      updatedAt: iso(sale.updatedAt),
      total: totalNum,
      totalCOP: decStr(sale.total, 2),
      paymentMethod: sale.paymentMethod,
      source: sale.source,
      mesa: sale.mesa,
      notes: sale.notes,
      userId: sale.userId,
      clientId: sale.clientId,
      client: sale.client
        ? {
            id: sale.client.id,
            code: sale.client.code,
            name: sale.client.name,
            notes: sale.client.notes ?? null,
          }
        : null,
      clientCode: sale.client?.code ?? null,
      clientName: sale.client?.name ?? null,
      cartId: sale.cartId,
      user: sale.user
        ? {
            id: sale.user.id,
            name: sale.user.name,
            email: sale.user.email,
            role: sale.user.role,
            active: sale.user.active,
          }
        : null,
      displayPerson: displayPerson ?? '—',
      recordedByUserId: sale.userId,
      recordedByName: sale.user?.name ?? null,
      lineCount: sale.lines.length,
      cart: sale.cart
        ? {
            id: sale.cart.id,
            status: sale.cart.status,
            sessionId: sale.cart.sessionId,
            userId: sale.cart.userId,
            createdAt: iso(sale.cart.createdAt),
            updatedAt: iso(sale.cart.updatedAt),
            user: sale.cart.user
              ? {
                  id: sale.cart.user.id,
                  name: sale.cart.user.name,
                  email: sale.cart.user.email,
                  role: sale.cart.user.role,
                }
              : null,
            items: sale.cart.items.map((it) => ({
              id: it.id,
              quantity: it.quantity.toString(),
              unitPriceCOP: decStr(it.unitPrice, 2),
              lineSubtotalCOP: decStr(it.quantity.mul(it.unitPrice), 2),
              product: it.product
                ? {
                    id: it.product.id,
                    name: it.product.name,
                    type: it.product.type,
                    priceCOP: decStr(it.product.price, 2),
                    imageUrl: it.product.imageUrl,
                    active: it.product.active,
                    size: it.product.size,
                    category: it.product.category
                      ? mapCategoryRelation(it.product.category)
                      : null,
                  }
                : null,
            })),
          }
        : null,
      lines,
      lineSummary: {
        count: sale.lines.length,
        totalCostAtSaleCOP:
          sale.lines.some((l) => l.costAtSale != null)
            ? decStr(sumCost, 2)
            : null,
        totalProfitCOP:
          sale.lines.some((l) => l.profit != null)
            ? decStr(sumProfit, 2)
            : null,
      },
      payments: sale.payments.map((p) => ({
        id: p.id,
        gateway: p.gateway,
        gatewayPaymentId: p.gatewayPaymentId,
        amountCOP: decStr(p.amount, 2),
        status: p.status,
        metadata: p.metadata,
        createdAt: iso(p.createdAt),
        updatedAt: iso(p.updatedAt),
      })),
      paymentSummary: {
        count: sale.payments.length,
        paidCOP: decStr(paid, 2),
        pendingCOP: decStr(pending, 2),
        failedCount: sale.payments.filter(
          (p) => p.status === PaymentStatus.FAILED,
        ).length,
      },
      stockMovements: sale.stockMovements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity.toString(),
        unit: m.unit,
        reason: m.reason,
        notes: m.notes,
        movementDate: iso(m.movementDate),
        createdAt: iso(m.createdAt),
        inventoryItem: m.inventoryItem
          ? {
              id: m.inventoryItem.id,
              name: m.inventoryItem.name,
              unit: m.inventoryItem.unit,
              lot: m.inventoryItem.lot,
            }
          : null,
        user: m.user
          ? { id: m.user.id, name: m.user.name, email: m.user.email }
          : null,
      })),
    };
  }

  private async validateProductIds(lines: SaleLineInputDto[]) {
    const pids = [
      ...new Set(lines.map((l) => l.productId).filter(Boolean)),
    ] as string[];
    if (!pids.length) return;
    const found = await this.prisma.product.findMany({
      where: { id: { in: pids }, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== pids.length) {
      throw new BadRequestException(
        'Una o más referencias de producto no son válidas',
      );
    }
  }

  private computeTotal(lines: SaleLineInputDto[]): Prisma.Decimal {
    let total = new Prisma.Decimal(0);
    for (const line of lines) {
      total = total.add(
        new Prisma.Decimal(line.quantity).mul(line.unitPrice),
      );
    }
    return total;
  }

  async create(dto: CreateSaleDto) {
    if (!dto.lines.length) {
      throw new BadRequestException('La venta debe tener al menos una línea');
    }
    await this.validateProductIds(dto.lines);
    const total = this.computeTotal(dto.lines);

    return this.prisma.$transaction(async (tx) => {
      const saleCode = await nextHumanCodeTx(tx, 'sale', 'V');
      const sale = await tx.sale.create({
        data: {
          code: saleCode,
          saleDate: new Date(dto.saleDate),
          total,
          paymentMethod: dto.paymentMethod ?? null,
          source: dto.source ?? SaleSource.MANUAL,
          mesa: dto.mesa ?? null,
          notes: dto.notes ?? null,
          userId: dto.userId ?? null,
          clientId: dto.clientId ?? null,
        },
      });
      for (const line of dto.lines) {
        const lineCode = await nextHumanCodeTx(tx, 'saleLine', 'D');
        await tx.saleLine.create({
          data: {
            code: lineCode,
            saleId: sale.id,
            productId: line.productId ?? null,
            productName: line.productName,
            lineUnit: line.lineUnit?.trim() || null,
            lineSize: line.lineSize?.trim() || null,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            costAtSale:
              line.costAtSale !== undefined
                ? new Prisma.Decimal(line.costAtSale)
                : null,
            profit:
              line.profit !== undefined
                ? new Prisma.Decimal(line.profit)
                : null,
          },
        });
      }
      return this.findOne(sale.id);
    });
  }

  /**
   * Agregado diario para la vista calendario. Devuelve, para el rango
   * [year-month-01, fin-de-mes], `{ date, count, totalCOP }` por día con
   * actividad. La agrupación usa la porción UTC de saleDate (consistente
   * con cómo se serializa `saleDateOnly` en el listado).
   */
  async getCalendar(year: number, month: number) {
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

    const rows = await this.prisma.sale.findMany({
      where: { saleDate: { gte: start, lt: end } },
      select: { saleDate: true, total: true },
    });

    const byDay = new Map<string, { count: number; total: Prisma.Decimal }>();
    for (const r of rows) {
      const day = bogotaDateKey(r.saleDate);
      const prev = byDay.get(day);
      const amount = r.total ?? new Prisma.Decimal(0);
      if (prev) {
        prev.count += 1;
        prev.total = prev.total.add(amount);
      } else {
        byDay.set(day, { count: 1, total: new Prisma.Decimal(amount) });
      }
    }

    const days = Array.from(byDay.entries())
      .map(([date, agg]) => ({
        date,
        count: agg.count,
        totalCOP: agg.total.toFixed(0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      year,
      month,
      days,
      totals: {
        count: rows.length,
        totalCOP: days
          .reduce((acc, d) => acc.add(d.totalCOP), new Prisma.Decimal(0))
          .toFixed(0),
      },
    };
  }

  async findAll(params: PaginationParams) {
    const page = Math.max(1, Math.trunc(params.page));
    const limit = Math.min(100, Math.max(1, Math.trunc(params.limit)));
    const skip = (page - 1) * limit;

    const search = params.search?.trim();
    const and: Prisma.SaleWhereInput[] = [];

    if (search?.length) {
      and.push({
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { paymentMethod: { contains: search, mode: 'insensitive' } },
          { mesa: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          {
            client: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
          {
            lines: {
              some: {
                productName: { contains: search, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }

    if (params.source) {
      and.push({ source: params.source });
    }

    const saleDate: Prisma.DateTimeFilter = {};
    if (params.dateFrom?.trim()) {
      saleDate.gte = bogotaDayBounds(params.dateFrom.trim()).from;
    }
    if (params.dateTo?.trim()) {
      saleDate.lte = bogotaDayBounds(params.dateTo.trim()).to;
    }
    if (Object.keys(saleDate).length > 0) {
      and.push({ saleDate });
    }

    const where: Prisma.SaleWhereInput =
      and.length === 0 ? {} : { AND: and };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { saleDate: 'desc' },
        include: saleListInclude,
      }),
    ]);

    return {
      data: rows.map((s) => this.formatSaleListItem(s)),
      meta: { page, limit, total, hasNextPage: skip + rows.length < total },
    };
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: saleDetailInclude,
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    return this.formatSaleDetail(sale);
  }

  async update(id: string, dto: UpdateSaleDto) {
    const existing = await this.prisma.sale.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Sale not found');
    }

    await this.prisma.sale.update({
      where: { id },
      data: {
        ...(dto.saleDate !== undefined
          ? { saleDate: new Date(dto.saleDate) }
          : {}),
        ...(dto.paymentMethod !== undefined
          ? { paymentMethod: dto.paymentMethod || null }
          : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.mesa !== undefined ? { mesa: dto.mesa || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        ...(dto.userId !== undefined ? { userId: dto.userId || null } : {}),
      },
    });

    return this.findOne(id);
  }

  async replaceLines(id: string, dto: ReplaceSaleLinesDto) {
    const existing = await this.prisma.sale.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Sale not found');
    }

    if (!dto.lines.length) {
      throw new BadRequestException('Debe haber al menos una línea');
    }

    await this.validateProductIds(dto.lines);
    const total = this.computeTotal(dto.lines);

    await this.prisma.$transaction(async (tx) => {
      await tx.saleLine.deleteMany({ where: { saleId: id } });
      for (const line of dto.lines) {
        await tx.saleLine.create({
          data: {
            saleId: id,
            productId: line.productId ?? null,
            productName: line.productName,
            lineUnit: line.lineUnit?.trim() || null,
            lineSize: line.lineSize?.trim() || null,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            costAtSale:
              line.costAtSale !== undefined
                ? new Prisma.Decimal(line.costAtSale)
                : null,
            profit:
              line.profit !== undefined
                ? new Prisma.Decimal(line.profit)
                : null,
          },
        });
      }
      await tx.sale.update({
        where: { id },
        data: { total },
      });
    });

    return this.findOne(id);
  }

  /**
   * Valores distintos en ventas: `payment_method` (legacy) y `payments.gateway`.
   */
  async listPaymentMethodsMeta() {
    const [saleMethods, gateways] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where: { paymentMethod: { not: null } },
        select: { paymentMethod: true },
        distinct: ['paymentMethod'],
      }),
      this.prisma.payment.findMany({
        select: { gateway: true },
        distinct: ['gateway'],
      }),
    ]);

    const fromSales = saleMethods
      .map((r) => r.paymentMethod?.trim())
      .filter((v): v is string => !!v?.length)
      .sort((a, b) => a.localeCompare(b, 'es'));

    const fromPayments = gateways
      .map((r) => r.gateway)
      .sort((a, b) => a.localeCompare(b, 'es'));

    return {
      salePaymentMethods: fromSales,
      paymentGateways: fromPayments,
    };
  }
}
