import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoryType, Prisma, StockMovementType } from '@prisma/client';
import { mapCategoryRelation } from '../common/category-display-name';
import { generateInternalInventoryEan13 } from '../common/inventory-internal-barcode';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseLotsService } from '../purchase-lots/purchase-lots.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

type PaginationParams = {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  /** Código de lote (`inventory.lot` = `purchase_lots.code`). */
  lot?: string;
  /** Filtro exacto por `trace_product_code`. */
  traceProductCode?: string;
  /** Filtro exacto por `internal_barcode`. */
  internalBarcode?: string;
  /** Si true, agrega `stats` por ítem desde `stock_movements` (estado físico vs historial). */
  includeStats?: boolean;
};

type MovementSums = {
  IN: Prisma.Decimal;
  OUT: Prisma.Decimal;
  SALE: Prisma.Decimal;
  WASTE: Prisma.Decimal;
  ADJUSTMENT: Prisma.Decimal;
};

type CacheEntry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
};

const zero = () => new Prisma.Decimal(0);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseLotsService: PurchaseLotsService,
  ) {}
  private readonly freshTtlMs = 15_000;
  private readonly staleTtlMs = 120_000;
  private readonly listCache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

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

  /** Agrega cantidades por tipo de movimiento para los ítems dados. */
  private async movementSumsByInventoryIds(
    ids: string[],
  ): Promise<Map<string, MovementSums>> {
    const map = new Map<string, MovementSums>();
    if (!ids.length) return map;

    const rows = await this.prisma.stockMovement.groupBy({
      by: ['inventoryItemId', 'type'],
      where: { inventoryItemId: { in: ids } },
      _sum: { quantity: true },
    });

    const ensure = (id: string): MovementSums => {
      let m = map.get(id);
      if (!m) {
        m = {
          IN: zero(),
          OUT: zero(),
          SALE: zero(),
          WASTE: zero(),
          ADJUSTMENT: zero(),
        };
        map.set(id, m);
      }
      return m;
    };

    for (const r of rows) {
      const q = r._sum.quantity ?? zero();
      const slot = ensure(r.inventoryItemId);
      switch (r.type) {
        case StockMovementType.IN:
          slot.IN = slot.IN.add(q);
          break;
        case StockMovementType.OUT:
          slot.OUT = slot.OUT.add(q);
          break;
        case StockMovementType.SALE:
          slot.SALE = slot.SALE.add(q);
          break;
        case StockMovementType.WASTE:
          slot.WASTE = slot.WASTE.add(q);
          break;
        case StockMovementType.ADJUSTMENT:
          slot.ADJUSTMENT = slot.ADJUSTMENT.add(q);
          break;
        default:
          break;
      }
    }
    return map;
  }

  private buildPhysicalStats(
    row: { quantity: Prisma.Decimal; minStock: Prisma.Decimal | null },
    sums: MovementSums,
  ) {
    const consumedTotal = sums.SALE.add(sums.OUT);
    const onHand = row.quantity;
    const min = row.minStock;
    const belowMinimum = min !== null && onHand.lt(min);

    return {
      onHand: onHand.toString(),
      minStock: min !== null ? min.toString() : null,
      belowMinimum,
      movements: {
        /** Entradas de stock registradas (compras / recepciones). */
        received: sums.IN.toString(),
        /** Consumo por recetas en ventas. */
        consumedViaSales: sums.SALE.toString(),
        /** Salidas manuales u operativas (no venta). */
        consumedViaOut: sums.OUT.toString(),
        /** Total “consumido” en sentido amplio (ventas + salidas). */
        consumedTotal: consumedTotal.toString(),
        /** Mermas / pérdidas. */
        waste: sums.WASTE.toString(),
        /** Ajustes de inventario (conteo, correcciones). */
        adjustment: sums.ADJUSTMENT.toString(),
      },
    };
  }

  private async requireInventoryCategoryId(id: string) {
    const c = await this.prisma.category.findFirst({
      where: { id, type: CategoryType.INVENTORY },
      select: { id: true },
    });
    if (!c) {
      throw new NotFoundException('Inventory category not found');
    }
    return c.id;
  }

  private normalizeLotInput(lot: string | null | undefined): string | null {
    const t = lot?.trim();
    return t && t.length > 0 ? t : null;
  }

  private normalizeTraceProductCode(
    raw: string | null | undefined,
  ): string | null {
    const t = raw?.trim();
    return t && t.length > 0 ? t : null;
  }

  private async allocateUniqueInternalBarcode(): Promise<string> {
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = generateInternalInventoryEan13();
      const clash = await this.prisma.inventory.findUnique({
        where: { internalBarcode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new Error('No se pudo generar internalBarcode único');
  }

  async create(dto: CreateInventoryDto) {
    const categoryId = await this.requireInventoryCategoryId(dto.categoryId);
    const lot = this.normalizeLotInput(dto.lot);
    if (lot) {
      await this.purchaseLotsService.ensurePurchaseLotRowForCode(lot, {
        supplier: dto.supplier,
      });
    }
    const internalBarcode = await this.allocateUniqueInternalBarcode();
    const traceProductCode = this.normalizeTraceProductCode(dto.traceProductCode);
    const row = await this.prisma.inventory.create({
      data: {
        name: dto.name,
        categoryId,
        quantity: new Prisma.Decimal(dto.quantity),
        unit: dto.unit,
        unitCost: new Prisma.Decimal(dto.unitCost),
        supplier: dto.supplier ?? null,
        lot,
        internalBarcode,
        traceProductCode,
        minStock:
          dto.minStock !== undefined ? new Prisma.Decimal(dto.minStock) : null,
      },
      include: { category: true },
    });
    const created = {
      ...row,
      category: mapCategoryRelation(row.category),
    };
    await this.purchaseLotsService.ensurePurchaseLotLineFromInventorySnapshot({
      id: row.id,
      lot: row.lot,
      name: row.name,
      categoryId: row.categoryId,
      quantity: row.quantity,
      unit: row.unit,
      unitCost: row.unitCost,
    });
    await this.purchaseLotsService.syncInventoryItemCountForLotCode(row.lot);
    this.invalidateListCache();
    return created;
  }

  async findAll(params: PaginationParams) {
    const cacheKey = JSON.stringify({
      page: params.page,
      limit: params.limit,
      search: params.search?.trim() ?? '',
      categoryId: params.categoryId?.trim() ?? '',
      lot: params.lot?.trim() ?? '',
      traceProductCode: params.traceProductCode?.trim() ?? '',
      internalBarcode: params.internalBarcode?.trim() ?? '',
      includeStats: !!params.includeStats,
    });
    const fresh = this.getFresh<unknown>(cacheKey);
    if (fresh) return fresh;
    const stale = this.getStale<unknown>(cacheKey);
    if (stale) {
      if (!this.inFlight.has(cacheKey)) {
        const bg = this.queryFindAll(params)
          .then((data) => this.setCache(cacheKey, data))
          .finally(() => this.inFlight.delete(cacheKey));
        this.inFlight.set(cacheKey, bg);
      }
      return stale;
    }
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;
    const task = this.queryFindAll(params)
      .then((data) => {
        this.setCache(cacheKey, data);
        return data;
      })
      .finally(() => this.inFlight.delete(cacheKey));
    this.inFlight.set(cacheKey, task);
    return task;
  }

  private async queryFindAll(params: PaginationParams) {
    const page = Math.max(1, Math.trunc(params.page));
    const hasLotFilter = !!params.lot?.trim().length;
    const maxLimit = hasLotFilter ? 1000 : 100;
    const limit = Math.min(maxLimit, Math.max(1, Math.trunc(params.limit)));
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryWhereInput = {
      deletedAt: null,
      ...(params.lot?.trim().length ? { lot: params.lot.trim() } : {}),
      ...(params.traceProductCode?.trim().length
        ? { traceProductCode: params.traceProductCode.trim() }
        : {}),
      ...(params.internalBarcode?.trim().length
        ? { internalBarcode: params.internalBarcode.trim() }
        : {}),
      ...(params.search?.trim().length
        ? {
            OR: [
              { name: { contains: params.search.trim(), mode: 'insensitive' } },
              {
                internalBarcode: {
                  contains: params.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                traceProductCode: {
                  contains: params.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(params.categoryId?.trim().length
        ? { categoryId: params.categoryId.trim() }
        : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.inventory.count({ where }),
      this.prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: { category: true },
      }),
    ]);

    const listMeta = {
      page,
      limit,
      total,
      hasNextPage: skip + data.length < total,
      ...(params.lot?.trim().length ? { lotFilter: params.lot.trim() } : {}),
    };

    if (!params.includeStats) {
      return {
        data: data.map((row) => ({
          ...row,
          category: mapCategoryRelation(row.category),
        })),
        meta: listMeta,
      };
    }

    const sumsMap = await this.movementSumsByInventoryIds(
      data.map((d) => d.id),
    );
    const dataWithStats = data.map((row) => {
      const sums = sumsMap.get(row.id) ?? {
        IN: zero(),
        OUT: zero(),
        SALE: zero(),
        WASTE: zero(),
        ADJUSTMENT: zero(),
      };
      return {
        ...row,
        category: mapCategoryRelation(row.category),
        stats: this.buildPhysicalStats(row, sums),
      };
    });

    return {
      data: dataWithStats,
      meta: listMeta,
    };
  }

  async findOne(id: string, includeStats?: boolean) {
    const row = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
    if (!row) {
      throw new NotFoundException('Inventory item not found');
    }
    if (!includeStats) {
      return {
        ...row,
        category: mapCategoryRelation(row.category),
      };
    }
    const sumsMap = await this.movementSumsByInventoryIds([id]);
    const sums = sumsMap.get(id) ?? {
      IN: zero(),
      OUT: zero(),
      SALE: zero(),
      WASTE: zero(),
      ADJUSTMENT: zero(),
    };
    return {
      ...row,
      category: mapCategoryRelation(row.category),
      stats: this.buildPhysicalStats(row, sums),
    };
  }

  async update(id: string, dto: UpdateInventoryDto) {
    const existing = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, lot: true },
    });
    if (!existing) {
      throw new NotFoundException('Inventory item not found');
    }

    let categoryId: string | undefined;
    if (dto.categoryId !== undefined) {
      categoryId = await this.requireInventoryCategoryId(dto.categoryId);
    }

    const previousLot = existing.lot?.trim() || '';

    let lotPatch: string | null | undefined;
    if (dto.lot !== undefined) {
      lotPatch = this.normalizeLotInput(dto.lot);
      if (lotPatch) {
        await this.purchaseLotsService.ensurePurchaseLotRowForCode(lotPatch, {
          supplier: dto.supplier,
        });
      }
    }

    const updated = await this.prisma.inventory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(dto.quantity !== undefined
          ? { quantity: new Prisma.Decimal(dto.quantity) }
          : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.unitCost !== undefined
          ? { unitCost: new Prisma.Decimal(dto.unitCost) }
          : {}),
        ...(dto.supplier !== undefined
          ? { supplier: dto.supplier || null }
          : {}),
        ...(dto.lot !== undefined ? { lot: lotPatch ?? null } : {}),
        ...(dto.minStock !== undefined
          ? { minStock: new Prisma.Decimal(dto.minStock) }
          : {}),
        ...(dto.traceProductCode !== undefined
          ? {
              traceProductCode: this.normalizeTraceProductCode(
                dto.traceProductCode,
              ),
            }
          : {}),
      },
      include: { category: true },
    });
    const out = { ...updated, category: mapCategoryRelation(updated.category) };
    const newLot = updated.lot?.trim() || '';
    if (
      newLot &&
      dto.supplier !== undefined &&
      dto.lot === undefined &&
      lotPatch === undefined
    ) {
      await this.purchaseLotsService.ensurePurchaseLotRowForCode(newLot, {
        supplier: updated.supplier,
      });
    }
    await this.purchaseLotsService.reconcilePurchaseLotLineAfterInventoryChange(
      {
        inventoryId: id,
        inventoryAfter: {
          id: updated.id,
          lot: updated.lot,
          name: updated.name,
          categoryId: updated.categoryId,
          quantity: updated.quantity,
          unit: updated.unit,
          unitCost: updated.unitCost,
        },
      },
    );
    const lotsToSync = new Set<string>();
    if (previousLot) lotsToSync.add(previousLot);
    if (newLot) lotsToSync.add(newLot);
    for (const code of lotsToSync) {
      await this.purchaseLotsService.syncInventoryItemCountForLotCode(code);
    }
    this.invalidateListCache();
    return out;
  }

  async remove(id: string) {
    const existing = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, lot: true },
    });
    if (!existing) {
      throw new NotFoundException('Inventory item not found');
    }

    const archived = await this.prisma.inventory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.purchaseLotsService.syncInventoryItemCountForLotCode(
      existing.lot,
    );
    this.invalidateListCache();
    return archived;
  }

  async findByInternalBarcode(barcode: string) {
    const b = barcode.replace(/\s+/g, '').trim();
    if (!b.length) {
      throw new BadRequestException('internalBarcode vacío');
    }
    const row = await this.prisma.inventory.findFirst({
      where: { internalBarcode: b, deletedAt: null },
      include: { category: true },
    });
    if (!row) {
      throw new NotFoundException('Ítem de inventario no encontrado para ese código');
    }
    return {
      ...row,
      category: mapCategoryRelation(row.category),
    };
  }

  async getPurchaseTraceSummary(traceProductCode: string) {
    const code = traceProductCode.trim();
    if (!code.length) {
      throw new BadRequestException('traceProductCode vacío');
    }
    const rows = await this.prisma.inventory.findMany({
      where: { traceProductCode: code, deletedAt: null },
      select: {
        id: true,
        name: true,
        lot: true,
        internalBarcode: true,
        traceProductCode: true,
        quantity: true,
        unit: true,
        unitCost: true,
        supplier: true,
        createdAt: true,
      },
      orderBy: [{ lot: 'asc' }, { name: 'asc' }],
    });
    const distinctLots = [
      ...new Set(
        rows.map((r) => r.lot?.trim()).filter((l): l is string => !!l?.length),
      ),
    ];
    return {
      traceProductCode: code,
      distinctPurchaseLotsCount: distinctLots.length,
      distinctPurchaseLotCodes: distinctLots,
      activeInventoryItemsCount: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        lot: r.lot,
        internalBarcode: r.internalBarcode,
        traceProductCode: r.traceProductCode,
        quantity: r.quantity.toString(),
        unit: r.unit,
        unitCost: r.unitCost.toFixed(2),
        supplier: r.supplier,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
