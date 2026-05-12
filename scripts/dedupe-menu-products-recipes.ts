/**
 * Deduplica productos de menú (mismo nombre + tamaño), fusiona recetas y líneas de carrito,
 * y elimina ingredientes de receta duplicados (mismo insumo dos veces).
 *
 * Antes alinea categorías (incl. duplicados por nombre normalizado): `npm run db:align-menu-categories` (o este script lo invoca).
 *
 *   npx ts-node --transpile-only scripts/dedupe-menu-products-recipes.ts
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { alignMenuProductCategories } from './lib/menu-categories';
import { canonicalProductId } from './lib/product-canonical-id';

function normalizeSizeLabel(s: string | null | undefined): string {
  return (s ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function productDedupeKey(row: { name: string; size: string | null }): string {
  return `${canonicalProductId(row.name)}|${normalizeSizeLabel(row.size)}`;
}

async function dedupeDuplicateProducts(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      size: true,
    },
  });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = productDedupeKey(r);
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  let merged = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const wantId = canonicalProductId(arr[0]!.name.trim());
    let winner = arr.find((p) => p.id === wantId);
    if (!winner) {
      const scored = await Promise.all(
        arr.map(async (p) => {
          const rec = await prisma.recipe.findUnique({
            where: { productId: p.id },
            select: { id: true },
          });
          return { p, hasRecipe: !!rec };
        }),
      );
      const withRec = scored.filter((s) => s.hasRecipe);
      winner =
        withRec.length === 1
          ? withRec[0]!.p
          : [...arr].sort((a, b) => a.id.localeCompare(b.id))[0]!;
    }

    for (const l of arr) {
      if (l.id === winner.id) continue;
      await prisma.saleLine.updateMany({
        where: { productId: l.id },
        data: { productId: winner.id },
      });

      const cartItems = await prisma.cartItem.findMany({
        where: { productId: l.id },
        select: { id: true, cartId: true, quantity: true },
      });
      for (const ci of cartItems) {
        const twin = await prisma.cartItem.findFirst({
          where: { cartId: ci.cartId, productId: winner.id },
          select: { id: true, quantity: true },
        });
        if (twin) {
          await prisma.cartItem.update({
            where: { id: twin.id },
            data: {
              quantity: new Prisma.Decimal(twin.quantity).add(ci.quantity),
            },
          });
          await prisma.cartItem.delete({ where: { id: ci.id } });
        } else {
          await prisma.cartItem.update({
            where: { id: ci.id },
            data: { productId: winner.id },
          });
        }
      }

      const loseRec = await prisma.recipe.findUnique({
        where: { productId: l.id },
        select: { id: true },
      });
      if (loseRec) {
        const winRec = await prisma.recipe.findUnique({
          where: { productId: winner.id },
          select: { id: true },
        });
        if (!winRec) {
          await prisma.recipe.update({
            where: { productId: l.id },
            data: { productId: winner.id },
          });
        } else {
          await prisma.recipe.delete({ where: { productId: l.id } });
        }
      }

      await prisma.product.update({
        where: { id: l.id },
        data: { deletedAt: new Date() },
      });
      console.log(
        `Producto duplicado archivado: "${l.name}" (${l.id}) → ganador ${winner.id}`,
      );
      merged++;
    }
  }
  return merged;
}

async function dedupeRecipeIngredients(prisma: PrismaClient): Promise<number> {
  const all = await prisma.recipeIngredient.findMany({
    select: {
      id: true,
      recipeId: true,
      inventoryItemId: true,
      sortOrder: true,
    },
    orderBy: [{ recipeId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });
  const groups = new Map<string, typeof all>();
  for (const ri of all) {
    const k = `${ri.recipeId}|${ri.inventoryItemId}`;
    const arr = groups.get(k) ?? [];
    arr.push(ri);
    groups.set(k, arr);
  }
  let removed = 0;
  for (const [key, arr] of groups) {
    if (arr.length < 2) continue;
    const [, ...dups] = arr;
    for (const ri of dups) {
      await prisma.recipeIngredient.delete({ where: { id: ri.id } });
      removed++;
    }
    console.log(
      `Ingredientes duplicados receta ${key.split('|')[0]}: eliminados ${dups.length}`,
    );
  }
  return removed;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    console.log('1) Alinear categorías de menú (incl. homónimas por acentos)…');
    await alignMenuProductCategories(prisma);

    console.log('2) Deduplicar productos (nombre + tamaño)…');
    const nProd = await dedupeDuplicateProducts(prisma);
    console.log(`   Productos archivados: ${nProd}`);

    console.log('3) Deduplicar líneas de ingredientes en recetas…');
    const nIng = await dedupeRecipeIngredients(prisma);
    console.log(`   Líneas de ingrediente eliminadas: ${nIng}`);

    console.log('OK.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
