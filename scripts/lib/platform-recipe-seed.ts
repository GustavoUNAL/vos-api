import { Prisma, RecipeCostKind } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { computeRecipeUnitCostCOP } from '../../src/product-recipes/recipe-cost.math';

export const SEED_COMPANY_ID = 'seed-arandano-cafe-bar';
export const RECIPE_ADMIN_RATE = 0.3;

export type InvDef = { name: string; unit: string; unitCost: number };

export type CostLine = {
  name: string;
  lineTotalCOP: number;
  kind?: RecipeCostKind;
};

export type IngLine = {
  key: string;
  qty: number;
  unit?: string;
};

export type RecipeDef = {
  productName: string;
  ingredients: IngLine[];
  costs: CostLine[];
  expectedTotal?: number;
  recipeYield?: number;
};

export async function upsertInventoryItems(
  prisma: PrismaClient,
  companyId: string,
  inventory: Record<string, InvDef>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [key, def] of Object.entries(inventory)) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { companyId, name: def.name },
    });
    const row = existing
      ? await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: {
            unit: def.unit,
            unitCost: new Prisma.Decimal(def.unitCost),
            active: true,
          },
        })
      : await prisma.inventoryItem.create({
          data: {
            companyId,
            name: def.name,
            unit: def.unit,
            unitCost: new Prisma.Decimal(def.unitCost),
            quantity: new Prisma.Decimal(5000),
            active: true,
          },
        });
    ids.set(key, row.id);
  }
  return ids;
}

export async function upsertRecipeForProduct(
  prisma: PrismaClient,
  companyId: string,
  productId: string,
  def: RecipeDef,
  invIds: Map<string, string>,
  inventory: Record<string, InvDef>,
): Promise<number> {
  const yieldVal = def.recipeYield ?? 1;

  const recipe = await prisma.$transaction(async (tx) => {
    const existing = await tx.recipe.findFirst({
      where: { productId, companyId },
    });

    const recipeRow = existing
      ? await tx.recipe.update({
          where: { id: existing.id },
          data: {
            recipeYield: new Prisma.Decimal(yieldVal),
            adminRate: new Prisma.Decimal(RECIPE_ADMIN_RATE),
          },
        })
      : await tx.recipe.create({
          data: {
            companyId,
            productId,
            recipeYield: new Prisma.Decimal(yieldVal),
            adminRate: new Prisma.Decimal(RECIPE_ADMIN_RATE),
          },
        });

    await tx.recipeIngredient.deleteMany({ where: { recipeId: recipeRow.id } });
    await tx.recipeCost.deleteMany({ where: { recipeId: recipeRow.id } });

    for (const [idx, ing] of def.ingredients.entries()) {
      const invId = invIds.get(ing.key);
      if (!invId) throw new Error(`Inventario no definido: ${ing.key}`);
      const invDef = inventory[ing.key];
      if (!invDef) throw new Error(`Definición inventario: ${ing.key}`);
      await tx.recipeIngredient.create({
        data: {
          recipeId: recipeRow.id,
          inventoryItemId: invId,
          quantity: new Prisma.Decimal(ing.qty),
          unit: ing.unit ?? invDef.unit,
          sortOrder: idx,
        },
      });
    }

    for (const [idx, c] of def.costs.entries()) {
      await tx.recipeCost.create({
        data: {
          recipeId: recipeRow.id,
          kind: c.kind ?? RecipeCostKind.VARIABLE,
          name: c.name,
          unit: 'porción',
          lineTotalCOP: new Prisma.Decimal(c.lineTotalCOP),
          sortOrder: idx,
        },
      });
    }

    return tx.recipe.findUniqueOrThrow({
      where: { id: recipeRow.id },
      include: {
        ingredients: { include: { inventoryItem: true } },
        costs: true,
      },
    });
  });

  const unitCost = computeRecipeUnitCostCOP(recipe);
  if (unitCost == null || unitCost <= 0) {
    throw new Error(`Costo inválido para ${def.productName}`);
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      cost: new Prisma.Decimal(unitCost),
      costSource: 'RECIPE',
    },
  });

  return unitCost;
}

export async function seedRecipeBatch(
  prisma: PrismaClient,
  companyId: string,
  inventory: Record<string, InvDef>,
  recipes: RecipeDef[],
  batchLabel: string,
): Promise<void> {
  const invIds = await upsertInventoryItems(prisma, companyId, inventory);
  let ok = 0;
  const report: string[] = [];

  for (const def of recipes) {
    const product = await prisma.product.findFirst({
      where: {
        companyId,
        name: def.productName,
        status: { not: 'ARCHIVED' },
      },
    });
    if (!product) {
      report.push(`⚠ Omitido (sin producto): ${def.productName}`);
      continue;
    }

    const unitCost = await upsertRecipeForProduct(
      prisma,
      companyId,
      product.id,
      def,
      invIds,
      inventory,
    );
    ok += 1;
    const exp =
      def.expectedTotal != null ? ` (esperado ~$${def.expectedTotal})` : '';
    report.push(`✓ ${def.productName}: $${unitCost}${exp}`);
  }

  console.log(`${batchLabel}: ${ok}/${recipes.length} productos\n`);
  report.forEach((line) => console.log(line));
}
