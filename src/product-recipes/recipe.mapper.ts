import type {
  InventoryItem,
  ProductCategory,
  Recipe,
  RecipeCost,
  RecipeIngredient,
} from '@prisma/client';

type RecipeWithRelations = Recipe & {
  ingredients: (RecipeIngredient & {
    inventoryItem: InventoryItem & { category: ProductCategory | null };
  })[];
  costs: RecipeCost[];
};

function stockStatusForItem(item: InventoryItem): string {
  if (item.behavior === 'CAPITAL_ASSET') return 'AVAILABLE';
  const qty = Number(item.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 'DEPLETED';
  const min = item.minStock != null ? Number(item.minStock) : null;
  if (min != null && Number.isFinite(min) && qty <= min) return 'LOW';
  return 'AVAILABLE';
}

export function mapRecipeDto(recipe: RecipeWithRelations) {
  return {
    recipeYield: recipe.recipeYield.toString(),
    adminRate: Number(recipe.adminRate),
    ingredients: recipe.ingredients
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((ing) => ({
        id: ing.id,
        inventoryItemId: ing.inventoryItemId,
        quantity: ing.quantity.toString(),
        unit: ing.unit,
        sortOrder: ing.sortOrder,
        categoryName: ing.inventoryItem.category?.name ?? null,
        inventoryBehavior: ing.inventoryItem.behavior,
        stockStatus: stockStatusForItem(ing.inventoryItem),
      })),
    costs: recipe.costs
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        quantity: c.quantity?.toString() ?? null,
        unit: c.unit,
        lineTotalCOP: c.lineTotalCOP.toFixed(0),
        sheetUnitCost: c.sheetUnitCost,
        sortOrder: c.sortOrder,
      })),
  };
}
