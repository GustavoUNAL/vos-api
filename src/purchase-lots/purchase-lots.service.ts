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
  deriveBackfillQuantityPurchased,
  lineQuantityConsumed,
  lineTotalFromQtyAndUnitCost,
  purchaseTotalsWithinTolerance,
} from '../common/purchase-lot-line-math';
import { isMissingPurchaseLotLinesTableError } from '../common/prisma-purchase-lot-line-table';
import {
  inventoryStockValueForLotCode,
  syncPurchaseLotItemCountFromInventory,
} from '../common/sync-purchase-lot-aggregates';
import { PrismaService } from '../prisma/prisma.service';
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
  /** Hay líneas de comprobante; costo de compra por línea es la fuente de verdad. */
  purchaseLinesAuthoritative: boolean;
  /** `true` si `totalValue` del lote no coincide con la suma de `line_total_cop` (tolerancia 1 COP). */
  totalValueVsLinesPurchaseMismatch: boolean | null;
};

type LineForMetrics = {
  quantityPurchased: Prisma.Decimal;
  lineTotalCOP: Prisma.Decimal;
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
  purchaseDate: true,
  supplier: true,
  notes: true,
  itemCount: true,
  totalValue: true,
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

  /**
   * Valores mostrados como “costo de compra”: si la fila del comprobante viene en 0,
   * se completa desde inventario (`unit_cost`) o desde total÷cantidad comprada.
   */
  private effectivePurchaseDisplayAmounts(
    ln: {
      quantityPurchased: Prisma.Decimal;
      purchaseUnitCostCOP: Prisma.Decimal;
      lineTotalCOP: Prisma.Decimal;
    },
    inventoryUnitCost: Prisma.Decimal | null | undefined,
  ): { unitCost: Prisma.Decimal; lineTotal: Prisma.Decimal } {
    let unit = ln.purchaseUnitCostCOP;
    let total = ln.lineTotalCOP;

    if (ln.quantityPurchased.gt(0) && total.gt(0)) {
      unit = total.div(ln.quantityPurchased);
    } else if (unit.lte(0) && inventoryUnitCost != null && inventoryUnitCost.gt(0)) {
      unit = inventoryUnitCost;
    }

    if (total.lte(0) && unit.gt(0) && ln.quantityPurchased.gt(0)) {
      total = unit.mul(ln.quantityPurchased);
    }
    if (total.lte(0) && unit.gt(0)) {
      total = unit;
    }

    return { unitCost: unit, lineTotal: total };
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
    // Sin movimientos y sin stock: conservar al menos el costo unitario como una fila de compra (evita total 0).
    if (qtyPurchased.lte(0) && unitCost.gt(0)) {
      qtyPurchased = new Prisma.Decimal(1);
    }
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
        pv = pv.add(ln.lineTotalCOP);
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
      purchasedValueCOP: purchasedValueCOP?.toFixed(0) ?? null,
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

  private async sumLineTotalsForLotCode(code: string): Promise<Prisma.Decimal> {
    try {
      const agg = await this.prisma.purchaseLotLine.aggregate({
        where: { purchaseLotCode: code.trim() },
        _sum: { lineTotalCOP: true },
      });
      return agg._sum.lineTotalCOP ?? new Prisma.Decimal(0);
    } catch (e) {
      if (isMissingPurchaseLotLinesTableError(e)) {
        return new Prisma.Decimal(0);
      }
      throw e;
    }
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
    await this.prisma.purchaseLot.upsert({
      where: { code: c },
      create: {
        code: c,
        purchaseDate: options?.purchaseDate ?? new Date(),
        supplier: options?.supplier?.trim() || null,
      },
      update: {},
    });
    this.invalidateListCache();
  }

  /**
   * Tras crear inventario con lote: línea de comprobante con costo/cantidad comprada congelados.
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
    const { qtyPurchased, lineTotal } = await this.historicalPurchaseQtyAndLineTotal(
      inv.id,
      inv.quantity,
      inv.unitCost,
    );
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
          lineTotalCOP: lineTotal,
          sortOrder: 0,
        },
        update: {
          purchaseLotCode: lot,
          lineName: inv.name,
          categoryId: inv.categoryId,
        },
      });
    } catch (e) {
      if (!isMissingPurchaseLotLinesTableError(e)) throw e;
    }
    this.invalidateListCache();
  }

  /**
   * Tras actualizar inventario: metadatos y lote de la línea; nunca recalcula costo/cantidad comprada
   * salvo que no exista línea y el ítem quede enlazado a un lote (primera asociación).
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
      if (!lotAfter) {
        await this.prisma.purchaseLotLine.deleteMany({
          where: { inventoryItemId: inventoryId },
        });
        return;
      }

      const existingLine = await this.prisma.purchaseLotLine.findUnique({
        where: { inventoryItemId: inventoryId },
        select: { id: true },
      });

      if (!existingLine) {
        const { qtyPurchased, lineTotal } =
          await this.historicalPurchaseQtyAndLineTotal(
            inventoryId,
            inventoryAfter.quantity,
            inventoryAfter.unitCost,
          );
        await this.prisma.purchaseLotLine.create({
          data: {
            purchaseLotCode: lotAfter,
            inventoryItemId: inventoryId,
            lineName: inventoryAfter.name,
            categoryId: inventoryAfter.categoryId,
            quantityPurchased: qtyPurchased,
            unit: inventoryAfter.unit,
            purchaseUnitCostCOP: inventoryAfter.unitCost,
            lineTotalCOP: lineTotal,
            sortOrder: 0,
          },
        });
        return;
      }

      await this.prisma.purchaseLotLine.update({
        where: { inventoryItemId: inventoryId },
        data: {
          purchaseLotCode: lotAfter,
          lineName: inventoryAfter.name,
          categoryId: inventoryAfter.categoryId,
        },
      });
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
    T extends { code: string; supplier: string | null },
  >(row: T, fallback: Map<string, string>) {
    const fromLot = row.supplier?.trim() || null;
    const resolved = fromLot || fallback.get(row.code.trim()) || null;
    return { ...row, supplierResolved: resolved };
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
      const catName =
        invRow?.category?.name ?? ln.category?.name ?? undefined;
      arr.push({
        quantityPurchased: ln.quantityPurchased,
        lineTotalCOP: ln.lineTotalCOP,
        quantityRemaining: rem,
        isCapitalAsset: isCapitalAssetCategoryName(catName),
      });
      result.set(code, arr);
    }

    return { linesByCode: result, migrationPending: false };
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
    const fallback = await this.supplierFromInventoryByCode([row.code]);
    const base = this.withResolvedSupplier(row, fallback);
    const { activeItemCount, stockValueCOP } =
      await inventoryStockValueForLotCode(this.prisma, row.code);

    const lotItems = await this.prisma.inventory.findMany({
      where: { deletedAt: null, lot: row.code },
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
        where: { purchaseLotCode: row.code },
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
      const invUC = invId ? invUnitCostById.get(invId) : undefined;
      const { lineTotal } = this.effectivePurchaseDisplayAmounts(ln, invUC);
      const catName =
        ln.category?.name ?? (invId ? invCategoryNameById.get(invId) : undefined);
      return {
        quantityPurchased: ln.quantityPurchased,
        lineTotalCOP: lineTotal,
        quantityRemaining: rem,
        isCapitalAsset: isCapitalAssetCategoryName(catName),
      };
    });

    const inventoryMetrics = this.buildLotInventoryMetrics(
      row.purchaseDate,
      lotItems.map((it) => ({
        quantity: it.quantity,
        unitCost: it.unitCost,
        categoryName: it.category.name,
      })),
      lineMetrics.length ? lineMetrics : null,
      row.totalValue,
    );

    const linesPurchaseTotal = linesRaw.reduce((acc, ln) => {
      const invId = resolveLineInventoryId(ln);
      const invUC = invId ? invUnitCostById.get(invId) : undefined;
      const { lineTotal } = this.effectivePurchaseDisplayAmounts(ln, invUC);
      return acc.add(lineTotal);
    }, new Prisma.Decimal(0));

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

    const purchaseLines = linesRaw.map((ln) => {
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
      const { unitCost: displayUnit, lineTotal: displayLineTotal } =
        this.effectivePurchaseDisplayAmounts(ln, invUC);
      return {
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
        linePurchaseTotalCOP: displayLineTotal.toFixed(0),
        inventoryItemId: resolvedInventoryItemId,
        quantityRemaining: remaining.toString(),
        quantityConsumed: consumed.toString(),
        sortOrder: ln.sortOrder,
      };
    });

    const mismatch =
      row.totalValue !== null && linesRaw.length > 0
        ? !purchaseTotalsWithinTolerance(
            new Prisma.Decimal(row.totalValue),
            linesPurchaseTotal,
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

    return {
      ...base,
      purchaseLotLinesMigrationPending,
      inventoryMetrics,
      purchaseLines,
      purchaseTotals: {
        linesPurchaseTotalCOP: linesPurchaseTotal.toFixed(0),
        lotTotalValueCOP:
          row.totalValue !== null ? new Prisma.Decimal(row.totalValue).toFixed(0) : null,
        totalValueVsLinesPurchaseMismatch: linesRaw.length > 0 ? mismatch : null,
        /** Suma de líneas del comprobante (= valor pagado registrado del lote cuando está alineado). */
        summaryLabel:
          'Total compra del lote (suma líneas comprobante / factura): usar `linesPurchaseTotalCOP`.',
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
        /** Costo de compra histórico por ítem (comprobante); usar para columna «Costo compra». */
        purchase: purchaseByInventoryId.get(it.id) ?? null,
      })),
      inventoryWithoutPurchaseLine,
      inventoryLink: {
        lotCode: row.code,
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

    if (dto.totalValue !== undefined) {
      const linesSum = await this.sumLineTotalsForLotCode(existing.code);
      if (linesSum.gt(0)) {
        const incoming = new Prisma.Decimal(dto.totalValue);
        if (!purchaseTotalsWithinTolerance(incoming, linesSum)) {
          throw new BadRequestException(
            `totalValue (${incoming.toFixed(2)} COP) no coincide con la suma de líneas de comprobante (${linesSum.toFixed(2)} COP). ` +
              'El costo de compra no puede “borrarse” por consumo; ajuste las líneas con PUT /purchase-lots/:id/purchase-lines o alinee el total.',
          );
        }
      }
    }

    await this.prisma.purchaseLot.update({
      where: { id: existing.id },
      data: {
        ...(dto.purchaseDate !== undefined
          ? { purchaseDate: new Date(dto.purchaseDate) }
          : {}),
        ...(dto.supplier !== undefined ? { supplier: dto.supplier || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        ...(dto.totalValue !== undefined
          ? { totalValue: new Prisma.Decimal(dto.totalValue) }
          : {}),
      },
    });
    this.invalidateListCache();
    return this.findOne(existing.id);
  }

  async replacePurchaseLotLines(idOrCode: string, dto: ReplacePurchaseLotLinesDto) {
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

    let sumLines = new Prisma.Decimal(0);
    const rows: Prisma.PurchaseLotLineCreateManyInput[] = [];
    let sortIdx = 0;
    for (const ln of resolvedLines) {
      const qty = new Prisma.Decimal(ln.quantityPurchased);
      const uc = new Prisma.Decimal(ln.purchaseUnitCostCOP);
      const lt = lineTotalFromQtyAndUnitCost(qty, uc);
      sumLines = sumLines.add(lt);
      rows.push({
        purchaseLotCode: lot.code,
        inventoryItemId: ln.inventoryItemId ?? null,
        lineName: ln.inventoryItemId
          ? (inventoryNameById.get(ln.inventoryItemId) ?? ln.lineName.trim())
          : ln.lineName.trim(),
        categoryId: ln.categoryId?.trim() || null,
        quantityPurchased: qty,
        unit: ln.unit.trim(),
        purchaseUnitCostCOP: uc,
        lineTotalCOP: lt,
        sortOrder: ln.sortOrder ?? sortIdx,
      });
      sortIdx += 1;
    }

    if (dto.expectedTotalValueCOP !== undefined) {
      const expected = new Prisma.Decimal(dto.expectedTotalValueCOP);
      if (!purchaseTotalsWithinTolerance(expected, sumLines)) {
        throw new BadRequestException(
          `expectedTotalValueCOP (${expected.toFixed(2)}) no coincide con la suma de líneas (${sumLines.toFixed(2)}).`,
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
