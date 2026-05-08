import { categoryDisplayName } from './category-display-name';

/** Comportamiento contable / UI: insumo vs activo (compra única, no “agotado”). */
export type InventoryConsumptionBehavior = 'CONSUMABLE' | 'CAPITAL_ASSET';

function normalizedInventoryCategoryLabel(name: string): string {
  return categoryDisplayName(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
}

/**
 * Categorías de inventario tratadas como activos (mobiliario, equipo, etc.):
 * compra registrada una vez; no aplicar reglas de insumo agotado/consumido.
 *
 * Ajustar la lista si agregas más categorías equivalentes en BD.
 */
const CAPITAL_ASSET_CATEGORY_LABELS = new Set([
  'activos',
  'activo',
  'activo fijo',
]);

/**
 * `category.name` puede ser el valor almacenado (`INVENTORY::activos`) o el mostrado.
 */
export function isCapitalAssetCategoryName(
  name: string | null | undefined,
): boolean {
  if (!name?.trim()) return false;
  const n = normalizedInventoryCategoryLabel(name);
  if (CAPITAL_ASSET_CATEGORY_LABELS.has(n)) return true;
  if (n.startsWith('activos')) return true;
  return false;
}

export function inventoryConsumptionBehavior(
  categoryName: string | null | undefined,
): InventoryConsumptionBehavior {
  return isCapitalAssetCategoryName(categoryName)
    ? 'CAPITAL_ASSET'
    : 'CONSUMABLE';
}
