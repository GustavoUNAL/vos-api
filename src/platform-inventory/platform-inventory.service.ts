import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { mapInventoryItem } from './platform-inventory.mapper';

type ListOpts = {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  lot?: string;
  availability?: 'available' | 'depleted';
  belowMinimum?: boolean;
  includeStats?: boolean;
  activeOnly?: boolean;
};

const itemInclude = {
  category: true,
  purchaseLot: true,
} as const;

@Injectable()
export class PlatformInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(
    tenant: TenantContext,
    opts: Omit<ListOpts, 'page' | 'limit'>,
  ): Prisma.InventoryItemWhereInput {
    const where: Prisma.InventoryItemWhereInput = {
      companyId: tenant.companyId,
    };

    if (opts.activeOnly !== false) {
      where.active = true;
    }

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

    if (opts.lot?.trim()) {
      where.lotLabel = { contains: opts.lot.trim(), mode: 'insensitive' };
    }

    if (opts.availability === 'available') {
      where.quantity = { gt: 0 };
    } else if (opts.availability === 'depleted') {
      where.quantity = { lte: 0 };
    }

    return where;
  }

  async findAll(tenant: TenantContext, opts: ListOpts) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(Math.max(1, opts.limit), 1000);
    const skip = (page - 1) * limit;
    const where = this.buildWhere(tenant, opts);

    let rows = await this.prisma.inventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
      include: itemInclude,
    });

    if (opts.belowMinimum) {
      rows = rows.filter((row) => {
        if (row.minStock == null) return false;
        return Number(row.quantity) <= Number(row.minStock);
      });
    }

    const total = rows.length;
    const pageRows = rows.slice(skip, skip + limit);

    return {
      data: pageRows.map((row) =>
        mapInventoryItem(row, { includeStats: opts.includeStats }),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNextPage: skip + pageRows.length < total,
      },
    };
  }

  async listCategories(tenant: TenantContext) {
    const rows = await this.prisma.productCategory.findMany({
      where: { companyId: tenant.companyId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, parentId: true },
    });

    const inventorySlugs = new Set([
      'insumos',
      'licores',
      'comestibles',
      'bebidas',
      'insumos-para-cocteles',
    ]);

    const filtered = rows.filter(
      (r) =>
        inventorySlugs.has(r.slug) ||
        r.slug.includes('insumo') ||
        r.slug.includes('invent'),
    );

    const list = filtered.length > 0 ? filtered : rows;

    return list.map((row) => ({
      id: row.id,
      name: row.name.startsWith('INVENTORY::')
        ? row.name.slice('INVENTORY::'.length)
        : row.name,
      type: 'INVENTORY',
      slug: row.slug,
      parentId: row.parentId,
    }));
  }

  async findOne(
    tenant: TenantContext,
    id: string,
    includeStats?: boolean,
  ) {
    const row = await this.prisma.inventoryItem.findFirst({
      where: { id, companyId: tenant.companyId },
      include: itemInclude,
    });
    if (!row) throw new NotFoundException('Ítem de inventario no encontrado');
    return mapInventoryItem(row, { includeStats });
  }

  async create(tenant: TenantContext, dto: CreateInventoryItemDto) {
    if (dto.categoryId) {
      await this.ensureCategory(tenant, dto.categoryId);
    }

    const row = await this.prisma.inventoryItem.create({
      data: {
        companyId: tenant.companyId,
        name: dto.name.trim(),
        categoryId: dto.categoryId?.trim() || null,
        unit: dto.unit.trim(),
        unitCost: new Prisma.Decimal(dto.unitCost),
        quantity: new Prisma.Decimal(dto.quantity),
        minStock:
          dto.minStock != null ? new Prisma.Decimal(dto.minStock) : null,
        lotLabel: dto.lot?.trim() || null,
        behavior: dto.behavior ?? 'CONSUMABLE',
        active: true,
      },
      include: itemInclude,
    });

    return mapInventoryItem(row, { includeStats: true });
  }

  async update(
    tenant: TenantContext,
    id: string,
    dto: UpdateInventoryItemDto,
  ) {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Ítem de inventario no encontrado');

    if (dto.categoryId) {
      await this.ensureCategory(tenant, dto.categoryId);
    }

    const data: Prisma.InventoryItemUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }
    if (dto.unit !== undefined) data.unit = dto.unit.trim();
    if (dto.unitCost !== undefined) {
      data.unitCost = new Prisma.Decimal(dto.unitCost);
    }
    if (dto.quantity !== undefined) {
      data.quantity = new Prisma.Decimal(dto.quantity);
    }
    if (dto.minStock !== undefined) {
      data.minStock =
        dto.minStock == null ? null : new Prisma.Decimal(dto.minStock);
    }
    if (dto.lot !== undefined) {
      data.lotLabel = dto.lot?.trim() || null;
    }
    if (dto.behavior !== undefined) data.behavior = dto.behavior;
    if (dto.active !== undefined) data.active = dto.active;

    const row = await this.prisma.inventoryItem.update({
      where: { id },
      data,
      include: itemInclude,
    });

    return mapInventoryItem(row, { includeStats: true });
  }

  async remove(tenant: TenantContext, id: string) {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        recipeIngredients: { select: { id: true } },
        purchaseLotLine: { select: { id: true } },
      },
    });
    if (!existing) throw new NotFoundException('Ítem de inventario no encontrado');

    if (existing.recipeIngredients.length > 0) {
      await this.prisma.inventoryItem.update({
        where: { id },
        data: { active: false },
      });
      return { ok: true, archived: true };
    }

    if (existing.purchaseLotLine) {
      throw new BadRequestException(
        'No se puede eliminar: el ítem está ligado a una compra. Desactívalo en su lugar.',
      );
    }

    await this.prisma.inventoryItem.delete({ where: { id } });
    return { ok: true, archived: false };
  }

  private async ensureCategory(tenant: TenantContext, categoryId: string) {
    const cat = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, companyId: tenant.companyId },
    });
    if (!cat) throw new BadRequestException('Categoría no encontrada');
  }
}
