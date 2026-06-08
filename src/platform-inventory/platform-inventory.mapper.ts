import { Prisma } from '@prisma/client';

type InventoryRow = Prisma.InventoryItemGetPayload<{
  include: { category: true; purchaseLot: true };
}>;

export function mapInventoryItem(
  row: InventoryRow,
  opts?: { includeStats?: boolean },
) {
  const qty = Number(row.quantity);
  const min = row.minStock != null ? Number(row.minStock) : null;
  const base = {
    id: row.id,
    name: row.name,
    categoryId: row.categoryId ?? '',
    quantity: row.quantity.toString(),
    unit: row.unit,
    unitCost: row.unitCost.toString(),
    lot: row.lotLabel,
    minStock: row.minStock?.toString() ?? null,
    behavior: row.behavior,
    active: row.active,
    category: row.category
      ? {
          id: row.category.id,
          name: row.category.name,
          type: 'INVENTORY',
          slug: row.category.slug,
        }
      : {
          id: 'uncategorized',
          name: 'Sin categoría',
          type: 'INVENTORY',
        },
    purchaseLot: row.purchaseLot
      ? {
          id: row.purchaseLot.id,
          code: row.purchaseLot.code,
          purchaseDate: row.purchaseLot.purchaseDate.toISOString(),
          supplier: row.purchaseLot.supplier,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (!opts?.includeStats) return base;

  return {
    ...base,
    stats: {
      onHand: qty,
      minStock: min,
      belowMinimum: min != null && qty <= min,
    },
  };
}
