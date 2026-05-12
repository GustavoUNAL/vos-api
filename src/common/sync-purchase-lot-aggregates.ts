import { Prisma, PrismaClient } from '@prisma/client';

type LotSyncDb = Pick<PrismaClient, 'purchaseLot' | 'inventory'>;

/**
 * Actualiza `purchase_lots.item_count` según filas activas de `inventory` con
 * `inventory.lot` = `purchase_lots.code`.
 *
 * No modifica `total_value`: con líneas de comprobante se mantiene vía
 * `syncPurchaseLotTotalValueFromLines` en `PurchaseLotsService`; sin líneas,
 * sigue siendo el monto registrado del lote (no Σ valorización de stock).
 */
export async function syncPurchaseLotItemCountFromInventory(
  prisma: LotSyncDb,
  code: string | null | undefined,
): Promise<void> {
  const c = code?.trim();
  if (!c) return;

  const lotRow = await prisma.purchaseLot.findUnique({
    where: { code: c },
    select: { code: true },
  });
  if (!lotRow) return;

  const items = await prisma.inventory.findMany({
    where: { lot: c, deletedAt: null },
    select: { id: true },
  });

  await prisma.purchaseLot.update({
    where: { code: c },
    data: { itemCount: items.length },
  });
}

type InventoryDb = Pick<PrismaClient, 'inventory'>;

/** Valorización aproximada del stock enlazado al lote (Σ cantidad × costo unitario). */
export async function inventoryStockValueForLotCode(
  prisma: InventoryDb,
  code: string,
): Promise<{ activeItemCount: number; stockValueCOP: Prisma.Decimal }> {
  const items = await prisma.inventory.findMany({
    where: { lot: code, deletedAt: null },
    select: { quantity: true, unitCost: true },
  });
  let stockValueCOP = new Prisma.Decimal(0);
  for (const it of items) {
    stockValueCOP = stockValueCOP.add(it.quantity.mul(it.unitCost));
  }
  return {
    activeItemCount: items.length,
    stockValueCOP,
  };
}
