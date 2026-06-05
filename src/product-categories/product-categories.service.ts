import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenant: TenantContext) {
    const rows = await this.prisma.productCategory.findMany({
      where: { companyId: tenant.companyId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      type: 'PRODUCT',
      slug: c.slug,
      parentId: c.parentId,
    }));
  }
}
