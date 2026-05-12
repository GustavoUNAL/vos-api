/**
 * Migra la categoría de inventario «en operación» / «productos en operación» → «Adquirido»,
 * actualiza `inventory` y `purchase_lot_lines`, y elimina las filas de categoría antiguas.
 *
 *   npm run db:migrate-en-operacion-to-adquirido
 *   npm run db:migrate-en-operacion-to-adquirido -- --dry-run
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { CategoryType, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { categoryDisplayName } from '../src/common/category-display-name';

const TARGET_CATEGORY_NAME = 'Adquirido';

function normalizedInventoryCategoryLabel(name: string): string {
  return categoryDisplayName(name)
    .replace(/-/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Categorías INVENTORY equivalentes a «en operación» que deben sustituirse. */
export function isEnOperacionInventoryCategoryName(name: string): boolean {
  const n = normalizedInventoryCategoryLabel(name);
  return (
    n === 'en operacion' ||
    n === 'productos en operacion' ||
    n === 'producto en operacion'
  );
}

function parseArgs() {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const invCategories = await prisma.category.findMany({
      where: { type: CategoryType.INVENTORY },
      select: { id: true, name: true },
    });

    const toReplace = invCategories.filter((c) =>
      isEnOperacionInventoryCategoryName(c.name),
    );

    if (toReplace.length === 0) {
      console.log(
        'No hay categorías INVENTORY «en operación» / «productos en operación». Nada que hacer.',
      );
      return;
    }

    console.log(
      'Categorías a reemplazar:',
      toReplace.map((c) => `${c.id} "${c.name}"`).join(', '),
    );

    let target = await prisma.category.findFirst({
      where: { name: TARGET_CATEGORY_NAME, type: CategoryType.INVENTORY },
      select: { id: true, name: true },
    });

    if (!target && !dryRun) {
      target = await prisma.category.create({
        data: { name: TARGET_CATEGORY_NAME, type: CategoryType.INVENTORY },
        select: { id: true, name: true },
      });
      console.log(`Creada categoría destino: "${target.name}" (${target.id})`);
    } else if (!target && dryRun) {
      console.log(
        `[dry-run] Se crearía categoría INVENTORY "${TARGET_CATEGORY_NAME}" si no existe.`,
      );
    } else if (target) {
      console.log(
        `Categoría destino existente: "${target.name}" (${target.id})`,
      );
    }

    for (const old of toReplace) {
      if (target && old.id === target.id) continue;

      const invCount = await prisma.inventory.count({
        where: { categoryId: old.id },
      });
      const lineCount = await prisma.purchaseLotLine.count({
        where: { categoryId: old.id },
      });
      const productCount = await prisma.product.count({
        where: { categoryId: old.id },
      });
      const expenseCount = await prisma.expense.count({
        where: { categoryId: old.id },
      });

      if (productCount > 0 || expenseCount > 0) {
        throw new Error(
          `La categoría "${old.name}" (${old.id}) está referenciada por productos o gastos; revisar datos antes de migrar.`,
        );
      }

      console.log(
        `  "${old.name}": ${invCount} inventario(s), ${lineCount} línea(s) de lote`,
      );

      if (dryRun) continue;

      const tid = target!.id;

      if (invCount > 0) {
        const r = await prisma.inventory.updateMany({
          where: { categoryId: old.id },
          data: { categoryId: tid },
        });
        console.log(`    → inventory actualizado: ${r.count} fila(s)`);
      }
      if (lineCount > 0) {
        const r = await prisma.purchaseLotLine.updateMany({
          where: { categoryId: old.id },
          data: { categoryId: tid },
        });
        console.log(`    → purchase_lot_lines actualizado: ${r.count} fila(s)`);
      }

      await prisma.category.delete({ where: { id: old.id } });
      console.log(`    → categoría eliminada: "${old.name}"`);
    }

    if (dryRun) {
      console.log('Dry-run: no se escribió en base de datos.');
      return;
    }

    console.log('OK: migración completada.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
