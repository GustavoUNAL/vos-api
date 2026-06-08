import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

type ListOpts = {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
};

@Injectable()
export class PlatformInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenant: TenantContext, opts: ListOpts) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(Math.max(1, opts.limit), 1000);
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryItemWhereInput = {
      companyId: tenant.companyId,
      active: true,
    };

    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { lotLabel: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (opts.categoryId?.trim()) {
      where.categoryId = opts.categoryId.trim();
    }

    const [total, rows] = await Promise.all([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: { category: true },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        categoryId: row.categoryId ?? '',
        quantity: row.quantity.toString(),
        unit: row.unit,
        unitCost: row.unitCost.toString(),
        lot: row.lotLabel,
        minStock: row.minStock?.toString() ?? null,
        category: row.category
          ? {
              id: row.category.id,
              name: row.category.name,
              type: 'INVENTORY',
            }
          : {
              id: 'uncategorized',
              name: 'Sin categoría',
              type: 'INVENTORY',
            },
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        total,
        hasNextPage: skip + rows.length < total,
      },
    };
  }
}
