import { Prisma } from '@prisma/client';

const zero = () => new Prisma.Decimal(0);

/** Redondeo de montos COP a entero (half-up), mínimo 0. */
export function roundMoneyCOP(d: Prisma.Decimal | string | number): Prisma.Decimal {
  const x = new Prisma.Decimal(d);
  if (x.lte(0)) return zero();
  return x.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/** Campos mínimos para total de línea de comprobante (persistidos o DTO). */
export type PurchaseLotLineTotalsInput = {
  quantityPurchased: Prisma.Decimal | string | number;
  purchaseUnitCostCOP: Prisma.Decimal | string | number;
  lineTotalCOP: Prisma.Decimal | string | number;
};

/** Entrada para sumar totales de comprobante; `inventoryUnitCostCOP` cubre líneas viejas sin monto en factura. */
export type PurchaseLotLineAggregationInput = PurchaseLotLineTotalsInput & {
  inventoryUnitCostCOP?: Prisma.Decimal | string | number | null;
};

export class PurchaseLotTotalCoherenceError extends Error {
  readonly name = 'PurchaseLotTotalCoherenceError';
  constructor(
    message: string,
    readonly sumLinesCOP: Prisma.Decimal,
    readonly incomingTotalCOP: Prisma.Decimal,
  ) {
    super(message);
  }
}

/**
 * Para migración / backfill: estima cantidad comprada cuando no hay líneas de comprobante.
 * Si hay movimientos IN, se usa su suma; si no, stock actual + salidas (SALE+OUT+WASTE).
 */
export function deriveBackfillQuantityPurchased(
  currentQty: Prisma.Decimal,
  sumIn: Prisma.Decimal,
  sumOutSaleWaste: Prisma.Decimal,
): Prisma.Decimal {
  if (sumIn.gt(0)) return sumIn;
  return currentQty.add(sumOutSaleWaste);
}

/** Consumido en la línea = max(0, comprado − existencia actual). */
export function lineQuantityConsumed(
  quantityPurchased: Prisma.Decimal,
  quantityRemaining: Prisma.Decimal,
): Prisma.Decimal {
  const d = quantityPurchased.sub(quantityRemaining);
  return d.lt(0) ? zero() : d;
}

export function lineTotalFromQtyAndUnitCost(
  qty: Prisma.Decimal,
  unitCost: Prisma.Decimal,
): Prisma.Decimal {
  return qty.mul(unitCost);
}

/**
 * Costo de compra mostrado por línea de comprobante: **histórico**, no depende de
 * cuánto quede hoy en inventario. Orden: `line_total_cop` si es positivo; si no,
 * `purchase_unit_cost_cop × quantity_purchased`; último recurso, costo unitario
 * del ítem (filas viejas sin monto en comprobante).
 */
export function purchaseLineHistoricalAmounts(
  ln: {
    quantityPurchased: Prisma.Decimal;
    purchaseUnitCostCOP: Prisma.Decimal;
    lineTotalCOP: Prisma.Decimal;
  },
  inventoryUnitCostFallback: Prisma.Decimal | null | undefined,
): { unitCost: Prisma.Decimal; lineTotal: Prisma.Decimal } {
  const qty = ln.quantityPurchased;
  const dbUnit = new Prisma.Decimal(ln.purchaseUnitCostCOP);
  const dbTotal = new Prisma.Decimal(ln.lineTotalCOP);
  const inv =
    inventoryUnitCostFallback != null &&
    new Prisma.Decimal(inventoryUnitCostFallback).gt(0)
      ? new Prisma.Decimal(inventoryUnitCostFallback)
      : null;

  if (dbTotal.gt(0)) {
    const unit = qty.gt(0)
      ? dbTotal.div(qty)
      : dbUnit.gt(0)
        ? dbUnit
        : (inv ?? dbTotal);
    return { unitCost: unit, lineTotal: dbTotal };
  }

  if (qty.gt(0) && dbUnit.gt(0)) {
    return { unitCost: dbUnit, lineTotal: dbUnit.mul(qty) };
  }

  if (qty.gt(0) && inv != null) {
    return { unitCost: inv, lineTotal: inv.mul(qty) };
  }

  if (dbUnit.gt(0)) {
    return { unitCost: dbUnit, lineTotal: dbUnit };
  }

  if (inv != null) {
    return { unitCost: inv, lineTotal: inv };
  }

  return { unitCost: zero(), lineTotal: zero() };
}

function normalizeInventoryFallback(
  v: Prisma.Decimal | string | number | null | undefined,
): Prisma.Decimal | undefined {
  if (v === null || v === undefined) return undefined;
  const d = new Prisma.Decimal(v);
  return d.gt(0) ? d : undefined;
}

/**
 * Total de línea en COP enteros para comprobante y total de lote: orden histórico
 * (`purchaseLineHistoricalAmounts`, incl. costo unitario inventario si el comprobante va en cero)
 * y redondeo `roundMoneyCOP`.
 */
export function lineTotalForPurchaseAggregationCOP(
  ln: PurchaseLotLineAggregationInput,
): Prisma.Decimal {
  const inv = normalizeInventoryFallback(ln.inventoryUnitCostCOP);
  const { lineTotal } = purchaseLineHistoricalAmounts(
    {
      quantityPurchased: new Prisma.Decimal(ln.quantityPurchased),
      purchaseUnitCostCOP: new Prisma.Decimal(ln.purchaseUnitCostCOP),
      lineTotalCOP: new Prisma.Decimal(ln.lineTotalCOP),
    },
    inv,
  );
  return roundMoneyCOP(lineTotal);
}

/** Total de línea solo con campos de comprobante (sin `inventoryUnitCostCOP` en el objeto). */
export function lineTotalFromPurchaseParts(
  ln: PurchaseLotLineTotalsInput,
): Prisma.Decimal {
  return lineTotalForPurchaseAggregationCOP(ln);
}

/** Σ totales de línea (misma base que `total_value` del lote cuando hay líneas). */
export function sumLineTotalsCOP(
  lines: ReadonlyArray<PurchaseLotLineAggregationInput>,
): Prisma.Decimal {
  let acc = zero();
  for (const ln of lines) {
    acc = acc.add(lineTotalForPurchaseAggregationCOP(ln));
  }
  return acc;
}

/** Tolerancia COP para comparar total de factura vs suma de líneas (redondeos). */
export function purchaseTotalsWithinTolerance(
  a: Prisma.Decimal,
  b: Prisma.Decimal,
  toleranceCOP: Prisma.Decimal = new Prisma.Decimal('1'),
): boolean {
  return a.sub(b).abs().lte(toleranceCOP);
}

/**
 * PATCH de lote: si hay líneas, `totalValue` debe cuadrar con la suma (tolerancia 1 COP).
 */
export function assertPatchTotalValueCoherentWithLines(
  incomingTotalValueCOP: Prisma.Decimal | string | number,
  lines: ReadonlyArray<PurchaseLotLineAggregationInput>,
  toleranceCOP: Prisma.Decimal = new Prisma.Decimal('1'),
): void {
  if (!lines.length) return;
  const incoming = new Prisma.Decimal(incomingTotalValueCOP);
  const sum = sumLineTotalsCOP(lines);
  if (!purchaseTotalsWithinTolerance(incoming, sum, toleranceCOP)) {
    throw new PurchaseLotTotalCoherenceError(
      `totalValue (${incoming.toFixed(0)} COP) no coincide con la suma de líneas de comprobante (${sum.toFixed(0)} COP; tolerancia ${toleranceCOP.toFixed(0)} COP).`,
      sum,
      incoming,
    );
  }
}
