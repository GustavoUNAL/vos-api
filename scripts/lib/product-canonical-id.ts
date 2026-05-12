/**
 * Slug estable para `Product.id` (import CSV) y para detectar duplicados por nombre.
 */
export function canonicalProductId(name: string): string {
  const n = name
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return n
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
