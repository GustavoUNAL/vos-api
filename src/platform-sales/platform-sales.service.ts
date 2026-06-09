import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SaleSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import {
  CreateSaleDto,
  ReplaceSaleLinesDto,
  SaleLineInputDto,
  UpdateSaleDto,
} from './dto/sale.dto';
import {
  buildSaleInvoicePdf,
  formatSaleReceiptText,
} from './sale-invoice.pdf';
import { WhatsappService } from './whatsapp.service';

type ListParams = {
  page: number;
  limit: number;
  search?: string;
  source?: SaleSource;
  dateFrom?: string;
  dateTo?: string;
};

const saleListInclude = {
  user: { select: { id: true, name: true, email: true } },
  _count: { select: { lines: true } },
} as const;

const saleDetailInclude = {
  user: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { productName: 'asc' as const },
    include: {
      product: {
        include: { category: true },
      },
    },
  },
} as const;

function decStr(v: Prisma.Decimal | null | undefined, digits = 2): string | null {
  if (v == null) return null;
  return Number(v).toFixed(digits);
}

@Injectable()
export class PlatformSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private async nextSaleCode(companyId: string): Promise<string> {
    const count = await this.prisma.sale.count({ where: { companyId } });
    return `V${String(count + 1).padStart(4, '0')}`;
  }

  private computeTotal(lines: SaleLineInputDto[]): Prisma.Decimal {
    let sum = 0;
    for (const line of lines) {
      sum += line.quantity * line.unitPrice;
    }
    return new Prisma.Decimal(Math.round(sum));
  }

  private async validateProductIds(
    tenant: TenantContext,
    lines: SaleLineInputDto[],
  ) {
    const ids = [
      ...new Set(lines.map((l) => l.productId?.trim()).filter(Boolean)),
    ] as string[];
    if (!ids.length) return;
    const count = await this.prisma.product.count({
      where: {
        companyId: tenant.companyId,
        id: { in: ids },
        status: { not: 'ARCHIVED' },
      },
    });
    if (count !== ids.length) {
      throw new BadRequestException('Uno o más productos no son válidos');
    }
  }

  private async loadProductCosts(
    tenant: TenantContext,
    lines: SaleLineInputDto[],
  ) {
    const ids = [
      ...new Set(lines.map((l) => l.productId?.trim()).filter(Boolean)),
    ] as string[];
    if (!ids.length) return new Map<string, Prisma.Decimal>();
    const rows = await this.prisma.product.findMany({
      where: { companyId: tenant.companyId, id: { in: ids } },
      select: { id: true, cost: true },
    });
    return new Map(rows.map((r) => [r.id, r.cost]));
  }

  private formatListRow(
    sale: Prisma.SaleGetPayload<{ include: typeof saleListInclude }>,
  ) {
    const totalNum = Number(sale.total.toString());
    return {
      id: sale.id,
      code: sale.code ?? sale.id,
      saleDate: sale.saleDate.toISOString(),
      saleDateOnly: sale.saleDate.toISOString().slice(0, 10),
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      total: totalNum,
      totalCOP: decStr(sale.total, 2),
      paymentMethod: sale.paymentMethod,
      source: sale.source,
      mesa: sale.mesa,
      customerPhone: sale.customerPhone,
      notes: sale.notes,
      userId: sale.userId,
      displayPerson: sale.user?.name ?? '—',
      recordedByUserId: sale.userId,
      recordedByName: sale.user?.name ?? null,
      lineCount: sale._count.lines,
      user: sale.user
        ? {
            id: sale.user.id,
            name: sale.user.name,
            email: sale.user.email,
          }
        : null,
    };
  }

  private formatDetail(
    sale: Prisma.SaleGetPayload<{ include: typeof saleDetailInclude }>,
  ) {
    const lines = sale.lines.map((ln) => {
      const subtotal = ln.quantity.mul(ln.unitPrice);
      return {
        id: ln.id,
        productId: ln.productId,
        productName: ln.productName,
        lineUnit: ln.lineUnit,
        lineSize: ln.lineSize,
        quantity: ln.quantity.toString(),
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
              type: ln.product.category.slug,
              priceCOP: decStr(ln.product.salePrice, 2),
              imageUrl: ln.product.primaryImageUrl,
              active: ln.product.status === 'ACTIVE',
              category: {
                id: ln.product.category.id,
                name: ln.product.category.name,
                type: 'PRODUCT',
                slug: ln.product.category.slug,
              },
            }
          : null,
      };
    });

    return {
      ...this.formatListRow({
        ...sale,
        _count: { lines: sale.lines.length },
      }),
      lines,
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
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const rows = await this.prisma.sale.findMany({
      where: {
        companyId: tenant.companyId,
        saleDate: { gte: start, lt: end },
      },
      select: { saleDate: true, total: true },
    });

    const byDay = new Map<string, { count: number; total: Prisma.Decimal }>();
    for (const r of rows) {
      const day = r.saleDate.toISOString().slice(0, 10);
      const prev = byDay.get(day);
      if (prev) {
        prev.count += 1;
        prev.total = prev.total.add(r.total);
      } else {
        byDay.set(day, { count: 1, total: new Prisma.Decimal(r.total) });
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

  async findAll(tenant: TenantContext, params: ListParams) {
    const page = Math.max(1, params.page);
    const limit = Math.min(100, Math.max(1, params.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = { companyId: tenant.companyId };

    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { paymentMethod: { contains: q, mode: 'insensitive' } },
        { mesa: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { lines: { some: { productName: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    if (params.source) where.source = params.source;

    if (params.dateFrom?.trim() || params.dateTo?.trim()) {
      const saleDate: Prisma.DateTimeFilter = {};
      if (params.dateFrom?.trim()) {
        saleDate.gte = new Date(`${params.dateFrom.trim()}T00:00:00.000Z`);
      }
      if (params.dateTo?.trim()) {
        saleDate.lte = new Date(`${params.dateTo.trim()}T23:59:59.999Z`);
      }
      where.saleDate = saleDate;
    }

    const [total, rows] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        orderBy: { saleDate: 'desc' },
        skip,
        take: limit,
        include: saleListInclude,
      }),
    ]);

    return {
      data: rows.map((r) => this.formatListRow(r)),
      meta: { page, limit, total, hasNextPage: skip + rows.length < total },
    };
  }

  async findOne(tenant: TenantContext, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, companyId: tenant.companyId },
      include: saleDetailInclude,
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return this.formatDetail(sale);
  }

  async create(tenant: TenantContext, dto: CreateSaleDto) {
    await this.validateProductIds(tenant, dto.lines);
    const costs = await this.loadProductCosts(tenant, dto.lines);
    const saleDate = new Date(dto.saleDate);
    if (Number.isNaN(saleDate.getTime())) {
      throw new BadRequestException('Fecha de venta inválida');
    }
    const code = await this.nextSaleCode(tenant.companyId);
    const total = this.computeTotal(dto.lines);

    const sale = await this.prisma.$transaction(async (tx) => {
      const row = await tx.sale.create({
        data: {
          companyId: tenant.companyId,
          code,
          saleDate,
          total,
          paymentMethod: dto.paymentMethod?.trim() || null,
          source: dto.source ?? SaleSource.MANUAL,
          userId: tenant.userId,
          mesa: dto.mesa?.trim() || null,
          customerPhone: dto.customerPhone?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      for (const line of dto.lines) {
        const productId = line.productId?.trim() || null;
        const unitCost = productId ? costs.get(productId) : undefined;
        const costAtSale =
          line.costAtSale != null
            ? new Prisma.Decimal(line.costAtSale)
            : unitCost != null
              ? new Prisma.Decimal(unitCost)
              : null;
        const lineTotal = line.quantity * line.unitPrice;
        const profit =
          line.profit != null
            ? new Prisma.Decimal(line.profit)
            : costAtSale != null
              ? new Prisma.Decimal(
                  Math.round(lineTotal - Number(costAtSale) * line.quantity),
                )
              : null;

        await tx.saleLine.create({
          data: {
            saleId: row.id,
            productId,
            productName: line.productName.trim(),
            lineUnit: line.lineUnit?.trim() || null,
            lineSize: line.lineSize?.trim() || null,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            costAtSale,
            profit,
          },
        });
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: row.id },
        include: saleDetailInclude,
      });
    });

    const detail = this.formatDetail(sale);
    const phone = dto.customerPhone?.trim();
    let whatsappSent = false;
    if (phone) {
      const company = await this.prisma.company.findUnique({
        where: { id: tenant.companyId },
        select: { name: true },
      });
      const receiptSale = {
        ...sale,
        company: { name: company?.name ?? 'Tu empresa' },
      };
      whatsappSent = await this.whatsapp.sendSaleReceipt(
        phone,
        formatSaleReceiptText(receiptSale),
        {
          saleDate: sale.saleDate,
          total: Number(sale.total),
          code: sale.code,
          companyName: company?.name ?? 'Tu empresa',
        },
      );
    }

    return {
      ...detail,
      whatsappSent,
      whatsappConfigured: this.whatsapp.isConfigured(),
    };
  }

  async update(tenant: TenantContext, id: string, dto: UpdateSaleDto) {
    const existing = await this.prisma.sale.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Venta no encontrada');

    const data: Prisma.SaleUpdateInput = {};
    if (dto.saleDate !== undefined) {
      const saleDate = new Date(dto.saleDate);
      if (Number.isNaN(saleDate.getTime())) {
        throw new BadRequestException('Fecha de venta inválida');
      }
      data.saleDate = saleDate;
    }
    if (dto.paymentMethod !== undefined) {
      data.paymentMethod = dto.paymentMethod?.trim() || null;
    }
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.mesa !== undefined) data.mesa = dto.mesa?.trim() || null;
    if (dto.customerPhone !== undefined) {
      data.customerPhone = dto.customerPhone?.trim() || null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;

    await this.prisma.sale.update({ where: { id }, data });
    return this.findOne(tenant, id);
  }

  async replaceLines(
    tenant: TenantContext,
    id: string,
    dto: ReplaceSaleLinesDto,
  ) {
    const existing = await this.prisma.sale.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Venta no encontrada');

    await this.validateProductIds(tenant, dto.lines);
    const costs = await this.loadProductCosts(tenant, dto.lines);
    const total = this.computeTotal(dto.lines);

    await this.prisma.$transaction(async (tx) => {
      await tx.saleLine.deleteMany({ where: { saleId: id } });
      for (const line of dto.lines) {
        const productId = line.productId?.trim() || null;
        const unitCost = productId ? costs.get(productId) : undefined;
        const costAtSale =
          line.costAtSale != null
            ? new Prisma.Decimal(line.costAtSale)
            : unitCost != null
              ? new Prisma.Decimal(unitCost)
              : null;
        const lineTotal = line.quantity * line.unitPrice;
        const profit =
          line.profit != null
            ? new Prisma.Decimal(line.profit)
            : costAtSale != null
              ? new Prisma.Decimal(
                  Math.round(lineTotal - Number(costAtSale) * line.quantity),
                )
              : null;

        await tx.saleLine.create({
          data: {
            saleId: id,
            productId,
            productName: line.productName.trim(),
            lineUnit: line.lineUnit?.trim() || null,
            lineSize: line.lineSize?.trim() || null,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            costAtSale,
            profit,
          },
        });
      }
      await tx.sale.update({ where: { id }, data: { total } });
    });

    return this.findOne(tenant, id);
  }

  async listPaymentMethodsMeta(tenant: TenantContext) {
    const rows = await this.prisma.sale.findMany({
      where: {
        companyId: tenant.companyId,
        paymentMethod: { not: null },
      },
      select: { paymentMethod: true },
      distinct: ['paymentMethod'],
    });
    return {
      salePaymentMethods: rows
        .map((r) => r.paymentMethod?.trim())
        .filter((v): v is string => !!v?.length)
        .sort((a, b) => a.localeCompare(b, 'es')),
      paymentGateways: [],
    };
  }

  private async loadSaleForInvoice(tenant: TenantContext, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        lines: { orderBy: { productName: 'asc' } },
        company: { select: { name: true, address: true, phone: true, email: true } },
        user: { select: { name: true, email: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  async getInvoicePdf(tenant: TenantContext, id: string): Promise<Buffer> {
    const sale = await this.loadSaleForInvoice(tenant, id);
    return buildSaleInvoicePdf(sale);
  }

  async getInvoiceReceiptText(tenant: TenantContext, id: string): Promise<string> {
    const sale = await this.loadSaleForInvoice(tenant, id);
    return formatSaleReceiptText(sale);
  }

  async sendReceiptWhatsApp(tenant: TenantContext, id: string) {
    const sale = await this.loadSaleForInvoice(tenant, id);
    const phone = sale.customerPhone?.trim();
    if (!phone) {
      throw new BadRequestException(
        'Agregá el celular del cliente en la venta para enviar WhatsApp.',
      );
    }
    const whatsappSent = await this.whatsapp.sendSaleReceipt(
      phone,
      formatSaleReceiptText(sale),
      {
        saleDate: sale.saleDate,
        total: Number(sale.total),
        code: sale.code,
        companyName: sale.company.name,
      },
    );
    return {
      whatsappSent,
      whatsappConfigured: this.whatsapp.isConfigured(),
    };
  }
}
