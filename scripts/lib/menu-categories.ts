import { CategoryType, PrismaClient } from '@prisma/client';

/**
 * Orden estable para upsert / UI: solo estas 5 secciones existen para productos/recetas.
 * (Antes: Botellas → Bar; Combos → Comida.)
 */
export const MENU_CATEGORY_SLUGS_IN_ORDER = [
  'bar',
  'cafeteria',
  'cocteles',
  'comida',
  'shots',
] as const;

export type MenuCategorySlug = (typeof MENU_CATEGORY_SLUGS_IN_ORDER)[number];

/** Slug CSV → nombre único en `categories` (PRODUCT). */
export const SLUG_TO_CATEGORY_NAME: Record<MenuCategorySlug, string> = {
  bar: 'Bar',
  cafeteria: 'Cafetería',
  cocteles: 'Cócteles',
  comida: 'Comida',
  shots: 'Shots',
};

/** Clave de nombre normalizado → slug destino (categorías viejas absorbidas). */
const DEPOT_NORMALIZED_KEY_TO_SLUG: Record<string, MenuCategorySlug> = {
  botellas: 'bar',
  botella: 'bar',
  licores: 'bar',
  licor: 'bar',
  combos: 'comida',
  combo: 'comida',
};

export const ALLOWED_MENU_SLUGS = new Set<string>(MENU_CATEGORY_SLUGS_IN_ORDER);

export const CANONICAL_PRODUCT_CATEGORY_NAMES = new Set(
  Object.values(SLUG_TO_CATEGORY_NAME),
);

