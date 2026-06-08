import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import {
  CreatePurchaseLotDto,
  PurchaseLotLineInputDto,
  ReplacePurchaseLotLinesDto,
  UpdatePurchaseLotDto,
} from './dto/purchase-lot.dto';

type ListParams = {
  page: number;
  limit: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

const lotInclude = {
  lines: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      category: true,
      inventoryItem: true,
    },
  },
  inventoryItems: {
    where: { active: true },
    include: { category: true },
  },
} as const;

function lineTotalCOP(line: PurchaseLotLineInputDto): number {
  if (line.lineTotalCOP != null && line.lineTotalCOP >= 0) {
    return Math.round(line.lineTotalCOP);
  }
  return Math.round(line.quantityPurchased * line.purchaseUnitCostCOP);
}

function formatLotDisplayName(
  supplier: string | null,
  purchaseDate: Date,
  code: string,
  name: string | null,
): string {
  if (name?.trim()) return name.trim();
  const day = purchaseDate.toISOString().slice(0, 10);
  if (supplier?.trim()) return `${supplier.trim()} · ${day}`;
  return code;
}

@Injectable()
export class PlatformPurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextLotCode(
    tenant: TenantContext,
    purchaseDate: Date,
  ): Promise<string> {
    const day = purchaseDate.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `C-${day}-`;
    const existing = await this.prisma.purchaseLot.count({
      where: {
        companyId: tenant.companyId,
        code: { startsWith: prefix },
      },
    });
    return `${prefix}${String(existing + 1).padStart(3, '0')}`;
  }

  private formatListRow(
    lot: Prisma.PurchaseLotGetPayload<{ include: { lines: true } }>,
  ) {
    const displayName = formatLotDisplayName(
      lot.supplier,
      lot.purchaseDate,
      lot.code,
      lot.name,
    );
    return {
      id: lot.id,
      code: lot.code,
      name: lot.name,
      displayName,
      purchaseDate: lot.purchaseDate.toISOString(),
      supplier: lot.supplier,
      notes: lot.notes,
      itemCount: lot.itemCount,
      totalValue: lot.totalValue?.toString() ?? null,
      createdAt: lot.createdAt.toISOString(),
      updatedAt: lot.updatedAt.toISOString(),
    };
  }

  private formatDetail(
    lot: Prisma.PurchaseLotGetPayload<{ include: typeof lotInclude }>,
  ) {
    const purchaseLines = lot.lines.map((ln) => ({
      id: ln.id,
      inventoryItemId: ln.inventoryItemId,
      lineName: ln.lineName,
      categoryId: ln.categoryId,
      categoryName: ln.category?.name ?? null,
      quantityPurchased: ln.quantityPurchased.toString(),
      unit: ln.unit,
      purchaseUnitCostCOP: ln.purchaseUnitCostCOP.toString(),
      lineTotalCOP: ln.lineTotalCOP.toString(),
      lineComment: ln.lineComment,
      sortOrder: ln.sortOrder,
    }));

    const items = lot.inventoryItems.map((inv) => {
      const line = lot.lines.find((l) => l.inventoryItemId === inv.id);
      return {
        id: inv.id,
        name: inv.name,
        categoryName: inv.category?.name ?? null,
        quantity: inv.quantity.toString(),
        unit: inv.unit,
        unitCost: inv.unitCost.toString(),
        inventoryBehavior: inv.behavior,
        purchaseLineId: line?.id ?? null,
        purchase: line
          ? {
              purchaseUnitCostCOP: line.purchaseUnitCostCOP.toString(),
              linePurchaseTotalCOP: line.lineTotalCOP.toString(),
            }
          : null,
      };
    });

    return {
      ...this.formatListRow(lot),
      purchaseLines,
      items,
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

    const rows = await this.prisma.purchaseLot.findMany({
      where: {
        companyId: tenant.companyId,
        purchaseDate: { gte: start, lt: end },
      },
      select: { purchaseDate: true, totalValue: true },
    });

    const byDay = new Map<string, { count: number; total: Prisma.Decimal }>();
    for (const r of rows) {
      const day = r.purchaseDate.toISOString().slice(0, 10);
      const amount = r.totalValue ?? new Prisma.Decimal(0);
      const prev = byDay.get(day);
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

  async findAll(tenant: TenantContext, params: ListParams) {
    const page = Math.max(1, params.page);
    const limit = Math.min(100, Math.max(1, params.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseLotWhereInput = {
      companyId: tenant.companyId,
    };

    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { supplier: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (params.dateFrom?.trim() || params.dateTo?.trim()) {
      const purchaseDate: Prisma.DateTimeFilter = {};
      if (params.dateFrom?.trim()) {
        purchaseDate.gte = new Date(params.dateFrom.trim());
      }
      if (params.dateTo?.trim()) {
        const end = new Date(params.dateTo.trim());
        end.setHours(23, 59, 59, 999);
        purchaseDate.lte = end;
      }
      where.purchaseDate = purchaseDate;
    }

    const [total, rows] = await Promise.all([
      this.prisma.purchaseLot.count({ where }),
      this.prisma.purchaseLot.findMany({
        where,
        orderBy: { purchaseDate: 'desc' },
        skip,
        take: limit,
        include: { lines: true },
      }),
    ]);

    return {
      data: rows.map((r) => this.formatListRow(r)),
      meta: { page, limit, total, hasNextPage: skip + rows.length < total },
    };
  }

  async findOne(tenant: TenantContext, id: string) {
    const lot = await this.prisma.purchaseLot.findFirst({
      where: { id, companyId: tenant.companyId },
      include: lotInclude,
    });
    if (!lot) throw new NotFoundException('Lote de compra no encontrado');
    return this.formatDetail(lot);
  }

  private async persistLines(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
    lotId: string,
    lotCode: string,
    lines: PurchaseLotLineInputDto[],
  ) {
    let sum = 0;
    const createdInventoryIds: string[] = [];

    for (const [idx, line] of lines.entries()) {
      const total = lineTotalCOP(line);
      sum += total;

      let inventoryItemId = line.inventoryItemId?.trim() || null;
      if (inventoryItemId) {
        const inv = await tx.inventoryItem.findFirst({
          where: { id: inventoryItemId, companyId: tenant.companyId },
        });
        if (!inv) {
          throw new BadRequestException('Insumo inválido en línea de compra');
        }
      } else {
        const inv = await tx.inventoryItem.create({
          data: {
            companyId: tenant.companyId,
            categoryId: line.categoryId?.trim() || null,
            name: line.lineName.trim(),
            unit: line.unit.trim() || 'und',
            unitCost: new Prisma.Decimal(line.purchaseUnitCostCOP),
            quantity: new Prisma.Decimal(line.quantityPurchased),
            lotLabel: lotCode,
            purchaseLotId: lotId,
            active: true,
          },
        });
        inventoryItemId = inv.id;
        createdInventoryIds.push(inv.id);
      }

      await tx.purchaseLotLine.create({
        data: {
          companyId: tenant.companyId,
          purchaseLotId: lotId,
          inventoryItemId,
          categoryId: line.categoryId?.trim() || null,
          lineName: line.lineName.trim(),
          quantityPurchased: new Prisma.Decimal(line.quantityPurchased),
          unit: line.unit.trim() || 'und',
          purchaseUnitCostCOP: new Prisma.Decimal(line.purchaseUnitCostCOP),
          lineTotalCOP: new Prisma.Decimal(total),
          lineComment: line.lineComment?.trim() || null,
          sortOrder: line.sortOrder ?? idx,
        },
      });

      if (inventoryItemId && !createdInventoryIds.includes(inventoryItemId)) {
        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: { purchaseLotId: lotId, lotLabel: lotCode },
        });
      }
    }

    return sum;
  }

  async createManual(tenant: TenantContext, dto: CreatePurchaseLotDto) {
    const purchaseDate = new Date(dto.purchaseDate.trim());
    if (Number.isNaN(purchaseDate.getTime())) {
      throw new BadRequestException('Fecha de compra inválida.');
    }
    const code = await this.nextLotCode(tenant, purchaseDate);
    const supplier = dto.supplier?.trim() || null;
    const name = supplier
      ? `${supplier} · ${purchaseDate.toISOString().slice(0, 10)}`
      : null;

    const lot = await this.prisma.$transaction(async (tx) => {
      const row = await tx.purchaseLot.create({
        data: {
          companyId: tenant.companyId,
          code,
          name,
          purchaseDate,
          supplier,
          notes: dto.notes?.trim() || null,
        },
      });

      let totalValue = dto.totalValue ?? 0;
      if (dto.lines?.length) {
        totalValue = await this.persistLines(
          tx,
          tenant,
          row.id,
          code,
          dto.lines,
        );
      }

      const itemCount = dto.lines?.length ?? 0;
      return tx.purchaseLot.update({
        where: { id: row.id },
        data: {
          totalValue: new Prisma.Decimal(Math.round(totalValue)),
          itemCount,
        },
        include: lotInclude,
      });
    });

    return this.formatDetail(lot);
  }

  async update(
    tenant: TenantContext,
    id: string,
    dto: UpdatePurchaseLotDto,
  ) {
    const existing = await this.prisma.purchaseLot.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Lote de compra no encontrado');

    const data: Prisma.PurchaseLotUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name?.trim() || null;
    if (dto.purchaseDate !== undefined) {
      const purchaseDate = new Date(dto.purchaseDate);
      if (Number.isNaN(purchaseDate.getTime())) {
        throw new BadRequestException('Fecha de compra inválida.');
      }
      data.purchaseDate = purchaseDate;
    }
    if (dto.supplier !== undefined) data.supplier = dto.supplier?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.comment !== undefined) data.notes = dto.comment?.trim() || null;
    if (dto.totalValue !== undefined) {
      data.totalValue = new Prisma.Decimal(dto.totalValue);
    }

    await this.prisma.purchaseLot.update({ where: { id }, data });
    return this.findOne(tenant, id);
  }

  async replacePurchaseLotLines(
    tenant: TenantContext,
    id: string,
    dto: ReplacePurchaseLotLinesDto,
  ) {
    const existing = await this.prisma.purchaseLot.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Lote de compra no encontrado');

    const lot = await this.prisma.$transaction(async (tx) => {
      await tx.purchaseLotLine.deleteMany({ where: { purchaseLotId: id } });
      const sum = await this.persistLines(
        tx,
        tenant,
        id,
        existing.code,
        dto.lines,
      );
      const totalValue =
        dto.expectedTotalValueCOP != null
          ? Math.round(dto.expectedTotalValueCOP)
          : sum;
      return tx.purchaseLot.update({
        where: { id },
        data: {
          totalValue: new Prisma.Decimal(totalValue),
          itemCount: dto.lines.length,
        },
        include: lotInclude,
      });
    });

    return this.formatDetail(lot);
  }

  async listDistinctSuppliers(tenant: TenantContext) {
    const rows = await this.prisma.purchaseLot.findMany({
      where: {
        companyId: tenant.companyId,
        supplier: { not: null },
      },
      select: { supplier: true },
      distinct: ['supplier'],
      orderBy: { supplier: 'asc' },
    });
    return {
      suppliers: rows
        .map((r) => r.supplier?.trim())
        .filter((v): v is string => !!v?.length),
    };
  }
}
