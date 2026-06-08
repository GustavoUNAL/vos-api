import { Injectable } from '@nestjs/common';
import { RecipeCostKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformRecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCatalog(companyId: string, categoryId?: string) {
    const rows = await this.prisma.recipe.findMany({
      where: {
        companyId,
        product: {
          status: { not: 'ARCHIVED' },
          ...(categoryId?.trim().length
            ? { categoryId: categoryId.trim() }
            : {}),
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            status: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        },
        ingredients: {
          select: {
            inventoryItem: {
              select: {
                quantity: true,
                minStock: true,
                active: true,
              },
            },
          },
        },
        _count: { select: { costs: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    return rows.map((r) => {
      let depletedMaterialCount = 0;
      let lowStockMaterialCount = 0;
      for (const row of r.ingredients) {
        const inv = row.inventoryItem;
        if (!inv.active) continue;
        const qty = Number(inv.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          depletedMaterialCount += 1;
          continue;
        }
        const min = inv.minStock != null ? Number(inv.minStock) : null;
        if (min != null && Number.isFinite(min) && qty <= min) {
          lowStockMaterialCount += 1;
        }
      }
      return {
        productId: r.productId,
        productName: r.product.name,
        productActive: r.product.status === 'ACTIVE',
        productType: r.product.category?.name ?? null,
        categoryId: r.product.categoryId,
        categoryName: r.product.category?.name ?? null,
        recipeYield: r.recipeYield.toString(),
        ingredientCount: r.ingredients.length,
        costLineCount: r._count.costs,
        depletedMaterialCount,
        lowStockMaterialCount,
      };
    });
  }

  async listRecipeCosts(companyId: string) {
    const rows = await this.prisma.recipeCost.findMany({
      where: {
        recipe: {
          companyId,
          product: { status: { not: 'ARCHIVED' } },
        },
      },
      include: {
        recipe: {
          select: {
            id: true,
            productId: true,
            product: {
              select: {
                name: true,
                status: true,
                categoryId: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [
        { recipe: { product: { name: 'asc' } } },
        { kind: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    let sumFixed = 0;
    let sumVar = 0;
    const flatRows = rows.map((c) => {
      const v = Number(c.lineTotalCOP);
      if (c.kind === RecipeCostKind.FIJO && Number.isFinite(v)) sumFixed += v;
      if (c.kind === RecipeCostKind.VARIABLE && Number.isFinite(v)) sumVar += v;
      return {
        id: c.id,
        recipeId: c.recipeId,
        productId: c.recipe.productId,
        productName: c.recipe.product.name,
        productActive: c.recipe.product.status === 'ACTIVE',
        productType: c.recipe.product.category?.name ?? null,
        categoryId: c.recipe.product.categoryId ?? null,
        categoryName: c.recipe.product.category?.name ?? null,
        kind: c.kind,
        name: c.name,
        quantity: c.quantity?.toString() ?? null,
        unit: c.unit,
        lineTotalCOP: c.lineTotalCOP.toFixed(0),
        sheetUnitCost: c.sheetUnitCost ?? null,
        sortOrder: c.sortOrder,
      };
    });

    return {
      products: [],
      rows: flatRows,
      totals: {
        fixedCOP: sumFixed.toFixed(0),
        variableCOP: sumVar.toFixed(0),
        totalCOP: (sumFixed + sumVar).toFixed(0),
      },
    };
  }
}
