/** Convención de almacenamiento: `{CategoryType}::{slug legible}`. */
const CATEGORY_STORAGE_PREFIX =
  /^(?:PRODUCT|INVENTORY|EXPENSE)::/;

export function categoryDisplayName(name: string): string {
  return name.replace(CATEGORY_STORAGE_PREFIX, '');
}

export function mapCategoryRelation<T extends { name: string }>(c: T): T {
  return { ...c, name: categoryDisplayName(c.name) };
}
