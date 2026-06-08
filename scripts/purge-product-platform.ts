/**
 * Elimina productos de forma permanente (por nombre o sku).
 *
 * Uso:
 *   npm run db:purge-product -- --name "Hot Dog en combo"
 *   npm run db:purge-product -- --sku 2006 --dry-run
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { SEED_COMPANY_ID } from './lib/platform-recipe-seed';

function parseArgs() {
  let companyId = SEED_COMPANY_ID;
  let name: string | null = null;
  let sku: string | null = null;
  let dryRun = false;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--name' && process.argv[i + 1]) name = process.argv[++i];
    else if (arg === '--sku' && process.argv[i + 1]) sku = process.argv[++i];
    else if (arg.startsWith('--company-id=')) {
      companyId = arg.slice('--company-id='.length);
    }
  }

  if (!name && !sku) {
    throw new Error('Indicá --name "..." o --sku ...');
  }
  return { companyId, name, sku, dryRun };
}

async function main() {
  const { companyId, name, sku, dryRun } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const products = await prisma.product.findMany({
      where: {
        companyId,
        ...(name ? { name: { equals: name, mode: 'insensitive' } } : {}),
        ...(sku ? { sku } : {}),
      },
      select: { id: true, name: true, sku: true, status: true },
    });

    if (products.length === 0) {
      console.log('No se encontró ningún producto.');
      return;
    }

    for (const p of products) {
      console.log(
        `${dryRun ? '[dry-run] ' : ''}Eliminar: ${p.name} (${p.sku ?? 'sin sku'}) [${p.status}]`,
      );
      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          await tx.product.delete({ where: { id: p.id } });
        });
      }
    }

    if (!dryRun) {
      console.log(`Eliminados: ${products.length}`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
