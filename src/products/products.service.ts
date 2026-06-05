import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { activeToStatus, mapProduct } from './product.mapper';

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
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return {
      ...mapProduct(product),
      images: product.images,
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
    if (dto.sku !== undefined) data.sku = dto.sku?.trim() || null;
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

  async remove(tenant: TenantContext, id: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado');

    await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED },
    });

    return { ok: true };
  }
}
