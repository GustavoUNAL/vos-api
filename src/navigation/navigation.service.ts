import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NavigationService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenu(companyId?: string) {
    let enabledModules = ['products'];

    if (companyId) {
      const rows = await this.prisma.companyModule.findMany({
        where: { companyId, isEnabled: true },
        include: { module: { select: { slug: true, name: true } } },
        orderBy: { module: { sortOrder: 'asc' } },
      });
      enabledModules = rows.map((r) => r.module.slug);
    }

    const hasProducts = enabledModules.includes('products');

    return {
      version: 3,
      platform: 'multi-tenant',
      companyId: companyId ?? null,
      enabledModules,
      sections: [
        {
          id: 'catalog',
          title: 'Catálogo',
          subtitle: 'Productos y precios por empresa',
          groups: [
            {
              id: 'catalog-items',
              title: 'Catálogo',
              items: [
                {
                  id: 'products',
                  label: 'Productos',
                  status: hasProducts ? 'ready' : 'soon',
                  endpoints: {
                    list: 'GET /products',
                    detail: 'GET /products/:id',
                    create: 'POST /products',
                    update: 'PATCH /products/:id',
                    categories: 'GET /product-categories',
                  },
                  tables: ['products', 'product_categories'],
                },
                {
                  id: 'recipes',
                  label: 'Recetas',
                  status: 'soon',
                  endpoints: {},
                  tables: [],
                },
              ],
            },
          ],
        },
        {
          id: 'operations',
          title: 'Operaciones',
          subtitle: 'Módulos en roadmap',
          groups: [
            {
              id: 'ops-items',
              title: 'Próximamente',
              items: [
                { id: 'inventory', label: 'Inventario', status: 'soon' },
                { id: 'sales', label: 'Ventas', status: 'soon' },
                { id: 'crm', label: 'CRM', status: 'soon' },
                { id: 'finance', label: 'Finanzas', status: 'soon' },
              ],
            },
          ],
        },
      ],
    };
  }
}
