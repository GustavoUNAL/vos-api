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
    const hasSales = enabledModules.includes('sales');
    const hasPurchases = enabledModules.includes('purchases');

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
                  status: hasProducts ? 'ready' : 'soon',
                  endpoints: {
                    catalog: 'GET /recipes',
                    productRecipe: 'GET /products/:id/recipe',
                  },
                  tables: ['recipes', 'recipe_ingredients', 'recipe_costs'],
                },
              ],
            },
          ],
        },
        {
          id: 'sales',
          title: 'Ventas',
          subtitle: 'Registro diario y calendario',
          groups: [
            {
              id: 'sales-items',
              title: 'Ventas',
              items: [
                {
                  id: 'sales',
                  label: 'Ventas',
                  status: hasSales ? 'ready' : 'soon',
                  endpoints: {
                    list: 'GET /sales',
                    calendar: 'GET /sales/calendar',
                    detail: 'GET /sales/:id',
                    create: 'POST /sales',
                  },
                  tables: ['sales', 'sale_lines'],
                },
              ],
            },
          ],
        },
        {
          id: 'purchases',
          title: 'Compras',
          subtitle: 'Lotes, proveedores e insumos',
          groups: [
            {
              id: 'purchases-items',
              title: 'Compras',
              items: [
                {
                  id: 'purchases',
                  label: 'Compras',
                  status: hasPurchases ? 'ready' : 'soon',
                  endpoints: {
                    list: 'GET /purchase-lots',
                    calendar: 'GET /purchase-lots/calendar',
                    detail: 'GET /purchase-lots/:id',
                    create: 'POST /purchase-lots',
                  },
                  tables: [
                    'purchase_lots',
                    'purchase_lot_lines',
                    'inventory_items',
                  ],
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
