/**
 * Recetas de comida rápida (tostadas, hot dog).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import {
  type InvDef,
  type RecipeDef,
  SEED_COMPANY_ID,
  seedRecipeBatch,
} from './lib/platform-recipe-seed';

const INVENTORY: Record<string, InvDef> = {
  'tostada-integral': {
    name: 'Tostada integral',
    unit: 'und',
    unitCost: 400,
  },
  'pan-suave': { name: 'Pan suave', unit: 'und', unitCost: 800 },
  'salchicha-premium': {
    name: 'Salchicha premium',
    unit: 'und',
    unitCost: 2500,
  },
};

const RECIPES: RecipeDef[] = [
  {
    productName: 'Tostadas',
    ingredients: [{ key: 'tostada-integral', qty: 1, unit: 'und' }],
    costs: [{ name: 'Mantequilla / mermelada', lineTotalCOP: 400 }],
    expectedTotal: 1040,
  },
  {
    productName: 'Hot Dog',
    ingredients: [
      { key: 'pan-suave', qty: 1, unit: 'und' },
      { key: 'salchicha-premium', qty: 1, unit: 'und' },
    ],
    costs: [
      { name: 'Queso', lineTotalCOP: 800 },
      { name: 'Papa triturada', lineTotalCOP: 500 },
      { name: 'Salsas', lineTotalCOP: 300 },
      { name: 'Jalapeños', lineTotalCOP: 300 },
    ],
    expectedTotal: 6760,
  },
];

async function ensureExtraProducts(
  prisma: PrismaClient,
  companyId: string,
): Promise<void> {
  const extras = [
    {
      name: 'Hot Dog',
      description:
        'Pan suave con salchicha premium, queso, papa triturada, salsas y jalapeños.',
      slug: 'comida-rapida',
      price: 11000,
      sku: '2005',
    },
  ] as const;

  for (const p of extras) {
    const category = await prisma.productCategory.findFirst({
      where: { companyId, slug: p.slug, active: true },
    });
    if (!category) continue;

    const existing = await prisma.product.findFirst({
      where: { companyId, sku: p.sku },
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: p.name,
          description: p.description,
          salePrice: p.price,
          categoryId: category.id,
          status: 'ACTIVE',
        },
      });
    } else {
      await prisma.product.create({
        data: {
          companyId,
          categoryId: category.id,
          name: p.name,
          description: p.description,
          salePrice: p.price,
          sku: p.sku,
          status: 'ACTIVE',
        },
      });
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({
      where: { id: SEED_COMPANY_ID },
    });
    if (!company) {
      throw new Error(
        `Empresa ${SEED_COMPANY_ID} no encontrada. Ejecutá db:seed-platform.`,
      );
    }

    await ensureExtraProducts(prisma, company.id);
    await seedRecipeBatch(
      prisma,
      company.id,
      INVENTORY,
      RECIPES,
      'Recetas comida rápida',
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
