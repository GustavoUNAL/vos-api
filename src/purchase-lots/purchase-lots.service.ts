import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoryType, Prisma, StockMovementType } from '@prisma/client';
import { categoryDisplayName } from '../common/category-display-name';
import {
  inventoryConsumptionBehavior,
  isCapitalAssetCategoryName,
} from '../common/inventory-capital-asset';
import {
  assertPatchTotalValueCoherentWithLines,
  deriveBackfillQuantityPurchased,
  lineQuantityConsumed,
  lineTotalForPurchaseAggregationCOP,
  lineTotalFromQtyAndUnitCost,
  purchaseLineHistoricalAmounts,
  PurchaseLotTotalCoherenceError,
  purchaseTotalsWithinTolerance,
  sumLineTotalsCOP,
} from '../common/purchase-lot-line-math';
import { isMissingPurchaseLotLinesTableError } from '../common/prisma-purchase-lot-line-table';
import { formatPurchaseLotShortName } from '../common/purchase-lot-display-name';
import {
  inventoryStockValueForLotCode,
  syncPurchaseLotItemCountFromInventory,
} from '../common/sync-purchase-lot-aggregates';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseLotDto } from './dto/create-purchase-lot.dto';
import { ReplacePurchaseLotLinesDto } from './dto/replace-purchase-lot-lines.dto';
import { UpdatePurchaseLotDto } from './dto/update-purchase-lot.dto';

type ListParams = {
  page: number;
  limit: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

type LotConsumptionStatus = 'EMPTY' | 'FRESH' | 'PARTIAL' | 'DEPLETED';

type LotInventoryMetrics = {
  productsCount: number;
  availableItemsCount: number;
  consumedItemsCount: number;
  purchasedUnitsTotal: string | null;
  purchasedValueCOP: string | null;
  remainingUnits: string;
  /** Valorización Σ existencias × costo unitario (analítica; baja al consumir). */
  remainingStockValueCOP: string;
  /** @deprecated Usar `remainingStockValueCOP` (mismo valor). */
  remainingValue: string;
  consumptionStatus: LotConsumptionStatus;
  isDepleted: boolean;
  lotAgeDays: number;
  /** Hay líneas de comprobante; `purchasedValueCOP` = `sumLineTotalsCOP` (COP enteros por línea). */
  purchaseLinesAuthoritative: boolean;
  /** `true` si `totalValue` del lote no coincide con Σ líneas (`sumLineTotalsCOP`, tolerancia 1 COP). */
  totalValueVsLinesPurchaseMismatch: boolean | null;
};

type LineForMetrics = {
  quantityPurchased: Prisma.Decimal;
  /** Total línea comprobante (COP enteros): agregación histórica + inventario si aplica. */
  canonicalLineTotalCOP: Prisma.Decimal;
  quantityRemaining: Prisma.Decimal;
  /** Activo fijo: no cuenta como “consumido” ni agota el lote por existencias en cero. */
  isCapitalAsset: boolean;
};

type PurchaseLotLineWithCategory = Prisma.PurchaseLotLineGetPayload<{
  include: { category: { select: { id: true; name: true } } };
}>;

type CacheEntry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
};

const zeroDecimal = () => new Prisma.Decimal(0);

