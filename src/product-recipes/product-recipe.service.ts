import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RecipeCostKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { mapProduct } from '../products/product.mapper';
import {
  UpdateRecipeAdminDto,
  UpsertRecipeDto,
} from './dto/upsert-recipe.dto';
import {
  computeCostControls,
  computeRecipeUnitCostCOP,
} from './recipe-cost.math';
import { mapRecipeDto } from './recipe.mapper';

const recipeInclude = {
  ingredients: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      inventoryItem: { include: { category: true } },
    },
  },
  costs: { orderBy: { sortOrder: 'asc' as const } },
} as const;

@Injectable()
export class ProductRecipeService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureProduct(tenant: TenantContext, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        companyId: tenant.companyId,
        status: { not: 'ARCHIVED' },
      },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async getRecipe(tenant: TenantContext, productId: string) {
    await this.ensureProduct(tenant, productId);
    const recipe = await this.prisma.recipe.findFirst({
      where: { productId, companyId: tenant.companyId },
      include: recipeInclude,
    });
    if (!recipe) return null;
    return mapRecipeDto(recipe);
  }

  async getCostControls(tenant: TenantContext, productId: string) {
    await this.ensureProduct(tenant, productId);
    const recipe = await this.prisma.recipe.findFirst({
      where: { productId, companyId: tenant.companyId },
      include: {
        ingredients: {
          include: { inventoryItem: { select: { unitCost: true } } },
        },
        costs: true,
      },
    });
    if (!recipe) {
      return {
        adminRate: 0.3,
        materialsCOP: 0,
        servicesCOP: 0,
        baseCOP: 0,
      };
    }
    return computeCostControls(recipe);
  }

  async updateAdminRate(
    tenant: TenantContext,
    productId: string,
    dto: UpdateRecipeAdminDto,
  ) {
    const product = await this.ensureProduct(tenant, productId);
    const recipe = await this.prisma.recipe.upsert({
      where: { productId },
      create: {
        companyId: tenant.companyId,
        productId,
        adminRate: new Prisma.Decimal(dto.adminRate),
      },
      update: {
        adminRate: new Prisma.Decimal(dto.adminRate),
      },
      include: recipeInclude,
    });

    await this.syncProductCostFromRecipe(product.id, recipe);
    return mapRecipeDto(recipe);
  }

  async upsertRecipe(
    tenant: TenantContext,
    productId: string,
    dto: UpsertRecipeDto,
  ) {
    const product = await this.ensureProduct(tenant, productId);
    const ingredientIds = (dto.ingredients ?? []).map((i) => i.inventoryItemId);
    if (ingredientIds.length) {
      const count = await this.prisma.inventoryItem.count({
        where: {
          companyId: tenant.companyId,
          active: true,
          id: { in: ingredientIds },
        },
      });
      if (count !== ingredientIds.length) {
        throw new BadRequestException('Uno o más insumos no son válidos');
      }
    }

    const recipe = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.recipe.findFirst({
        where: { productId, companyId: tenant.companyId },
      });

      const recipeRow = existing
        ? await tx.recipe.update({
            where: { id: existing.id },
            data: {
              recipeYield: new Prisma.Decimal(dto.recipeYield),
            },
          })
        : await tx.recipe.create({
            data: {
              companyId: tenant.companyId,
              productId,
              recipeYield: new Prisma.Decimal(dto.recipeYield),
            },
          });

      await tx.recipeIngredient.deleteMany({ where: { recipeId: recipeRow.id } });
      await tx.recipeCost.deleteMany({ where: { recipeId: recipeRow.id } });

      if (dto.ingredients?.length) {
        await tx.recipeIngredient.createMany({
          data: dto.ingredients.map((ing, idx) => ({
            recipeId: recipeRow.id,
            inventoryItemId: ing.inventoryItemId,
            quantity: new Prisma.Decimal(ing.quantity),
            unit: ing.unit.trim() || 'und',
            sortOrder: ing.sortOrder ?? idx,
          })),
        });
      }

      if (dto.costs?.length) {
        await tx.recipeCost.createMany({
          data: dto.costs.map((c, idx) => ({
            recipeId: recipeRow.id,
            kind: c.kind as RecipeCostKind,
            name: c.name.trim(),
            quantity:
              c.quantity != null ? new Prisma.Decimal(c.quantity) : null,
            unit: c.unit.trim() || 'und',
            lineTotalCOP: new Prisma.Decimal(c.lineTotalCOP),
            sheetUnitCost: c.sheetUnitCost?.trim() || null,
            sortOrder: c.sortOrder ?? idx,
          })),
        });
      }

      return tx.recipe.findUniqueOrThrow({
        where: { id: recipeRow.id },
        include: recipeInclude,
      });
    });

    const updatedProduct = await this.syncProductCostFromRecipe(
      product.id,
      recipe,
    );

    return {
      ...mapProduct(updatedProduct),
      recipe: mapRecipeDto(recipe),
    };
  }

  private async syncProductCostFromRecipe(
    productId: string,
    recipe: {
      recipeYield: Prisma.Decimal;
      adminRate: Prisma.Decimal;
      ingredients: {
        quantity: Prisma.Decimal;
        inventoryItem: { unitCost: Prisma.Decimal };
      }[];
      costs: { name: string; lineTotalCOP: Prisma.Decimal }[];
    },
  ) {
    const unitCost = computeRecipeUnitCostCOP(recipe);
    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(unitCost != null && unitCost > 0
          ? { cost: new Prisma.Decimal(unitCost), costSource: 'RECIPE' }
          : {}),
      },
      include: { category: true },
    });
  }
}
