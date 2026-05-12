import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import {
  ALLOWED_MENU_SLUGS,
  deleteOrphanProductCategories,
  ensureProductCategoryId,
  normalizeMenuCategory,
} from './lib/menu-categories';
import { canonicalProductId } from './lib/product-canonical-id';

/**
 * Importa productos desde el CSV (Nombre, Descripción, Precio, Tamaño, Categoría).
 * Categorías canónicas: ver `scripts/lib/menu-categories.ts`.
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/import-products-list.ts
 *   npx ts-node --transpile-only scripts/import-products-list.ts --file "/ruta/lista.csv"
 */

function parseArgs() {
  const argv = process.argv.slice(2);
  let file = path.resolve(process.cwd(), 'prisma/data/lista-productos.csv');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) file = path.resolve(argv[++i]);
  }
  return { file };
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < content.length) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((cell) => cell.trim()));
}

function parsePrice(raw: string): number {
  let s = raw.replace(/\$/g, '').replace(/\s/g, '');
  s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Precio inválido: ${raw}`);
  return n;
}

function isHeaderRow(cols: string[]): boolean {
  const a = (cols[0] || '').toLowerCase();
  return a === 'nombre' || a.startsWith('nombre');
}

function isProductRow(cols: string[]): boolean {
  if (cols.length < 5) return false;
  const name = (cols[0] || '').trim();
  const cat = (cols[4] || '').trim();
  if (!name || !cat) return false;
  if (isHeaderRow(cols)) return false;
  return true;
}

function rowsFromCsv(content: string) {
  const grid = parseCsv(content);
  const out: Array<{
    name: string;
    description: string;
    price: number;
    size: string;
    categorySlug: string;
  }> = [];
  for (const cols of grid) {
    if (!isProductRow(cols)) continue;
    const name = cols[0].trim();
    const description = cols[1].trim();
    const price = parsePrice(cols[2]);
    const sizeRaw = cols[3].trim();
    const categorySlug = normalizeMenuCategory(cols[4].trim());
    if (!sizeRaw) throw new Error(`CSV: falta Tamaño para "${name}"`);
    if (!ALLOWED_MENU_SLUGS.has(categorySlug)) {
      throw new Error(
        `CSV: categoría no permitida "${cols[4].trim()}" → "${categorySlug}" (${name})`,
      );
    }
    out.push({
      name,
      description,
      price,
      size: sizeRaw,
      categorySlug,
    });
  }
  return out;
}

async function main() {
  const { file } = parseArgs();
  if (!fs.existsSync(file)) {
    throw new Error(`No existe el archivo: ${file}`);
  }
  const content = fs.readFileSync(file, 'utf8');
  const PRODUCTS = rowsFromCsv(content);

  const byId = new Map<string, (typeof PRODUCTS)[number]>();
  for (const p of PRODUCTS) {
    const id = canonicalProductId(p.name);
    if (!id) throw new Error(`Id vacío para: ${p.name}`);
    if (byId.has(id)) {
      throw new Error(
        `Colisión de id "${id}": "${byId.get(id)!.name}" vs "${p.name}"`,
      );
    }
    byId.set(id, p);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const catCache = new Map<string, string>();

  try {
    const canonicalIds = [...byId.keys()];

    for (const p of PRODUCTS) {
      const id = canonicalProductId(p.name);
      const type = p.categorySlug;
      const categoryId = await ensureProductCategoryId(
        prisma,
        catCache,
        p.categorySlug,
      );

      await prisma.product.upsert({
        where: { id },
        create: {
          id,
          name: p.name,
          description: p.description,
          price: new Prisma.Decimal(p.price),
          type,
          size: p.size,
          imageUrl: null,
          categoryId,
          active: true,
        },
        update: {
          name: p.name,
          description: p.description,
          price: new Prisma.Decimal(p.price),
          type,
          size: p.size,
          categoryId,
          active: true,
          deletedAt: null,
        },
      });
    }

    const visible = await prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    for (const row of visible) {
      const expectedId = canonicalProductId(row.name);
      const p = byId.get(expectedId);
      if (!p) {
        await prisma.product.update({
          where: { id: row.id },
          data: { deletedAt: new Date() },
        });
        continue;
      }
      if (row.id !== expectedId) {
        await prisma.product.update({
          where: { id: row.id },
          data: { deletedAt: new Date() },
        });
        continue;
      }
      const type = p.categorySlug;
      const categoryId = await ensureProductCategoryId(
        prisma,
        catCache,
        p.categorySlug,
      );
      await prisma.product.update({
        where: { id: row.id },
        data: {
          name: p.name,
          description: p.description,
          price: new Prisma.Decimal(p.price),
          type,
          size: p.size,
          categoryId,
          active: true,
          deletedAt: null,
        },
      });
    }

    await prisma.product.updateMany({
      where: { id: { notIn: canonicalIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    const sinTam = await prisma.product.count({
      where: {
        deletedAt: null,
        OR: [{ size: null }, { size: '' }],
      },
    });
    if (sinTam > 0) {
      throw new Error(
        `Quedaron ${sinTam} productos visibles sin tamaño (revisa el CSV o duplicados).`,
      );
    }

    const totalVisible = await prisma.product.count({
      where: { deletedAt: null },
    });

    await deleteOrphanProductCategories(prisma, catCache);

    console.log(`CSV: ${file}`);
    console.log(`Filas CSV: ${PRODUCTS.length}`);
    console.log(`Productos visibles: ${totalVisible}`);
    console.log(`Categorías PRODUCT (menú): ${catCache.size}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
