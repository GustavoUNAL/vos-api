import { Prisma, StockMoveType } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export type MovementStats = {
  received: number;
  consumedViaSales: number;
  consumedViaOut: number;
  consumedTotal: number;
  waste: number;
  adjustment: number;
};

export function weightedUnitCost(
  prevQty: Prisma.Decimal,
  prevCost: Prisma.Decimal,
  addQty: Prisma.Decimal,
  addCost: Prisma.Decimal,
): Prisma.Decimal {
  const nextQty = prevQty.add(addQty);
  if (nextQty.lte(0)) return new Prisma.Decimal(addCost.toFixed(2));
  return new Prisma.Decimal(
    prevQty.mul(prevCost).add(addQty.mul(addCost)).div(nextQty).toFixed(2),
  );
}

export function movementStatsFromGroups(
  rows: { type: StockMoveType; quantity: Prisma.Decimal | null }[],
): MovementStats {
  let purchase = 0;
  let sale = 0;
  let waste = 0;
  let adjustment = 0;
  for (const row of rows) {
    const qty = Number(row.quantity ?? 0);
    if (row.type === StockMoveType.PURCHASE) purchase += qty;
    else if (row.type === StockMoveType.SALE) sale += qty;
    else if (row.type === StockMoveType.WASTE) waste += qty;
    else adjustment += qty;
  }
  const consumedViaSales = Math.abs(sale);
  const wasteAbs = Math.abs(waste);
  return {
    received: purchase,
    consumedViaSales,
    consumedViaOut: 0,
    consumedTotal: consumedViaSales + wasteAbs,
    waste: wasteAbs,
    adjustment,
  };
}

export async function loadMovementStats(
  tx: Tx | Prisma.DefaultPrismaClient,
  companyId: string,
  inventoryItemIds: string[],
): Promise<Map<string, MovementStats>> {
  const out = new Map<string, MovementStats>();
  if (inventoryItemIds.length === 0) return out;
  const grouped = await tx.stockMove.groupBy({
    by: ['inventoryItemId', 'type'],
    where: { companyId, inventoryItemId: { in: inventoryItemIds } },
    _sum: { quantity: true },
  });
  const byItem = new Map<string, { type: StockMoveType; quantity: Prisma.Decimal | null }[]>();
  for (const row of grouped) {
    const list = byItem.get(row.inventoryItemId) ?? [];
    list.push({ type: row.type, quantity: row._sum.quantity });
    byItem.set(row.inventoryItemId, list);
  }
  for (const id of inventoryItemIds) {
    out.set(id, movementStatsFromGroups(byItem.get(id) ?? []));
  }
  return out;
}

/** Aplica un cambio firmado al saldo y deja el renglón del kardex. */
export async function applyStockDelta(
  tx: Tx,
  input: {
    companyId: string;
    inventoryItemId: string;
    type: StockMoveType;
    delta: Prisma.Decimal;
    unit?: string;
    unitCost?: Prisma.Decimal | null;
    weightedUnitCost?: Prisma.Decimal | null;
    note?: string | null;
    saleId?: string | null;
    purchaseLotId?: string | null;
    userId?: string | null;
    lotLabel?: string | null;
  },
): Promise<boolean> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.inventoryItemId, companyId: input.companyId },
  });
  if (!item) return false;
  if (input.delta.isZero()) return false;

  const nextQty = item.quantity.add(input.delta);
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      quantity: nextQty,
      ...(input.weightedUnitCost != null
        ? { unitCost: input.weightedUnitCost }
        : {}),
      ...(input.lotLabel !== undefined ? { lotLabel: input.lotLabel } : {}),
      ...(input.purchaseLotId
        ? { purchaseLot: { connect: { id: input.purchaseLotId } } }
        : {}),
    },
  });
  await tx.stockMove.create({
    data: {
      companyId: input.companyId,
      inventoryItemId: item.id,
      type: input.type,
      quantity: input.delta,
      unit: input.unit?.trim() || item.unit,
      unitCost: input.unitCost ?? null,
      qtyBefore: item.quantity,
      costBefore: item.unitCost,
      note: input.note?.trim() || null,
      saleId: input.saleId ?? null,
      purchaseLotId: input.purchaseLotId ?? null,
      userId: input.userId ?? null,
    },
  });
  return true;
}

/** Deshace movimientos en orden inverso. La cantidad vuelve; el costo solo si no hubo una compra posterior. */
export async function reverseStockMoves(
  tx: Tx,
  where: Prisma.StockMoveWhereInput,
): Promise<void> {
  const moves = await tx.stockMove.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  for (const move of moves) {
    const data: Prisma.InventoryItemUpdateInput = {
      quantity: { decrement: move.quantity },
    };
    if (move.type === StockMoveType.PURCHASE && move.costBefore != null) {
      const newer = await tx.stockMove.count({
        where: {
          inventoryItemId: move.inventoryItemId,
          type: StockMoveType.PURCHASE,
          createdAt: { gt: move.createdAt },
          id: { not: move.id },
        },
      });
      if (newer === 0) data.unitCost = move.costBefore;
    }
    await tx.inventoryItem.update({
      where: { id: move.inventoryItemId },
      data,
    });
  }
  if (moves.length > 0) {
    await tx.stockMove.deleteMany({
      where: { id: { in: moves.map((move) => move.id) } },
    });
  }
}

export async function applySaleRecipeStock(
  tx: Tx,
  args: {
    companyId: string;
    saleId: string;
    userId: string | null;
    lines: { productId: string | null; quantity: Prisma.Decimal }[];
  },
): Promise<void> {
  for (const line of args.lines) {
    if (!line.productId || line.quantity.lte(0)) continue;
    const recipe = await tx.recipe.findFirst({
      where: { companyId: args.companyId, productId: line.productId },
      include: { ingredients: true },
    });
    if (!recipe) continue;
    const yieldQty = recipe.recipeYield.gt(0)
      ? recipe.recipeYield
      : new Prisma.Decimal(1);
    for (const ingredient of recipe.ingredients) {
      const used = new Prisma.Decimal(ingredient.quantity)
        .mul(line.quantity)
        .div(yieldQty);
      if (used.lte(0)) continue;
      await applyStockDelta(tx, {
        companyId: args.companyId,
        inventoryItemId: ingredient.inventoryItemId,
        type: StockMoveType.SALE,
        delta: used.negated(),
        unit: ingredient.unit,
        saleId: args.saleId,
        userId: args.userId,
      });
    }
  }
}