const purchaseLotSafeSelect = {
  id: true,
  code: true,
  name: true,
  purchaseDate: true,
  supplier: true,
  notes: true,
  itemCount: true,
  totalValue: true,
  traceModifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PurchaseLotSelect;

@Injectable()
export class PurchaseLotsService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly freshTtlMs = 15_000;
  private readonly staleTtlMs = 120_000;
  private readonly listCache = new Map<string, CacheEntry<unknown>>();
  private readonly listInFlight = new Map<string, Promise<unknown>>();

  private invalidateListCache() {
    this.listCache.clear();
  }

  private getFresh<T>(key: string): T | null {
    const hit = this.listCache.get(key);
    if (!hit) return null;
    const now = Date.now();
    if (now > hit.staleUntil) {
      this.listCache.delete(key);
      return null;
    }
    if (now > hit.freshUntil) return null;
    return hit.value as T;
  }

  private getStale<T>(key: string): T | null {
    const hit = this.listCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.staleUntil) {
      this.listCache.delete(key);
      return null;
    }
    return hit.value as T;
  }

  private setCache<T>(key: string, value: T) {
    const now = Date.now();
    this.listCache.set(key, {
      value,
      freshUntil: now + this.freshTtlMs,
      staleUntil: now + this.staleTtlMs,
    });
  }

  /** Permite identificar un lote por `id` (cuid) o por `code` legible. */
  private async resolveLotByIdOrCode(ref: string) {
    const byId = await this.prisma.purchaseLot.findUnique({
      where: { id: ref },
      select: { id: true, code: true },
    });
    if (byId) return byId;
    return this.prisma.purchaseLot.findUnique({
      where: { code: ref },
      select: { id: true, code: true },
    });
  }

  private normalizeNameForMatch(raw: string): string {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private trimLineComment(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const t = raw.trim();
    if (!t) return null;
    return t.length > 4000 ? t.slice(0, 4000) : t;
  }

  /**
   * Costo de compra por línea (histórico): ver `purchaseLineHistoricalAmounts`.
   */
  private effectivePurchaseDisplayAmounts(
    ln: {
      quantityPurchased: Prisma.Decimal;
      purchaseUnitCostCOP: Prisma.Decimal;
      lineTotalCOP: Prisma.Decimal;
    },
    inventoryUnitCost: Prisma.Decimal | null | undefined,
  ): { unitCost: Prisma.Decimal; lineTotal: Prisma.Decimal } {
    return purchaseLineHistoricalAmounts(ln, inventoryUnitCost);
  }

  /**
   * Cantidad y valor de compra históricos para crear línea de comprobante.
   * No usar solo existencias actuales: si ya se consumió todo, qty puede ser 0 pero la compra sí existió.
   */
  private async historicalPurchaseQtyAndLineTotal(
    inventoryItemId: string,
    currentQty: Prisma.Decimal,
    unitCost: Prisma.Decimal,
  ): Promise<{ qtyPurchased: Prisma.Decimal; lineTotal: Prisma.Decimal }> {
    const rows = await this.prisma.stockMovement.groupBy({
      by: ['type'],
      where: { inventoryItemId },
      _sum: { quantity: true },
    });
    let sumIn = zeroDecimal();
    let sumOut = zeroDecimal();
    let sumSale = zeroDecimal();
    let sumWaste = zeroDecimal();
    for (const r of rows) {
      const q = r._sum.quantity ?? zeroDecimal();
      switch (r.type) {
        case StockMovementType.IN:
          sumIn = sumIn.add(q);
          break;
        case StockMovementType.OUT:
          sumOut = sumOut.add(q);
          break;
        case StockMovementType.SALE:
          sumSale = sumSale.add(q);
          break;
        case StockMovementType.WASTE:
          sumWaste = sumWaste.add(q);
          break;
        default:
          break;
      }
    }
    const sumOutSaleWaste = sumOut.add(sumSale).add(sumWaste);
    let qtyPurchased = deriveBackfillQuantityPurchased(
      currentQty,
      sumIn,
      sumOutSaleWaste,
    );
    const lineTotal = lineTotalFromQtyAndUnitCost(qtyPurchased, unitCost);
    return { qtyPurchased, lineTotal };
  }

  private lotAgeDaysFromPurchaseDate(purchaseDate: Date): number {
    const ms = Date.now() - purchaseDate.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  private buildLotInventoryMetrics(
    purchaseDate: Date,
    physicalItems: Array<{
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      categoryName: string;
    }>,
    purchaseLines: LineForMetrics[] | null,
    lotTotalValue: Prisma.Decimal | null,
  ): LotInventoryMetrics {
    let remainingUnits = new Prisma.Decimal(0);
    let remainingStockValueCOP = new Prisma.Decimal(0);
    for (const it of physicalItems) {
      if (it.quantity.gt(0)) {
        remainingUnits = remainingUnits.add(it.quantity);
        remainingStockValueCOP = remainingStockValueCOP.add(
          it.quantity.mul(it.unitCost),
        );
      }
    }

    const physicalCount = physicalItems.length;
    const hasLines = purchaseLines !== null && purchaseLines.length > 0;

    let productsCount: number;
    let availableItemsCount: number;
    let consumedItemsCount: number;
    let consumptionStatus: LotConsumptionStatus;
    let isDepleted: boolean;
    let purchasedUnitsTotal: Prisma.Decimal | null = null;
    let purchasedValueCOP: Prisma.Decimal | null = null;
    let totalValueVsLinesPurchaseMismatch: boolean | null = null;

    if (hasLines && purchaseLines) {
      let pu = new Prisma.Decimal(0);
      let pv = new Prisma.Decimal(0);
      let avail = 0;
      let cons = 0;
      for (const ln of purchaseLines) {
        pu = pu.add(ln.quantityPurchased);
        pv = pv.add(ln.canonicalLineTotalCOP);
        if (ln.isCapitalAsset) {
          if (ln.quantityPurchased.gt(0)) avail += 1;
        } else {
          if (ln.quantityRemaining.gt(0)) avail += 1;
          if (ln.quantityPurchased.gt(0) && ln.quantityRemaining.lte(0)) {
            cons += 1;
          }
        }
      }
      purchasedUnitsTotal = pu;
      purchasedValueCOP = pv;

      const linesSum = pv;
      if (lotTotalValue !== null) {
        totalValueVsLinesPurchaseMismatch = !purchaseTotalsWithinTolerance(
          lotTotalValue,
          linesSum,
        );
      } else {
        totalValueVsLinesPurchaseMismatch = null;
      }

      productsCount = purchaseLines.length;
      availableItemsCount = avail;
      consumedItemsCount = cons;
      isDepleted = productsCount > 0 && availableItemsCount === 0;

      if (productsCount === 0) {
        consumptionStatus = 'EMPTY';
      } else if (availableItemsCount === productsCount) {
        consumptionStatus = 'FRESH';
      } else if (availableItemsCount === 0) {
        consumptionStatus = 'DEPLETED';
      } else {
        consumptionStatus = 'PARTIAL';
      }
    } else {
      purchasedValueCOP =
        lotTotalValue !== null ? new Prisma.Decimal(lotTotalValue) : null;
      purchasedUnitsTotal = null;
      totalValueVsLinesPurchaseMismatch = null;

      productsCount = physicalCount;
      let availPhys = 0;
      let consPhys = 0;
      for (const it of physicalItems) {
        if (isCapitalAssetCategoryName(it.categoryName)) {
          availPhys += 1;
        } else if (it.quantity.gt(0)) {
          availPhys += 1;
        } else {
          consPhys += 1;
        }
      }
      availableItemsCount = availPhys;
      consumedItemsCount = consPhys;
      isDepleted = physicalCount > 0 && availableItemsCount === 0;

      if (physicalCount === 0) {
        consumptionStatus = 'EMPTY';
      } else if (availableItemsCount === physicalCount) {
        consumptionStatus = 'FRESH';
      } else if (availableItemsCount === 0) {
        consumptionStatus = 'DEPLETED';
      } else {
        consumptionStatus = 'PARTIAL';
      }
    }

    const rs = remainingStockValueCOP.toFixed(0);

    return {
      productsCount,
      availableItemsCount,
      consumedItemsCount,
      purchasedUnitsTotal: purchasedUnitsTotal?.toString() ?? null,
      purchasedValueCOP: purchasedValueCOP?.toFixed(2) ?? null,
      remainingUnits: remainingUnits.toString(),
      remainingStockValueCOP: rs,
      remainingValue: rs,
      consumptionStatus,
      isDepleted,
      lotAgeDays: this.lotAgeDaysFromPurchaseDate(purchaseDate),
      purchaseLinesAuthoritative: hasLines,
      totalValueVsLinesPurchaseMismatch,
    };
  }

  /**
   * Alinea líneas enlazadas a inventario: `quantity_purchased`, `unit` y `line_total_cop`
   * con movimientos + existencias (`historicalPurchaseQtyAndLineTotal` + agregación COP).
   * Actualiza `purchase_lots.total_value` como suma de totales de línea.
   */
  private async syncPurchaseLotTotalValueFromLines(
    purchaseLotCode: string,
  ): Promise<void> {
    const code = purchaseLotCode.trim();
    if (!code) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        const lines = await tx.purchaseLotLine.findMany({
          where: { purchaseLotCode: code },
          select: {
            id: true,
            inventoryItemId: true,
            quantityPurchased: true,
            purchaseUnitCostCOP: true,
            lineTotalCOP: true,
            unit: true,
          },
        });
        const linkedIds = [
          ...new Set(
            lines.map((l) => l.inventoryItemId).filter((id): id is string => !!id),
          ),
        ];
        const invRows =
          linkedIds.length > 0
            ? await tx.inventory.findMany({
                where: { id: { in: linkedIds } },
                select: {
                  id: true,
                  quantity: true,
                  unit: true,
                  unitCost: true,
                  deletedAt: true,
                },
              })
            : [];
        const invById = new Map(
          invRows
            .filter((r) => r.deletedAt === null)
            .map((r) => [r.id, r] as const),
        );

        let sum = zeroDecimal();
        for (const ln of lines) {
          let qtyP = ln.quantityPurchased;
          let lineTot = ln.lineTotalCOP;
          let unitStr = ln.unit;

          const inv = ln.inventoryItemId
            ? invById.get(ln.inventoryItemId)
            : undefined;
          if (inv) {
            const { qtyPurchased, lineTotal } =
              await this.historicalPurchaseQtyAndLineTotal(
                ln.inventoryItemId!,
                inv.quantity,
                inv.unitCost,
              );
            qtyP = qtyPurchased;
            unitStr = inv.unit;
            lineTot = lineTotalForPurchaseAggregationCOP({
              quantityPurchased: qtyPurchased,
              purchaseUnitCostCOP: ln.purchaseUnitCostCOP,
              lineTotalCOP: lineTotal,
              inventoryUnitCostCOP: inv.unitCost,
            });
            if (
              !ln.quantityPurchased.equals(qtyP) ||
              !ln.lineTotalCOP.equals(lineTot) ||
              ln.unit !== unitStr
            ) {
              await tx.purchaseLotLine.update({
                where: { id: ln.id },
                data: {
                  quantityPurchased: qtyP,
                  unit: unitStr,
                  lineTotalCOP: lineTot,
                },
              });
            }
          }

          const invUC = ln.inventoryItemId
            ? invById.get(ln.inventoryItemId)?.unitCost
            : undefined;
          const agg = lineTotalForPurchaseAggregationCOP({
            quantityPurchased: qtyP,
            purchaseUnitCostCOP: ln.purchaseUnitCostCOP,
            lineTotalCOP: lineTot,
            inventoryUnitCostCOP: invUC,
          });
          sum = sum.add(agg);
          if (!inv && !agg.equals(ln.lineTotalCOP)) {
            await tx.purchaseLotLine.update({
              where: { id: ln.id },
              data: { lineTotalCOP: agg },
            });
          }
        }
        await tx.purchaseLot.update({
          where: { code },
          data: { totalValue: sum },
        });
      });
    } catch (e) {
      if (!isMissingPurchaseLotLinesTableError(e)) throw e;
    }
    this.invalidateListCache();
  }

  /**
   * Recalcula `purchase_lots.item_count` desde inventario activo (`inventory.lot` = code).
   */
  async syncInventoryItemCountForLotCode(
    code: string | null | undefined,
  ): Promise<void> {
    await syncPurchaseLotItemCountFromInventory(this.prisma, code);
    this.invalidateListCache();
  }

  async ensurePurchaseLotRowForCode(
    code: string,
    options?: { supplier?: string | null; purchaseDate?: Date },
  ): Promise<void> {
    const c = code.trim();
    if (!c) return;

    const existing = await this.prisma.purchaseLot.findUnique({
      where: { code: c },
      select: { supplier: true, purchaseDate: true, name: true },
    });

    const supplier =
      options?.supplier !== undefined
        ? options.supplier?.trim() || null
        : (existing?.supplier ?? null);
    const purchaseDate =
      options?.purchaseDate ?? existing?.purchaseDate ?? new Date();
    const name = formatPurchaseLotShortName(supplier, purchaseDate, {
      lotCode: c,
    });
    const shouldRefreshName =
      !existing ||
      !existing.name?.trim() ||
      options?.supplier !== undefined ||
      options?.purchaseDate !== undefined;

    await this.prisma.purchaseLot.upsert({
      where: { code: c },
      create: {
        code: c,
        purchaseDate,
        supplier,
        name,
      },
      update: {
        ...(options?.supplier !== undefined
          ? { supplier: options.supplier?.trim() || null }
          : {}),
        ...(options?.purchaseDate !== undefined
          ? { purchaseDate: options.purchaseDate }
          : {}),
        ...(shouldRefreshName ? { name } : {}),
      },
    });
    this.invalidateListCache();
  }

  /**
   * Tras crear o refrescar inventario con lote: línea de comprobante con cantidad/total
   * coherentes con historial de movimientos; conserva costo unitario de factura si ya existía línea.
   */
  async ensurePurchaseLotLineFromInventorySnapshot(inv: {
    id: string;
    lot: string | null;
    name: string;
    categoryId: string;
    quantity: Prisma.Decimal;
    unit: string;
    unitCost: Prisma.Decimal;
  }): Promise<void> {
    const lot = inv.lot?.trim();
    if (!lot) return;
    const existingLine = await this.prisma.purchaseLotLine.findUnique({
      where: { inventoryItemId: inv.id },
      select: { purchaseUnitCostCOP: true },
    });
    const ucLine = existingLine?.purchaseUnitCostCOP ?? inv.unitCost;
    const { qtyPurchased, lineTotal } =
      await this.historicalPurchaseQtyAndLineTotal(
        inv.id,
        inv.quantity,
        inv.unitCost,
      );
    const canonicalLineTotal = lineTotalForPurchaseAggregationCOP({
      quantityPurchased: qtyPurchased,
      purchaseUnitCostCOP: ucLine,
      lineTotalCOP: lineTotal,
      inventoryUnitCostCOP: inv.unitCost,
    });
    try {
      await this.prisma.purchaseLotLine.upsert({
        where: { inventoryItemId: inv.id },
        create: {
          purchaseLotCode: lot,
          inventoryItemId: inv.id,
          lineName: inv.name,
          categoryId: inv.categoryId,
          quantityPurchased: qtyPurchased,
          unit: inv.unit,
          purchaseUnitCostCOP: inv.unitCost,
          lineTotalCOP: canonicalLineTotal,
          sortOrder: 0,
        },
        update: {
          purchaseLotCode: lot,
          lineName: inv.name,
          categoryId: inv.categoryId,
          quantityPurchased: qtyPurchased,
          unit: inv.unit,
          purchaseUnitCostCOP: ucLine,
          lineTotalCOP: canonicalLineTotal,
        },
      });
      await this.syncPurchaseLotTotalValueFromLines(lot);
    } catch (e) {
      if (!isMissingPurchaseLotLinesTableError(e)) throw e;
    }
    this.invalidateListCache();
  }

  /**
   * Tras actualizar inventario: metadatos, lote, unidad, cantidad comprada histórica y total de línea
   * coherentes con movimientos + existencias (ver `historicalPurchaseQtyAndLineTotal`).
   */
  async reconcilePurchaseLotLineAfterInventoryChange(params: {
    inventoryId: string;
    inventoryAfter: {
      id: string;
      lot: string | null;
      name: string;
      categoryId: string;
      quantity: Prisma.Decimal;
      unit: string;
      unitCost: Prisma.Decimal;
    };
  }): Promise<void> {
    const { inventoryId, inventoryAfter } = params;
    const lotAfter = inventoryAfter.lot?.trim() || null;

    try {
      const existingMeta = await this.prisma.purchaseLotLine.findUnique({
        where: { inventoryItemId: inventoryId },
        select: { id: true, purchaseLotCode: true, purchaseUnitCostCOP: true },
      });
      const oldLotCode = existingMeta?.purchaseLotCode?.trim() ?? null;

      if (!lotAfter) {
        await this.prisma.purchaseLotLine.deleteMany({
          where: { inventoryItemId: inventoryId },
        });
        if (oldLotCode) {
          await this.syncPurchaseLotTotalValueFromLines(oldLotCode);
        }
        return;
      }

      if (!existingMeta) {
        const { qtyPurchased, lineTotal } =
          await this.historicalPurchaseQtyAndLineTotal(
            inventoryId,
            inventoryAfter.quantity,
            inventoryAfter.unitCost,
          );
        const canonicalLineTotal = lineTotalForPurchaseAggregationCOP({
          quantityPurchased: qtyPurchased,
          purchaseUnitCostCOP: inventoryAfter.unitCost,
          lineTotalCOP: lineTotal,
          inventoryUnitCostCOP: inventoryAfter.unitCost,
        });
        await this.prisma.purchaseLotLine.create({
          data: {
            purchaseLotCode: lotAfter,
            inventoryItemId: inventoryId,
            lineName: inventoryAfter.name,
            categoryId: inventoryAfter.categoryId,
            quantityPurchased: qtyPurchased,
            unit: inventoryAfter.unit,
            purchaseUnitCostCOP: inventoryAfter.unitCost,
            lineTotalCOP: canonicalLineTotal,
            sortOrder: 0,
          },
        });
        await this.syncPurchaseLotTotalValueFromLines(lotAfter);
        return;
      }

      const { qtyPurchased, lineTotal } =
        await this.historicalPurchaseQtyAndLineTotal(
          inventoryId,
          inventoryAfter.quantity,
          inventoryAfter.unitCost,
        );
      const canonicalLineTotal = lineTotalForPurchaseAggregationCOP({
        quantityPurchased: qtyPurchased,
        purchaseUnitCostCOP: existingMeta.purchaseUnitCostCOP,
        lineTotalCOP: lineTotal,
        inventoryUnitCostCOP: inventoryAfter.unitCost,
      });
      await this.prisma.purchaseLotLine.update({
        where: { inventoryItemId: inventoryId },
        data: {
          purchaseLotCode: lotAfter,
          lineName: inventoryAfter.name,
          categoryId: inventoryAfter.categoryId,
          quantityPurchased: qtyPurchased,
          unit: inventoryAfter.unit,
          lineTotalCOP: canonicalLineTotal,
        },
      });
      const newCode = lotAfter.trim();
      if (oldLotCode && oldLotCode !== newCode) {
        await this.syncPurchaseLotTotalValueFromLines(oldLotCode);
      }
      await this.syncPurchaseLotTotalValueFromLines(newCode);
    } catch (e) {
      if (!isMissingPurchaseLotLinesTableError(e)) throw e;
    }
    this.invalidateListCache();
  }

  private async supplierFromInventoryByCode(
    codes: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const trimmed = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
    if (!trimmed.length) return map;

    const rows = await this.prisma.inventory.findMany({
      where: {
        deletedAt: null,
        lot: { in: trimmed },
        supplier: { not: null },
      },
      select: { lot: true, supplier: true },
      orderBy: { updatedAt: 'desc' },
    });

    for (const r of rows) {
      const code = r.lot?.trim();
      const s = r.supplier?.trim();
      if (code && s && !map.has(code)) {
        map.set(code, s);
      }
    }
    return map;
  }

  private withResolvedSupplier<
    T extends {
      code: string;
      supplier: string | null;
      name: string | null;
      purchaseDate: Date;
      traceModifiedAt: Date | null;
    },
  >(row: T, fallback: Map<string, string>) {
    const fromLot = row.supplier?.trim() || null;
    const resolved = fromLot || fallback.get(row.code.trim()) || null;
    const displayName = formatPurchaseLotShortName(
      resolved,
      row.purchaseDate,
      { lotCode: row.code },
    );
    return { ...row, supplierResolved: resolved, displayName };
  }

  private async loadPurchaseLinesForMetricsByLotCodes(
    codes: string[],
  ): Promise<{
    linesByCode: Map<string, LineForMetrics[]>;
    migrationPending: boolean;
  }> {
    const trimmed = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
    const result = new Map<string, LineForMetrics[]>();
    if (!trimmed.length) {
      return { linesByCode: result, migrationPending: false };
    }

    let lines: Array<{
      purchaseLotCode: string;
      inventoryItemId: string | null;
      quantityPurchased: Prisma.Decimal;
      purchaseUnitCostCOP: Prisma.Decimal;
      lineTotalCOP: Prisma.Decimal;
      category: { name: string } | null;
    }>;
    try {
      lines = await this.prisma.purchaseLotLine.findMany({
        where: { purchaseLotCode: { in: trimmed } },
        select: {
          purchaseLotCode: true,
          inventoryItemId: true,
          quantityPurchased: true,
          purchaseUnitCostCOP: true,
          lineTotalCOP: true,
          category: { select: { name: true } },
        },
      });
    } catch (e) {
      if (isMissingPurchaseLotLinesTableError(e)) {
        for (const code of trimmed) {
          result.set(code, []);
        }
        return { linesByCode: result, migrationPending: true };
      }
      throw e;
    }

    const linkedIds = [
      ...new Set(
        lines.map((l) => l.inventoryItemId).filter((id): id is string => !!id),
      ),
    ];

    const invRows =
      linkedIds.length > 0
        ? await this.prisma.inventory.findMany({
            where: { id: { in: linkedIds } },
            select: {
              id: true,
              quantity: true,
              deletedAt: true,
              unitCost: true,
              category: { select: { name: true } },
            },
          })
        : [];

    const invById = new Map(invRows.map((r) => [r.id, r]));

    for (const code of trimmed) {
      result.set(code, []);
    }

    for (const ln of lines) {
      const code = ln.purchaseLotCode.trim();
      const arr = result.get(code) ?? [];
      let rem = new Prisma.Decimal(0);
      let invRow: (typeof invRows)[number] | undefined;
      if (ln.inventoryItemId) {
        invRow = invById.get(ln.inventoryItemId);
        if (invRow && invRow.deletedAt === null) {
          rem = invRow.quantity;
        }
      }
      const catName = invRow?.category?.name ?? ln.category?.name ?? undefined;
      const invUC =
        invRow && invRow.deletedAt === null ? invRow.unitCost : undefined;
      const canonicalLineTotalCOP = lineTotalForPurchaseAggregationCOP({
        quantityPurchased: ln.quantityPurchased,
        purchaseUnitCostCOP: ln.purchaseUnitCostCOP,
        lineTotalCOP: ln.lineTotalCOP,
        inventoryUnitCostCOP: invUC,
      });
      arr.push({
        quantityPurchased: ln.quantityPurchased,
        canonicalLineTotalCOP,
        quantityRemaining: rem,
        isCapitalAsset: isCapitalAssetCategoryName(catName),
      });
      result.set(code, arr);
    }

    return { linesByCode: result, migrationPending: false };
  }

  /**
   * Agregado diario para la vista calendario de compras.
   */
  async getCalendar(year: number, month: number) {
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new BadRequestException('year/month fuera de rango.');
    }
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const rows = await this.prisma.purchaseLot.findMany({
      where: { purchaseDate: { gte: start, lt: end } },
      select: { purchaseDate: true, totalValue: true },
    });

    const byDay = new Map<string, { count: number; total: Prisma.Decimal }>();
    for (const r of rows) {
      const day = r.purchaseDate.toISOString().slice(0, 10);
      const prev = byDay.get(day);
      const amount = r.totalValue ?? zeroDecimal();
      if (prev) {
        prev.count += 1;
        prev.total = prev.total.add(amount);
      } else {
        byDay.set(day, { count: 1, total: new Prisma.Decimal(amount) });
      }
    }

    const days = Array.from(byDay.entries())
      .map(([date, agg]) => ({
        date,
        count: agg.count,
        totalCOP: agg.total.toFixed(0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      year,
      month,
      days,
      totals: {
        count: rows.length,
        totalCOP: days
          .reduce((acc, d) => acc.add(d.totalCOP), new Prisma.Decimal(0))
          .toFixed(0),
      },
    };
  }

  async createManual(dto: CreatePurchaseLotDto) {
    const purchaseDate = new Date(dto.purchaseDate.trim());
    if (Number.isNaN(purchaseDate.getTime())) {
      throw new BadRequestException('Fecha de compra inválida.');
    }
    const code = await this.generateUniqueLotCode(purchaseDate);
    const supplier = dto.supplier?.trim() || null;
    const name = formatPurchaseLotShortName(supplier, purchaseDate, {
      lotCode: code,
    });

    const lot = await this.prisma.purchaseLot.create({
      data: {
        code,
        purchaseDate,
        supplier,
        notes: dto.notes?.trim() || null,
        name,
      },
    });

    if (dto.lines?.length) {
      await this.replacePurchaseLotLines(lot.id, {
        lines: dto.lines,
        expectedTotalValueCOP: dto.totalValue,
      });
    } else if (dto.totalValue != null) {
      await this.prisma.purchaseLot.update({
        where: { id: lot.id },
        data: { totalValue: new Prisma.Decimal(dto.totalValue) },
      });
    }

    this.invalidateListCache();
    return this.findOne(lot.id);
  }

  private async generateUniqueLotCode(purchaseDate: Date): Promise<string> {
    const ymd = purchaseDate.toISOString().slice(0, 10).replace(/-/g, '');
    for (let n = 1; n <= 999; n += 1) {
      const code = n === 1 ? `C${ymd}` : `C${ymd}-${n}`;
      const exists = await this.prisma.purchaseLot.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    return `C${ymd}-${Date.now().toString(36).slice(-5)}`;
  }

  async findAll(params: ListParams) {
    const cacheKey = JSON.stringify({
      page: params.page,
      limit: params.limit,
      search: params.search?.trim() ?? '',
      dateFrom: params.dateFrom?.trim() ?? '',
      dateTo: params.dateTo?.trim() ?? '',
    });
    const fresh = this.getFresh<unknown>(cacheKey);
    if (fresh) return fresh;
    const stale = this.getStale<unknown>(cacheKey);
    if (stale) {
      if (!this.listInFlight.has(cacheKey)) {
        const bg = this.queryFindAll(params)
          .then((data) => this.setCache(cacheKey, data))
          .finally(() => this.listInFlight.delete(cacheKey));
        this.listInFlight.set(cacheKey, bg);
      }
      return stale;
    }
    const existing = this.listInFlight.get(cacheKey);
    if (existing) return existing;
    const task = this.queryFindAll(params)
      .then((data) => {
        this.setCache(cacheKey, data);
        return data;
      })
      .finally(() => this.listInFlight.delete(cacheKey));
    this.listInFlight.set(cacheKey, task);
    return task;
  }

  private async queryFindAll(params: ListParams) {
    const page = Math.max(1, Math.trunc(params.page));
    const limit = Math.min(100, Math.max(1, Math.trunc(params.limit)));
    const skip = (page - 1) * limit;

    const and: Prisma.PurchaseLotWhereInput[] = [];
    const search = params.search?.trim();
    if (search?.length) {
      and.push({
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { supplier: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const purchaseDate: Prisma.DateTimeFilter = {};
    if (params.dateFrom?.trim()) {
      purchaseDate.gte = new Date(params.dateFrom.trim());
    }
    if (params.dateTo?.trim()) {
      const end = new Date(params.dateTo.trim());
      end.setHours(23, 59, 59, 999);
      purchaseDate.lte = end;
    }
    if (Object.keys(purchaseDate).length > 0) {
      and.push({ purchaseDate });
    }

    const where: Prisma.PurchaseLotWhereInput =
      and.length === 0 ? {} : { AND: and };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.purchaseLot.count({ where }),
      this.prisma.purchaseLot.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchaseDate: 'desc' },
        select: purchaseLotSafeSelect,
      }),
    ]);

    const fallback = await this.supplierFromInventoryByCode(
      data.map((d) => d.code),
    );

    const codes = data.map((d) => d.code);
    const grouped =
      codes.length > 0
        ? await this.prisma.inventory.groupBy({
            by: ['lot'],
            where: { deletedAt: null, lot: { in: codes } },
            _count: { id: true },
          })
        : [];
    const linkedCountByCode = new Map(
      grouped.map((g) => [g.lot as string, g._count.id]),
    );
    const inventoryRows =
      codes.length > 0
        ? await this.prisma.inventory.findMany({
            where: { deletedAt: null, lot: { in: codes } },
            select: {
              lot: true,
              quantity: true,
              unitCost: true,
              category: { select: { name: true } },
            },
          })
        : [];
    const inventoryByCode = new Map<
      string,
      Array<{
        quantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        categoryName: string;
      }>
    >();
    for (const row of inventoryRows) {
      const code = row.lot?.trim();
      if (!code) continue;
      const arr = inventoryByCode.get(code) ?? [];
      arr.push({
        quantity: row.quantity,
        unitCost: row.unitCost,
        categoryName: row.category.name,
      });
      inventoryByCode.set(code, arr);
    }

    const { linesByCode, migrationPending } =
      await this.loadPurchaseLinesForMetricsByLotCodes(codes);

    return {
      data: data.map((d) => ({
        ...this.withResolvedSupplier(d, fallback),
        comment: d.notes ?? null,
        linkedActiveItemCount: linkedCountByCode.get(d.code) ?? 0,
        inventoryMetrics: this.buildLotInventoryMetrics(
          d.purchaseDate,
          inventoryByCode.get(d.code) ?? [],
          linesByCode.get(d.code.trim()) ?? null,
          d.totalValue,
        ),
      })),
      meta: {
        page,
        limit,
        total,
        hasNextPage: skip + data.length < total,
        ...(migrationPending
          ? {
              purchaseLotLinesMigrationPending: true as const,
              purchaseLotLinesMigrationHint:
                'Ejecute en el backend: npx prisma migrate deploy (o npm run db:migrate) y opcionalmente npm run db:backfill-purchase-lot-lines.',
            }
          : {}),
      },
    };
  }

  async listDistinctSuppliers() {
    const [fromLots, fromInventory] = await this.prisma.$transaction([
      this.prisma.purchaseLot.findMany({
        where: { supplier: { not: null } },
        select: { supplier: true },
        distinct: ['supplier'],
      }),
      this.prisma.inventory.findMany({
        where: { deletedAt: null, supplier: { not: null } },
        select: { supplier: true },
        distinct: ['supplier'],
      }),
    ]);

    const names = new Set<string>();
    for (const r of fromLots) {
      const s = r.supplier?.trim();
      if (s) names.add(s);
    }
    for (const r of fromInventory) {
      const s = r.supplier?.trim();
      if (s) names.add(s);
    }

    return {
      suppliers: [...names].sort((a, b) => a.localeCompare(b, 'es')),
      counts: {
        distinctFromPurchaseLots: fromLots.length,
        distinctFromInventory: fromInventory.length,
      },
    };
  }

  /**
   * Detalle de lote: antes de armar la respuesta, alinea en BD las líneas enlazadas a inventario
   * (`quantity_purchased`, `unit`, `line_total_cop`) con movimientos + existencias, y `total_value` del lote.
   */
  async findOne(idOrCode: string) {
    const lotRef = await this.resolveLotByIdOrCode(idOrCode);
    if (!lotRef) {
      throw new NotFoundException('Purchase lot not found');
    }
    const row = await this.prisma.purchaseLot.findUnique({
      where: { id: lotRef.id },
      select: purchaseLotSafeSelect,
    });
    if (!row) {
      throw new NotFoundException('Purchase lot not found');
    }
    await this.syncPurchaseLotTotalValueFromLines(row.code);
    const rowFresh = await this.prisma.purchaseLot.findUnique({
      where: { id: lotRef.id },
      select: purchaseLotSafeSelect,
    });
    if (!rowFresh) {
      throw new NotFoundException('Purchase lot not found');
    }
    const fallback = await this.supplierFromInventoryByCode([rowFresh.code]);
    const base = this.withResolvedSupplier(rowFresh, fallback);
    const { activeItemCount, stockValueCOP } =
      await inventoryStockValueForLotCode(this.prisma, rowFresh.code);

    const lotItems = await this.prisma.inventory.findMany({
      where: { deletedAt: null, lot: rowFresh.code },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        quantity: true,
        unit: true,
        unitCost: true,
        category: { select: { id: true, name: true } },
      },
    });

    const itemIdByNormalizedName = new Map<string, string>();
    for (const it of lotItems) {
      const key = this.normalizeNameForMatch(it.name);
      if (!key) continue;
      if (!itemIdByNormalizedName.has(key)) {
        itemIdByNormalizedName.set(key, it.id);
      }
    }
    const invUnitCostById = new Map(
      lotItems.map((i) => [i.id, i.unitCost] as const),
    );
    const invCategoryNameById = new Map(
      lotItems.map((i) => [i.id, i.category.name] as const),
    );

    const resolveLineInventoryId = (ln: {
      inventoryItemId: string | null;
      lineName: string;
    }): string | null =>
      ln.inventoryItemId ??
      itemIdByNormalizedName.get(this.normalizeNameForMatch(ln.lineName)) ??
      null;

    let linesRaw: PurchaseLotLineWithCategory[] = [];
    let purchaseLotLinesMigrationPending = false;
    try {
      linesRaw = await this.prisma.purchaseLotLine.findMany({
        where: { purchaseLotCode: rowFresh.code },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          category: { select: { id: true, name: true } },
        },
      });
    } catch (e) {
      if (isMissingPurchaseLotLinesTableError(e)) {
        purchaseLotLinesMigrationPending = true;
        linesRaw = [];
      } else {
        throw e;
      }
    }

    const lineInventoryIds = [
      ...new Set(
        linesRaw
          .map((l) => resolveLineInventoryId(l))
          .filter((id): id is string => !!id),
      ),
    ];

    const invForLines =
      lineInventoryIds.length > 0
        ? await this.prisma.inventory.findMany({
            where: { id: { in: lineInventoryIds } },
            select: {
              id: true,
              quantity: true,
              deletedAt: true,
              unit: true,
            },
          })
        : [];

    const invLineMap = new Map(invForLines.map((i) => [i.id, i]));

    const lineMetrics: LineForMetrics[] = linesRaw.map((ln) => {
      const invId = resolveLineInventoryId(ln);
      let rem = new Prisma.Decimal(0);
      if (invId) {
        const inv = invLineMap.get(invId);
        if (inv && inv.deletedAt === null) {
          rem = inv.quantity;
        }
      }
      const catName =
        ln.category?.name ??
        (invId ? invCategoryNameById.get(invId) : undefined);
      const invUC = invId ? invUnitCostById.get(invId) : undefined;
      const canonicalLineTotalCOP = lineTotalForPurchaseAggregationCOP({
        quantityPurchased: ln.quantityPurchased,
        purchaseUnitCostCOP: ln.purchaseUnitCostCOP,
        lineTotalCOP: ln.lineTotalCOP,
        inventoryUnitCostCOP: invUC,
      });
      return {
        quantityPurchased: ln.quantityPurchased,
        canonicalLineTotalCOP,
        quantityRemaining: rem,
        isCapitalAsset: isCapitalAssetCategoryName(catName),
      };
    });

    const inventoryMetrics = this.buildLotInventoryMetrics(
      rowFresh.purchaseDate,
      lotItems.map((it) => ({
        quantity: it.quantity,
        unitCost: it.unitCost,
        categoryName: it.category.name,
      })),
      lineMetrics.length ? lineMetrics : null,
      rowFresh.totalValue,
    );

    const lineLinkedIds = new Set(
      linesRaw
        .map((l) => resolveLineInventoryId(l))
        .filter((id): id is string => !!id),
    );
    const inventoryWithoutPurchaseLine = lotItems
      .filter((it) => !lineLinkedIds.has(it.id))
      .map((it) => ({
        id: it.id,
        name: it.name,
        categoryId: it.category.id,
        categoryName: categoryDisplayName(it.category.name),
        quantity: it.quantity.toString(),
        unit: it.unit,
        unitCost: it.unitCost.toFixed(2),
        available: it.quantity.gt(0),
        inventoryBehavior: inventoryConsumptionBehavior(it.category.name),
      }));

    let linkedLinesPurchaseTotal = new Prisma.Decimal(0);
    let unlinkedLinesPurchaseTotal = new Prisma.Decimal(0);
    const purchaseLines: Array<{
      id: string;
      lineName: string;
      categoryId: string | null;
      categoryName: string | null;
      quantityPurchased: string;
      unit: string;
      inventoryBehavior: string;
      purchaseUnitCostCOP: string;
      linePurchaseTotalCOP: string;
      inventoryItemId: string | null;
      quantityRemaining: string;
      quantityConsumed: string;
      sortOrder: number;
      /** Comentario libre por producto en esta línea del lote. */
      lineComment: string | null;
    }> = [];

    for (const ln of linesRaw) {
      const resolvedInventoryItemId = resolveLineInventoryId(ln);
      let remaining = new Prisma.Decimal(0);
      if (resolvedInventoryItemId) {
        const inv = invLineMap.get(resolvedInventoryItemId);
        if (inv && inv.deletedAt === null) {
          remaining = inv.quantity;
        }
      }
      const catName =
        ln.category?.name ??
        (resolvedInventoryItemId
          ? invCategoryNameById.get(resolvedInventoryItemId)
          : undefined);
      const behavior = inventoryConsumptionBehavior(catName);
      const assetLine = behavior === 'CAPITAL_ASSET';
      const consumed = assetLine
        ? new Prisma.Decimal(0)
        : lineQuantityConsumed(ln.quantityPurchased, remaining);
      const invUC = resolvedInventoryItemId
        ? invUnitCostById.get(resolvedInventoryItemId)
        : undefined;
      const { unitCost: displayUnit } = this.effectivePurchaseDisplayAmounts(
        ln,
        invUC,
      );
      const canonicalLineTotal = lineTotalForPurchaseAggregationCOP({
        quantityPurchased: ln.quantityPurchased,
        purchaseUnitCostCOP: ln.purchaseUnitCostCOP,
        lineTotalCOP: ln.lineTotalCOP,
        inventoryUnitCostCOP: invUC,
      });
      if (resolvedInventoryItemId) {
        linkedLinesPurchaseTotal =
          linkedLinesPurchaseTotal.add(canonicalLineTotal);
      } else {
        unlinkedLinesPurchaseTotal =
          unlinkedLinesPurchaseTotal.add(canonicalLineTotal);
      }
      purchaseLines.push({
        id: ln.id,
        lineName: ln.lineName,
        categoryId: ln.categoryId,
        categoryName: ln.category
          ? categoryDisplayName(ln.category.name)
          : null,
        quantityPurchased: ln.quantityPurchased.toString(),
        unit: ln.unit,
        inventoryBehavior: behavior,
        purchaseUnitCostCOP: displayUnit.toFixed(2),
        linePurchaseTotalCOP: canonicalLineTotal.toFixed(2),
        inventoryItemId: resolvedInventoryItemId,
        quantityRemaining: remaining.toString(),
        quantityConsumed: consumed.toString(),
        sortOrder: ln.sortOrder,
        lineComment: ln.lineComment ?? null,
      });
    }

    const linesCanonicalSum =
      linesRaw.length > 0
        ? sumLineTotalsCOP(
            linesRaw.map((ln) => {
              const invId = resolveLineInventoryId(ln);
              const invUC = invId ? invUnitCostById.get(invId) : undefined;
              return {
                quantityPurchased: ln.quantityPurchased,
                purchaseUnitCostCOP: ln.purchaseUnitCostCOP,
                lineTotalCOP: ln.lineTotalCOP,
                inventoryUnitCostCOP: invUC,
              };
            }),
          )
        : new Prisma.Decimal(0);

    const mismatch =
      rowFresh.totalValue !== null && linesRaw.length > 0
        ? !purchaseTotalsWithinTolerance(
            new Prisma.Decimal(rowFresh.totalValue),
            linesCanonicalSum,
          )
        : false;

    const purchaseByInventoryId = new Map<
      string,
      {
        quantityPurchased: string;
        purchaseUnitCostCOP: string;
        linePurchaseTotalCOP: string;
      }
    >();
    for (const pl of purchaseLines) {
      if (pl.inventoryItemId) {
        purchaseByInventoryId.set(pl.inventoryItemId, {
          quantityPurchased: pl.quantityPurchased,
          purchaseUnitCostCOP: pl.purchaseUnitCostCOP,
          linePurchaseTotalCOP: pl.linePurchaseTotalCOP,
        });
      }
    }

    let inventoryItemsPurchaseSum = new Prisma.Decimal(0);
    for (const it of lotItems) {
      const p = purchaseByInventoryId.get(it.id);
      if (p) {
        inventoryItemsPurchaseSum = inventoryItemsPurchaseSum.add(
          new Prisma.Decimal(p.linePurchaseTotalCOP),
        );
      }
    }

    return {
      ...base,
      comment: rowFresh.notes ?? null,
      purchaseLotLinesMigrationPending,
      inventoryMetrics,
      purchaseLines,
      purchaseTotals: {
        linesPurchaseTotalCOP: linesCanonicalSum.toFixed(2),
        /** Σ líneas con ítem de inventario resuelto (debe coincidir con suma de `items[].purchase` en datos consistentes). */
        fromLinkedInventoryLinesCOP:
          linkedLinesPurchaseTotal.toFixed(2),
        /** Σ líneas sin ítem enlazado (conceptos de factura no asignados a fila de inventario). */
        fromUnlinkedLinesCOP: unlinkedLinesPurchaseTotal.toFixed(2),
        /** Σ `linePurchaseTotalCOP` solo en ítems del lote listados en `items` que tengan comprobante. */
        fromLotInventoryItemsSubtotalCOP:
          inventoryItemsPurchaseSum.toFixed(2),
        lotTotalValueCOP:
          rowFresh.totalValue !== null
            ? new Prisma.Decimal(rowFresh.totalValue).toFixed(2)
            : null,
        totalValueVsLinesPurchaseMismatch:
          linesRaw.length > 0 ? mismatch : null,
        /** Suma de líneas del comprobante (= valor pagado registrado del lote cuando está alineado). */
        summaryLabel:
          '`linesPurchaseTotalCOP` = `fromLinkedInventoryLinesCOP` + `fromUnlinkedLinesCOP` (misma base que `inventoryMetrics.purchasedValueCOP` con líneas). `fromLotInventoryItemsSubtotalCOP` suma solo ítems en `items` con comprobante; debe coincidir con la parte enlazada si cada producto tiene su línea.',
      },
      items: lotItems.map((it) => ({
        id: it.id,
        name: it.name,
        categoryId: it.category.id,
        categoryName: categoryDisplayName(it.category.name),
        quantity: it.quantity.toString(),
        unit: it.unit,
        /** Costo unitario actual en inventario (valorización stock); puede diferir del histórico de compra. */
        unitCost: it.unitCost.toFixed(2),
        available: it.quantity.gt(0),
        /** `CONSUMABLE`: aplica lógica agotado/consumo. `CAPITAL_ASSET`: activo (compra única). */
        inventoryBehavior: inventoryConsumptionBehavior(it.category.name),
        /** Costo de compra histórico (comprobante): total o cantidad comprada × costo de línea; no baja a cero al consumir stock. */
        purchase: purchaseByInventoryId.get(it.id) ?? null,
      })),
      inventoryWithoutPurchaseLine,
      inventoryLink: {
        lotCode: rowFresh.code,
        activeItemCount,
        stockValueCOP: stockValueCOP.toFixed(0),
        note:
          'Costo de compra histórico: `purchaseLines` / `purchaseTotals.linesPurchaseTotalCOP` se conserva aunque el ítem ya esté consumido (existencias en cero). ' +
          '`stockValueCOP` es valor remanente en stock (Σ cantidad×costo actual), no el monto de factura. ' +
          'Ítems con `inventoryBehavior` = CAPITAL_ASSET (categoría activos): no usar etiquetas de insumo agotado/consumido.',
      },
    };
  }

  async update(idOrCode: string, dto: UpdatePurchaseLotDto) {
    const existing = await this.resolveLotByIdOrCode(idOrCode);
    if (!existing) {
      throw new NotFoundException('Purchase lot not found');
    }

    const full = await this.prisma.purchaseLot.findUnique({
      where: { id: existing.id },
      select: {
        id: true,
        code: true,
        supplier: true,
        purchaseDate: true,
        name: true,
        traceModifiedAt: true,
      },
    });
    if (!full) {
      throw new NotFoundException('Purchase lot not found');
    }

    let totalValueData: Prisma.Decimal | undefined;
    if (dto.totalValue !== undefined) {
      let lines: Array<{
        inventoryItemId: string | null;
        quantityPurchased: Prisma.Decimal;
        purchaseUnitCostCOP: Prisma.Decimal;
        lineTotalCOP: Prisma.Decimal;
      }> = [];
      try {
        lines = await this.prisma.purchaseLotLine.findMany({
          where: { purchaseLotCode: full.code.trim() },
          select: {
            inventoryItemId: true,
            quantityPurchased: true,
            purchaseUnitCostCOP: true,
            lineTotalCOP: true,
          },
        });
      } catch (e) {
        if (!isMissingPurchaseLotLinesTableError(e)) throw e;
        lines = [];
      }
      if (lines.length > 0) {
        const linkedIds = [
          ...new Set(
            lines
              .map((l) => l.inventoryItemId)
              .filter((id): id is string => !!id),
          ),
        ];
        const invRows =
          linkedIds.length > 0
            ? await this.prisma.inventory.findMany({
                where: { id: { in: linkedIds } },
                select: { id: true, unitCost: true, deletedAt: true },
              })
            : [];
        const ucMap = new Map(
          invRows
            .filter((r) => r.deletedAt === null)
            .map((r) => [r.id, r.unitCost] as const),
        );
        const enriched = lines.map((l) => ({
          quantityPurchased: l.quantityPurchased,
          purchaseUnitCostCOP: l.purchaseUnitCostCOP,
          lineTotalCOP: l.lineTotalCOP,
          inventoryUnitCostCOP: l.inventoryItemId
            ? ucMap.get(l.inventoryItemId)
            : undefined,
        }));
        try {
          assertPatchTotalValueCoherentWithLines(dto.totalValue, enriched);
        } catch (e) {
          if (e instanceof PurchaseLotTotalCoherenceError) {
            throw new BadRequestException(e.message);
          }
          throw e;
        }
        totalValueData = sumLineTotalsCOP(enriched);
      } else {
        totalValueData = new Prisma.Decimal(dto.totalValue);
      }
    }

    const mergedSupplier =
      dto.supplier !== undefined ? dto.supplier?.trim() || null : full.supplier;
    const mergedDate =
      dto.purchaseDate !== undefined
        ? new Date(dto.purchaseDate)
        : full.purchaseDate;

    const nameUpdate: { name?: string | null } = {};
    if (dto.name !== undefined) {
      nameUpdate.name = dto.name.trim() || null;
    } else if (dto.supplier !== undefined || dto.purchaseDate !== undefined) {
      nameUpdate.name = formatPurchaseLotShortName(
        mergedSupplier,
        mergedDate,
        { lotCode: full.code },
      );
    }

    const notesPatch =
      dto.comment !== undefined
        ? dto.comment.trim() === ''
          ? null
          : dto.comment.trim()
        : dto.notes !== undefined
          ? dto.notes.trim() === ''
            ? null
            : dto.notes.trim()
          : undefined;

    await this.prisma.purchaseLot.update({
      where: { id: full.id },
      data: {
        ...(dto.purchaseDate !== undefined ? { purchaseDate: mergedDate } : {}),
        ...(dto.supplier !== undefined ? { supplier: mergedSupplier } : {}),
        ...(notesPatch !== undefined ? { notes: notesPatch } : {}),
        ...(totalValueData !== undefined
          ? { totalValue: totalValueData }
          : {}),
        ...(dto.traceModifiedAt !== undefined
          ? {
              traceModifiedAt: dto.traceModifiedAt
                ? new Date(dto.traceModifiedAt)
                : null,
            }
          : {}),
        ...nameUpdate,
      },
    });
    this.invalidateListCache();
    return this.findOne(existing.id);
  }

  async replacePurchaseLotLines(
    idOrCode: string,
    dto: ReplacePurchaseLotLinesDto,
  ) {
    const lot = await this.resolveLotByIdOrCode(idOrCode);
    if (!lot) {
      throw new NotFoundException('Purchase lot not found');
    }

    const lotInventory = await this.prisma.inventory.findMany({
      where: { deletedAt: null, lot: lot.code },
      select: { id: true, name: true },
    });
    const invByNormalizedName = new Map<string, string | null>();
    for (const it of lotInventory) {
      const key = this.normalizeNameForMatch(it.name);
      if (!key) continue;
      const prev = invByNormalizedName.get(key);
      if (prev === undefined) invByNormalizedName.set(key, it.id);
      else if (prev !== it.id) invByNormalizedName.set(key, null);
    }

    const resolvedLines = dto.lines.map((ln) => {
      let resolvedInventoryItemId = ln.inventoryItemId ?? null;
      if (!resolvedInventoryItemId) {
        const key = this.normalizeNameForMatch(ln.lineName);
        const matched = key ? invByNormalizedName.get(key) : undefined;
        if (matched) resolvedInventoryItemId = matched;
      }
      return { ...ln, inventoryItemId: resolvedInventoryItemId };
    });

    const seenInv = new Set<string>();
    const inventoryNameById = new Map<string, string>();
    for (const ln of resolvedLines) {
      if (ln.inventoryItemId) {
        if (seenInv.has(ln.inventoryItemId)) {
          throw new BadRequestException(
            `inventoryItemId duplicado en el comprobante: ${ln.inventoryItemId}`,
          );
        }
        seenInv.add(ln.inventoryItemId);
        const inv = await this.prisma.inventory.findFirst({
          where: { id: ln.inventoryItemId, deletedAt: null },
          select: { id: true, lot: true, name: true },
        });
        if (!inv || (inv.lot?.trim() ?? '') !== lot.code.trim()) {
          throw new BadRequestException(
            `El ítem de inventario ${ln.inventoryItemId} no pertenece al lote ${lot.code}.`,
          );
        }
        inventoryNameById.set(inv.id, inv.name);
      }
      if (ln.categoryId) {
        const cat = await this.prisma.category.findFirst({
          where: { id: ln.categoryId, type: CategoryType.INVENTORY },
          select: { id: true },
        });
        if (!cat) {
          throw new BadRequestException(
            `Categoría de inventario inválida: ${ln.categoryId}`,
          );
        }
      }
    }

    const inventoryUnitCostById = new Map<string, Prisma.Decimal>();
    const invByIdForLinked = new Map<
      string,
      { id: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal; unit: string }
    >();
    if (seenInv.size > 0) {
      const invRows = await this.prisma.inventory.findMany({
        where: { id: { in: [...seenInv] }, deletedAt: null },
        select: { id: true, unitCost: true, quantity: true, unit: true },
      });
      for (const r of invRows) {
        inventoryUnitCostById.set(r.id, r.unitCost);
        invByIdForLinked.set(r.id, r);
      }
    }

    const histByInventoryId = new Map<
      string,
      { qtyPurchased: Prisma.Decimal; lineTotal: Prisma.Decimal }
    >();
    await Promise.all(
      [...seenInv].map(async (id) => {
        const inv = invByIdForLinked.get(id);
        if (!inv) return;
        const h = await this.historicalPurchaseQtyAndLineTotal(
          id,
          inv.quantity,
          inv.unitCost,
        );
        histByInventoryId.set(id, h);
      }),
    );

    const linePartsForSum: Array<{
      quantityPurchased: Prisma.Decimal;
      purchaseUnitCostCOP: Prisma.Decimal;
      lineTotalCOP: Prisma.Decimal;
      inventoryUnitCostCOP?: Prisma.Decimal;
    }> = [];
    const rows: Prisma.PurchaseLotLineCreateManyInput[] = [];
    let sortIdx = 0;
    for (const ln of resolvedLines) {
      const invUC = ln.inventoryItemId
        ? inventoryUnitCostById.get(ln.inventoryItemId)
        : undefined;

      let qty: Prisma.Decimal;
      let uc: Prisma.Decimal;
      let unit: string;
      let explicit: Prisma.Decimal;

      if (ln.inventoryItemId) {
        const inv = invByIdForLinked.get(ln.inventoryItemId);
        if (!inv) {
          throw new BadRequestException(
            `Ítem de inventario no encontrado: ${ln.inventoryItemId}`,
          );
        }
        const hist = histByInventoryId.get(ln.inventoryItemId);
        if (!hist) {
          throw new BadRequestException(
            `No se pudo calcular cantidad histórica para ${ln.inventoryItemId}.`,
          );
        }
        qty = hist.qtyPurchased;
        uc = new Prisma.Decimal(ln.purchaseUnitCostCOP);
        unit = inv.unit.trim();
        explicit =
          ln.lineTotalCOP != null && ln.lineTotalCOP !== undefined
            ? new Prisma.Decimal(ln.lineTotalCOP)
            : new Prisma.Decimal(0);
      } else {
        qty = new Prisma.Decimal(ln.quantityPurchased);
        uc = new Prisma.Decimal(ln.purchaseUnitCostCOP);
        unit = ln.unit.trim();
        explicit =
          ln.lineTotalCOP != null && ln.lineTotalCOP !== undefined
            ? new Prisma.Decimal(ln.lineTotalCOP)
            : new Prisma.Decimal(0);
      }

      const part = {
        quantityPurchased: qty,
        purchaseUnitCostCOP: uc,
        lineTotalCOP: explicit,
        inventoryUnitCostCOP: invUC,
      };
      linePartsForSum.push(part);
      const lt = lineTotalForPurchaseAggregationCOP(part);
      rows.push({
        purchaseLotCode: lot.code,
        inventoryItemId: ln.inventoryItemId ?? null,
        lineName: ln.inventoryItemId
          ? (inventoryNameById.get(ln.inventoryItemId) ?? ln.lineName.trim())
          : ln.lineName.trim(),
        categoryId: ln.categoryId?.trim() || null,
        quantityPurchased: qty,
        unit,
        purchaseUnitCostCOP: uc,
        lineTotalCOP: lt,
        lineComment: this.trimLineComment(ln.lineComment),
        sortOrder: ln.sortOrder ?? sortIdx,
      });
      sortIdx += 1;
    }

    const sumLines = sumLineTotalsCOP(linePartsForSum);

    if (dto.expectedTotalValueCOP !== undefined) {
      const expected = new Prisma.Decimal(dto.expectedTotalValueCOP);
      if (!purchaseTotalsWithinTolerance(expected, sumLines)) {
        throw new BadRequestException(
          `expectedTotalValueCOP (${expected.toFixed(0)}) no coincide con la suma de líneas (${sumLines.toFixed(0)} COP).`,
        );
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.purchaseLotLine.deleteMany({
          where: { purchaseLotCode: lot.code },
        });
        if (rows.length) {
          await tx.purchaseLotLine.createMany({ data: rows });
        }
        await tx.purchaseLot.update({
          where: { id: lot.id },
          data: { totalValue: sumLines },
        });
      });
    } catch (e) {
      if (isMissingPurchaseLotLinesTableError(e)) {
        throw new BadRequestException(
          'La tabla purchase_lot_lines no existe en esta base de datos. En el servidor ejecute: npx prisma migrate deploy (o npm run db:migrate). Luego npm run db:backfill-purchase-lot-lines si hace falta.',
        );
      }
      throw e;
    }

    await this.syncInventoryItemCountForLotCode(lot.code);
    this.invalidateListCache();
    return this.findOne(lot.id);
  }
}