/** Slug de categoría desde texto CSV (snake_case). */
export function slugCategory(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Normaliza columna Categoría del CSV a uno de los 5 slugs de menú. */
export function normalizeMenuCategory(raw: string): string {
  let s = slugCategory(raw);
  const legacy: Record<string, string> = {
    cafe: 'cafeteria',
    cafes: 'cafeteria',
    bebida_caliente: 'cafeteria',
    bebida_fria: 'cafeteria',
    postre: 'cafeteria',
    coctel: 'cocteles',
    coctels: 'cocteles',
    cocktails: 'cocteles',
    cerveza: 'bar',
    licores: 'bar',
    licor: 'bar',
    shot: 'shots',
    shots_: 'shots',
    combo: 'comida',
    combos: 'comida',
    botellas: 'bar',
    botella: 'bar',
    comidas: 'comida',
  };
  if (legacy[s]) s = legacy[s];
  const depot = DEPOT_NORMALIZED_KEY_TO_SLUG[s];
  if (depot) s = depot;
  return s;
}

/** Resuelve categorías PRODUCT antiguas (p. ej. seed "Menú — Bebidas") al slug canónico. */
export function legacyProductCategoryNameToSlug(
  name: string,
): MenuCategorySlug {
  const trimmed = name.trim();
  if (CANONICAL_PRODUCT_CATEGORY_NAMES.has(trimmed)) {
    for (const slug of MENU_CATEGORY_SLUGS_IN_ORDER) {
      if (SLUG_TO_CATEGORY_NAME[slug] === trimmed) return slug;
    }
  }
  const n = trimmed.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (
    (n.includes('menu') || n.includes('men')) &&
    (n.includes('bebida') || n.includes('bebidas'))
  ) {
    return 'cafeteria';
  }
  if (n === 'bebidas' || n === 'bebida') return 'cafeteria';
  if (n.includes('comida')) return 'comida';
  if (n.includes('combo')) return 'comida';
  if (n.includes('coctel') || n.includes('cocktail')) return 'cocteles';
  if (n.includes('shot')) return 'shots';
  if (n.includes('botella') || n.includes('licor')) return 'bar';
  if (n.includes('bar') && !n.includes('coctel')) return 'bar';
  return 'cafeteria';
}

export async function ensureProductCategoryId(
  prisma: PrismaClient,
  cache: Map<string, string>,
  categorySlug: string,
): Promise<string> {
  const slug = normalizeMenuCategory(categorySlug) as MenuCategorySlug;
  if (!ALLOWED_MENU_SLUGS.has(slug)) {
    throw new Error(
      `Categoría de menú no permitida: ${categorySlug} → ${slug}`,
    );
  }
  const hit = cache.get(slug);
  if (hit) return hit;
  const name = SLUG_TO_CATEGORY_NAME[slug];
  const row = await prisma.category.upsert({
    where: { name },
    create: { name, type: CategoryType.PRODUCT },
    update: {},
    select: { id: true },
  });
  cache.set(slug, row.id);
  return row.id;
}

/** Crea o resuelve las 5 categorías PRODUCT del menú. */
export async function ensureAllMenuProductCategoryIds(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  for (const slug of MENU_CATEGORY_SLUGS_IN_ORDER) {
    await ensureProductCategoryId(prisma, cache, slug);
  }
  return cache;
}

function normalizeCategoryKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/** Slug de menú a partir del nombre canónico en español (p. ej. `Cafetería` → `cafeteria`). */
export function menuSlugForCanonicalCategoryName(
  canonicalName: string,
): MenuCategorySlug {
  for (const slug of MENU_CATEGORY_SLUGS_IN_ORDER) {
    if (SLUG_TO_CATEGORY_NAME[slug] === canonicalName) return slug;
  }
  return 'cafeteria';
}

/**
 * Fusiona categorías PRODUCT que son la misma al quitar acentos / mayúsculas
 * (p. ej. `Cafeteria` y `Cafetería`) en la fila canónica de las 5 del menú.
 */
export async function mergeAccentEquivalentProductCategories(
  prisma: PrismaClient,
  cache: Map<string, string>,
): Promise<void> {
  const normToCanonical = new Map<string, string>();
  for (const n of CANONICAL_PRODUCT_CATEGORY_NAMES) {
    normToCanonical.set(normalizeCategoryKey(n), n);
  }

  const cats = await prisma.category.findMany({
    where: { type: CategoryType.PRODUCT },
    select: { id: true, name: true },
  });
  for (const c of cats) {
    const key = normalizeCategoryKey(c.name);
    const canonicalName = normToCanonical.get(key);
    if (!canonicalName || canonicalName === c.name) continue;
    const slug = menuSlugForCanonicalCategoryName(canonicalName);
    const targetId = cache.get(slug);
    if (!targetId || c.id === targetId) continue;

    const moved = await prisma.product.updateMany({
      where: { categoryId: c.id },
      data: { categoryId: targetId, type: slug },
    });
    if (moved.count > 0) {
      console.log(
        `→ ${moved.count} producto(s): categoría homónima "${c.name}" → "${canonicalName}"`,
      );
    }
    const left = await prisma.product.count({ where: { categoryId: c.id } });
    if (left === 0) {
      await prisma.category.delete({ where: { id: c.id } });
      console.log(`   Categoría duplicada eliminada: "${c.name}"`);
    } else {
      console.warn(
        `   "${c.name}" (${c.id}): quedan ${left} producto(s); no se eliminó la categoría.`,
      );
    }
  }
}

/**
 * Une categorías PRODUCT con el mismo nombre normalizado (acentos/caja/espacios)
 * pero distintas filas — p. ej. `COMIDA` y `Comida` (unique en Postgres es case-sensitive).
 * Deja un solo registro; prioriza el nombre canónico de las 5 del menú.
 */
export async function mergeDuplicateProductCategoriesByNormalizedKey(
  prisma: PrismaClient,
  cache: Map<string, string>,
): Promise<void> {
  const cats = await prisma.category.findMany({
    where: { type: CategoryType.PRODUCT },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  const groups = new Map<string, typeof cats>();
  for (const c of cats) {
    const k = normalizeCategoryKey(c.name);
    const arr = groups.get(k) ?? [];
    arr.push(c);
    groups.set(k, arr);
  }

  for (const arr of groups.values()) {
    if (arr.length === 0) continue;
    const key = normalizeCategoryKey(arr[0]!.name);
    const depotSlug = DEPOT_NORMALIZED_KEY_TO_SLUG[key];
    const depotTargetId = depotSlug ? cache.get(depotSlug) : undefined;
    if (depotSlug && depotTargetId && arr.some((c) => c.id !== depotTargetId)) {
      for (const c of arr) {
        if (c.id === depotTargetId) continue;
        const moved = await prisma.product.updateMany({
          where: { categoryId: c.id },
          data: { categoryId: depotTargetId, type: depotSlug },
        });
        if (moved.count > 0) {
          console.log(
            `→ ${moved.count} producto(s): categoría "${c.name}" → ${SLUG_TO_CATEGORY_NAME[depotSlug]} (clave "${key}")`,
          );
        }
        const left = await prisma.product.count({ where: { categoryId: c.id } });
        if (left === 0) {
          await prisma.category.delete({ where: { id: c.id } });
          console.log(`   Categoría eliminada: "${c.name}"`);
        } else {
          console.warn(
            `   "${c.name}" (${c.id}): quedan ${left} producto(s); no se eliminó la categoría.`,
          );
        }
      }
      cache.set(depotSlug, depotTargetId);
      continue;
    }

    if (arr.length < 2) continue;
    const preferredName = [...CANONICAL_PRODUCT_CATEGORY_NAMES].find(
      (n) => normalizeCategoryKey(n) === key,
    );
    let winner =
      (preferredName
        ? arr.find((c) => c.name === preferredName)
        : undefined) ??
      arr.find((c) => CANONICAL_PRODUCT_CATEGORY_NAMES.has(c.name)) ??
      [...arr].sort((a, b) => a.id.localeCompare(b.id))[0]!;
    const targetId = winner.id;
    const slug = legacyProductCategoryNameToSlug(winner.name);

    for (const c of arr) {
      if (c.id === targetId) continue;
      const moved = await prisma.product.updateMany({
        where: { categoryId: c.id },
        data: { categoryId: targetId, type: slug },
      });
      if (moved.count > 0) {
        console.log(
          `→ ${moved.count} producto(s): categoría duplicada "${c.name}" → "${winner.name}" (clave "${key}")`,
        );
      }
      const left = await prisma.product.count({ where: { categoryId: c.id } });
      if (left === 0) {
        await prisma.category.delete({ where: { id: c.id } });
        console.log(`   Categoría duplicada eliminada: "${c.name}"`);
      } else {
        console.warn(
          `   "${c.name}" (${c.id}): quedan ${left} producto(s); no se eliminó la categoría.`,
        );
      }
    }

    if (preferredName && winner.name !== preferredName) {
      try {
        await prisma.category.update({
          where: { id: targetId },
          data: { name: preferredName },
        });
        console.log(
          `   Nombre de categoría unificado: "${winner.name}" → "${preferredName}"`,
        );
        winner = { id: targetId, name: preferredName };
      } catch {
        console.warn(
          `   No se pudo renombrar categoría ${targetId} a "${preferredName}" (¿conflicto unique?).`,
        );
      }
    }
    cache.set(legacyProductCategoryNameToSlug(winner.name), targetId);
  }
}

/**
 * Mueve productos desde categorías PRODUCT no canónicas (p. ej. "Menú — Bebidas")
 * hacia una de las 5 oficiales y actualiza `Product.type` al slug.
 */
export async function migrateLegacyProductCategories(
  prisma: PrismaClient,
): Promise<void> {
  const cache = await ensureAllMenuProductCategoryIds(prisma);
  const rows = await prisma.category.findMany({
    where: { type: CategoryType.PRODUCT },
    select: { id: true, name: true },
  });
  for (const c of rows) {
    if (CANONICAL_PRODUCT_CATEGORY_NAMES.has(c.name)) continue;
    const slug = legacyProductCategoryNameToSlug(c.name);
    const targetId = cache.get(slug);
    if (!targetId) continue;
    const r = await prisma.product.updateMany({
      where: { categoryId: c.id },
      data: { categoryId: targetId, type: slug },
    });
    if (r.count > 0) {
      console.log(
        `→ ${r.count} producto(s): "${c.name}" → ${slug} (${SLUG_TO_CATEGORY_NAME[slug]})`,
      );
    }
    const left = await prisma.product.count({ where: { categoryId: c.id } });
    if (left === 0) {
      await prisma.category.delete({ where: { id: c.id } });
      console.log(`   Categoría eliminada (vacía): "${c.name}"`);
    }
  }
}

export async function deleteOrphanProductCategories(
  prisma: PrismaClient,
  catCache: Map<string, string>,
): Promise<void> {
  const keep = new Set(Object.values(SLUG_TO_CATEGORY_NAME));
  const rows = await prisma.category.findMany({
    where: { type: CategoryType.PRODUCT },
    select: { id: true, name: true },
  });
  const fallbackId = await ensureProductCategoryId(
    prisma,
    catCache,
    'cafeteria',
  );
  for (const c of rows) {
    if (keep.has(c.name)) continue;
    const total = await prisma.product.count({ where: { categoryId: c.id } });
    if (total === 0) {
      await prisma.category.delete({ where: { id: c.id } });
      console.log('Categoría PRODUCT huérfana eliminada:', c.name);
      continue;
    }
    const visible = await prisma.product.count({
      where: { categoryId: c.id, deletedAt: null },
    });
    if (visible > 0) {
      console.warn(
        `Categoría "${c.name}" no eliminada: ${visible} producto(s) visible(s) (revisar migración).`,
      );
      continue;
    }
    await prisma.product.updateMany({
      where: { categoryId: c.id },
      data: { categoryId: fallbackId, type: 'cafeteria' },
    });
    await prisma.category.delete({ where: { id: c.id } });
    console.log('Categoría antigua eliminada (solo soft-deleted):', c.name);
  }
}

/** Actualiza `Product.type` de slugs de menú ya eliminados (botellas → bar, combos → comida). */
export async function rewriteDeprecatedMenuProductTypes(
  prisma: PrismaClient,
): Promise<void> {
  const b = await prisma.product.updateMany({
    where: { type: 'botellas' },
    data: { type: 'bar' },
  });
  if (b.count > 0) {
    console.log(`→ ${b.count} producto(s): type botellas → bar`);
  }
  const c = await prisma.product.updateMany({
    where: { type: 'combos' },
    data: { type: 'comida' },
  });
  if (c.count > 0) {
    console.log(`→ ${c.count} producto(s): type combos → comida`);
  }
}

/** Alineación completa: 5 categorías + migración + limpieza. */
export async function alignMenuProductCategories(
  prisma: PrismaClient,
): Promise<void> {
  const cache = await ensureAllMenuProductCategoryIds(prisma);
  await mergeAccentEquivalentProductCategories(prisma, cache);
  await mergeDuplicateProductCategoriesByNormalizedKey(prisma, cache);
  await migrateLegacyProductCategories(prisma);
  await rewriteDeprecatedMenuProductTypes(prisma);
  await deleteOrphanProductCategories(prisma, cache);
}
