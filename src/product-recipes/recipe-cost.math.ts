import { Prisma } from '@prisma/client';

type IngredientRow = {
  quantity: Prisma.Decimal;
  inventoryItem: { unitCost: Prisma.Decimal };
};

type CostRow = {
  name: string;
  lineTotalCOP: Prisma.Decimal;
};

const DEFAULT_ADMIN_RATE = 0.3;

function isAdminLineName(name: string): boolean {
  return /administraci/i.test(name.trim());
}

/** Costo unitario de producto a partir de insumos, gastos y tasa de administración. */
export function computeRecipeUnitCostCOP(args: {
  recipeYield: Prisma.Decimal;
  adminRate: Prisma.Decimal;
  ingredients: IngredientRow[];
  costs: CostRow[];
}): number | null {
  const yieldNum = Number(args.recipeYield);
  if (!Number.isFinite(yieldNum) || yieldNum <= 0) return null;

  let materials = 0;
  for (const ing of args.ingredients) {
    const qty = Number(ing.quantity);
    const unitCost = Number(ing.inventoryItem.unitCost);
    if (Number.isFinite(qty) && Number.isFinite(unitCost)) {
      materials += qty * unitCost;
    }
  }

  let services = 0;
  for (const c of args.costs) {
    if (isAdminLineName(c.name)) continue;
    const total = Number(c.lineTotalCOP);
    if (Number.isFinite(total) && total >= 0) services += total;
  }

  const base = materials + services;
  const adminRate = Number(args.adminRate);
  const rate =
    Number.isFinite(adminRate) && adminRate >= 0 ? adminRate : DEFAULT_ADMIN_RATE;
  const admin = Math.round(base * rate);
  const total = materials + services + admin;
  if (total <= 0) return null;
  return Math.round(total / yieldNum);
}

export function computeCostControls(args: {
  adminRate: Prisma.Decimal;
  ingredients: IngredientRow[];
  costs: CostRow[];
}): { adminRate: number; materialsCOP: number; servicesCOP: number; baseCOP: number } {
  let materialsCOP = 0;
  for (const ing of args.ingredients) {
    const qty = Number(ing.quantity);
    const unitCost = Number(ing.inventoryItem.unitCost);
    if (Number.isFinite(qty) && Number.isFinite(unitCost)) {
      materialsCOP += qty * unitCost;
    }
  }

  let servicesCOP = 0;
  for (const c of args.costs) {
    if (isAdminLineName(c.name)) continue;
    const total = Number(c.lineTotalCOP);
    if (Number.isFinite(total) && total >= 0) servicesCOP += total;
  }

  const adminRate = Number(args.adminRate);
  return {
    adminRate:
      Number.isFinite(adminRate) && adminRate >= 0 ? adminRate : DEFAULT_ADMIN_RATE,
    materialsCOP: Math.round(materialsCOP),
    servicesCOP: Math.round(servicesCOP),
    baseCOP: Math.round(materialsCOP + servicesCOP),
  };
}
