/**
 * Estimación inicial de costo de producción hasta que exista receta detallada.
 * Usa un % del precio de venta según categoría (margen típico del rubro).
 */
export const COST_RATIO_BY_CATEGORY: Record<string, number> = {
  /** Insumos baratos + preparación rápida */
  cafeteria: 0.32,
  /** Pan, proteína, quesos */
  'comida-rapida': 0.38,
  /** Botella / lata con poco preparación */
  cervezas: 0.48,
  /** Mezclas con insumos variados */
  cocteles: 0.28,
  /** Porción pequeña de licor */
  shots: 0.22,
  /** Botella entera o media */
  licores: 0.55,
};

const DEFAULT_COST_RATIO = 0.35;
const MIN_COST_COP = 500;

/** Costo unitario estimado (COP enteros) a partir del precio y categoría. */
export function estimateProductionCostCOP(
  salePrice: number,
  categorySlug: string,
): number {
  if (!Number.isFinite(salePrice) || salePrice <= 0) return MIN_COST_COP;

  const ratio = COST_RATIO_BY_CATEGORY[categorySlug] ?? DEFAULT_COST_RATIO;
  let cost = Math.round(salePrice * ratio);
  cost = Math.max(MIN_COST_COP, cost);

  if (cost >= salePrice) {
    cost = Math.max(MIN_COST_COP, Math.round(salePrice * 0.45));
  }

  return cost;
}
