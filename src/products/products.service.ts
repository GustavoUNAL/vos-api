import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { activeToStatus, mapProduct } from './product.mapper';
import { mapRecipeDto } from '../product-recipes/recipe.mapper';

type ListOpts = {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  active?: boolean;
  type?: string;
  sort?: 'name' | 'price_asc' | 'price_desc';
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private productInclude = {
    category: true,
  } as const;

  private async ensureCategory(companyId: string, categoryId: string) {
    const cat = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, companyId, active: true },
    });
    if (!cat) {
      throw new BadRequestException('Categoría inválida para esta empresa');
    }
    return cat;
  }

  async create(tenant: TenantContext, dto: CreateProductDto) {
    await this.ensureCategory(tenant.companyId, dto.categoryId);

    const product = await this.prisma.product.create({
      data: {
        companyId: tenant.companyId,
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? '',
        salePrice: new Prisma.Decimal(dto.price),
        cost: new Prisma.Decimal(dto.cost ?? 0),
        costSource: dto.costSource ?? 'MANUAL',
        sku: dto.sku?.trim() || null,
        internalCode: dto.internalCode?.trim() || null,
        primaryImageUrl: dto.imageUrl?.trim() || null,
        status: activeToStatus(dto.active ?? true),
      },
      include: this.productInclude,
    });

    return mapProduct(product);
  }

  async findAll(tenant: TenantContext, opts: ListOpts) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(Math.max(1, opts.limit), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      companyId: tenant.companyId,
      status: { not: 'ARCHIVED' },
    };

    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { internalCode: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (opts.categoryId?.trim()) {
      where.categoryId = opts.categoryId.trim();
    }

    if (opts.type?.trim()) {
      where.category = { slug: opts.type.trim() };
    }

    if (opts.active === true) {
      where.status = 'ACTIVE';
    } else if (opts.active === false) {
      where.status = { in: ['INACTIVE', 'DRAFT'] };
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput = { name: 'asc' };
    if (opts.sort === 'price_asc') orderBy = { salePrice: 'asc' };
    if (opts.sort === 'price_desc') orderBy = { salePrice: 'desc' };

    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: this.productInclude,
      }),
    ]);

    return {
      data: rows.map(mapProduct),
      meta: {
        page,
        limit,
        total,
        hasNextPage: skip + rows.length < total,
      },
    };
  }

  async findOne(tenant: TenantContext, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId: tenant.companyId, status: { not: 'ARCHIVED' } },
      include: {
        ...this.productInclude,
        images: { orderBy: { sortOrder: 'asc' } },
        recipe: {
          include: {
            ingredients: {
              orderBy: { sortOrder: 'asc' },
              include: {
                inventoryItem: { include: { category: true } },
              },
            },
            costs: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const { recipe, images, ...rest } = product;
    return {
      ...mapProduct(rest),
      images,
      ...(recipe ? { recipe: mapRecipeDto(recipe) } : {}),
    };
  }

  async update(tenant: TenantContext, id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: { id, companyId: tenant.companyId, status: { not: 'ARCHIVED' } },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado');

    if (dto.categoryId) {
      await this.ensureCategory(tenant.companyId, dto.categoryId);
    }

    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.categoryId !== undefined) {
      data.category = { connect: { id: dto.categoryId } };
    }
    if (dto.price !== undefined) data.salePrice = new Prisma.Decimal(dto.price);
    if (dto.cost !== undefined) data.cost = new Prisma.Decimal(dto.cost);
    if (dto.costSource !== undefined) data.costSource = dto.costSource;
    if (dto.sku !== undefined) {
      const nextSku = dto.sku?.trim() || null;
      const currentSku = existing.sku?.trim() || null;
      if (nextSku !== currentSku) {
        throw new BadRequestException(
          'El código del producto no se puede modificar después de crearlo.',
        );
      }
    }
    if (dto.internalCode !== undefined) {
      data.internalCode = dto.internalCode?.trim() || null;
    }
    if (dto.imageUrl !== undefined) {
      data.primaryImageUrl = dto.imageUrl?.trim() || null;
    }
    if (dto.active !== undefined) data.status = activeToStatus(dto.active);

    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: this.productInclude,
    });

    return mapProduct(product);
  }

  async getSalesStats(tenant: TenantContext) {
    const [byProductId, byNameMatch] = await Promise.all([
      this.prisma.$queryRaw<
        {
          product_id: string;
          units_sold: Prisma.Decimal;
          revenue: Prisma.Decimal;
        }[]
      >`
        SELECT
          sl.product_id,
          SUM(sl.quantity) AS units_sold,
          SUM(sl.quantity * sl.unit_price) AS revenue
        FROM sale_lines sl
        INNER JOIN sales s ON s.id = sl.sale_id
        INNER JOIN products p ON p.id = sl.product_id AND p.status = 'ACTIVE'
        WHERE s.company_id = ${tenant.companyId}
          AND sl.product_id IS NOT NULL
        GROUP BY sl.product_id
      `,
      this.prisma.$queryRaw<
        {
          product_id: string;
          units_sold: Prisma.Decimal;
          revenue: Prisma.Decimal;
        }[]
      >`
        SELECT
          p.id AS product_id,
          SUM(sl.quantity) AS units_sold,
          SUM(sl.quantity * sl.unit_price) AS revenue
        FROM sale_lines sl
        INNER JOIN sales s ON s.id = sl.sale_id
        INNER JOIN products p ON p.company_id = s.company_id
          AND p.status = 'ACTIVE'
          AND (
            LOWER(TRIM(sl.product_name)) = LOWER(TRIM(p.name))
            OR (
              LOWER(TRIM(p.name)) = 'hervido'
              AND (
                LOWER(TRIM(sl.product_name)) LIKE '%hervido%'
                OR LOWER(TRIM(sl.product_name)) LIKE '%cóctel de fruta%'
                OR LOWER(TRIM(sl.product_name)) LIKE '%coctel de fruta%'
                OR LOWER(TRIM(sl.product_name)) LIKE '%fruta de temporada%'
              )
            )
          )
        WHERE s.company_id = ${tenant.companyId}
          AND sl.product_id IS NULL
        GROUP BY p.id
      `,
    ]);

    const merged = new Map<string, { unitsSold: number; revenue: number }>();
    for (const row of [...byProductId, ...byNameMatch]) {
      const prev = merged.get(row.product_id) ?? { unitsSold: 0, revenue: 0 };
      merged.set(row.product_id, {
        unitsSold: prev.unitsSold + Number(row.units_sold),
        revenue: prev.revenue + Number(row.revenue),
      });
    }

    return [...merged.entries()]
      .map(([productId, stat]) => ({
        productId,
        unitsSold: stat.unitsSold,
        revenue: stat.revenue,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold);
  }

  async remove(tenant: TenantContext, id: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado');

    await this.prisma.$transaction(async (tx) => {
      // Recipe, imágenes e insumos de receta se eliminan en cascada.
      // Líneas de venta conservan product_name y desvinculan product_id (SetNull).
      await tx.product.delete({ where: { id } });
    });

    return { ok: true, deleted: true, id: existing.id, name: existing.name };
  }
}
