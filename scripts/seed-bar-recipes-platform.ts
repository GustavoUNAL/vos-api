/**
 * Recetas: michelada, cócteles y shots (recetario bar).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import {
  type CostLine,
  type InvDef,
  type RecipeDef,
  SEED_COMPANY_ID,
  seedRecipeBatch,
} from './lib/platform-recipe-seed';

const INVENTORY: Record<string, InvDef> = {
  'ginebra-coctel': { name: 'Ginebra (cóctel)', unit: 'oz', unitCost: 3000 },
  'tequila-coctel': { name: 'Tequila (cóctel)', unit: 'oz', unitCost: 3000 },
  'ron-coctel': { name: 'Ron (cóctel)', unit: 'oz', unitCost: 2200 },
  'vodka-coctel': { name: 'Vodka (cóctel)', unit: 'oz', unitCost: 2200 },
  'licor-artesanal': {
    name: 'Licor artesanal (cóctel)',
    unit: 'ml',
    unitCost: 17,
  },
  'whisky-old-parr': { name: 'Whisky Old Parr (porción)', unit: 'oz', unitCost: 6800 },
  'vodka-smirnoff': { name: 'Vodka Smirnoff Tamarindo', unit: 'oz', unitCost: 2600 },
  'tequila-olmeca': { name: 'Tequila Olmeca', unit: 'oz', unitCost: 4400 },
  'aguardiente-shot': {
    name: 'Aguardiente Nariño / Amarillo (shot)',
    unit: 'oz',
    unitCost: 2600,
  },
  'ginebra-gordons': { name: "Ginebra Gordon's (shot)", unit: 'oz', unitCost: 3800 },
};

const AGUA_1000: CostLine = { name: 'Agua (indirecto)', lineTotalCOP: 700 };
const ENERGIA_500: CostLine = { name: 'Energía (indirecto)', lineTotalCOP: 500 };
const ENERGIA_300: CostLine = { name: 'Energía (indirecto)', lineTotalCOP: 300 };
const HIELO_200: CostLine = { name: 'Hielo', lineTotalCOP: 200 };
const LIMON_300: CostLine = { name: 'Limón', lineTotalCOP: 300 };
const LIMON_400: CostLine = { name: 'Limón', lineTotalCOP: 400 };
const LIMON_SAL_300: CostLine = { name: 'Limón / sal', lineTotalCOP: 300 };

const GIN_2OZ = { key: 'ginebra-coctel', qty: 2, unit: 'oz' };
const TEQ_2OZ = { key: 'tequila-coctel', qty: 2, unit: 'oz' };
const RON_2OZ = { key: 'ron-coctel', qty: 2, unit: 'oz' };
const VODKA_2OZ = { key: 'vodka-coctel', qty: 2, unit: 'oz' };
const WHISKY_2OZ = { key: 'whisky-old-parr', qty: 2, unit: 'oz' };

const RECIPES: RecipeDef[] = [
  {
    productName: 'Cerveza Michelada',
    ingredients: [],
    costs: [
      { name: 'Cerveza 330 ml', lineTotalCOP: 3500 },
      { name: 'Limón 30 ml', lineTotalCOP: 400 },
      { name: 'Sal / picante', lineTotalCOP: 100 },
    ],
    expectedTotal: 5200,
  },
  {
    productName: 'Jarra de hervidos',
    ingredients: [{ key: 'licor-artesanal', qty: 213, unit: 'ml' }],
    costs: [
      { name: 'Fruta cítrica', lineTotalCOP: 5000 },
      { name: 'Azúcar', lineTotalCOP: 800 },
      AGUA_1000,
      ENERGIA_500,
    ],
    expectedTotal: 13807,
  },
  {
    productName: 'Cóctel Arándano',
    ingredients: [GIN_2OZ],
    costs: [
      { name: 'Sirope arándano', lineTotalCOP: 1500 },
      HIELO_200,
      ENERGIA_300,
    ],
    expectedTotal: 10400,
  },
  {
    productName: 'Margarita',
    ingredients: [TEQ_2OZ],
    costs: [
      LIMON_400,
      { name: 'Sirope', lineTotalCOP: 600 },
      { name: 'Sal', lineTotalCOP: 100 },
      HIELO_200,
      ENERGIA_300,
    ],
    expectedTotal: 9880,
  },
  {
    productName: 'Piña Colada',
    ingredients: [RON_2OZ],
    costs: [
      { name: 'Crema de coco', lineTotalCOP: 2000 },
      { name: 'Piña', lineTotalCOP: 1500 },
      HIELO_200,
      ENERGIA_300,
    ],
    expectedTotal: 10920,
  },
  {
    productName: 'Negroni',
    ingredients: [GIN_2OZ],
    costs: [
      { name: 'Campari', lineTotalCOP: 3000 },
      { name: 'Naranja', lineTotalCOP: 300 },
      HIELO_200,
    ],
    expectedTotal: 12350,
  },
  {
    productName: 'Moscow Mule',
    ingredients: [VODKA_2OZ],
    costs: [
      { name: 'Ginger beer', lineTotalCOP: 2000 },
      LIMON_300,
      HIELO_200,
    ],
    expectedTotal: 8970,
  },
  {
    productName: 'Gin & Tonic',
    ingredients: [GIN_2OZ],
    costs: [
      { name: 'Tónica', lineTotalCOP: 1500 },
      LIMON_300,
      HIELO_200,
    ],
    expectedTotal: 10400,
  },
  {
    productName: 'Whisky en las rocas',
    ingredients: [WHISKY_2OZ],
    costs: [HIELO_200],
    expectedTotal: 17940,
  },
  {
    productName: 'Shot vodka',
    ingredients: [{ key: 'vodka-smirnoff', qty: 1, unit: 'oz' }],
    costs: [LIMON_SAL_300],
    expectedTotal: 3770,
  },
  {
    productName: 'Shot tequila',
    ingredients: [{ key: 'tequila-olmeca', qty: 1, unit: 'oz' }],
    costs: [LIMON_SAL_300],
    expectedTotal: 6110,
  },
  {
    productName: 'Shot aguardiente',
    ingredients: [{ key: 'aguardiente-shot', qty: 1, unit: 'oz' }],
    costs: [LIMON_SAL_300],
    expectedTotal: 3770,
  },
  {
    productName: 'Shot ginebra',
    ingredients: [{ key: 'ginebra-gordons', qty: 1, unit: 'oz' }],
    costs: [{ name: 'Limón / aceituna', lineTotalCOP: 300 }],
    expectedTotal: 5330,
  },
  {
    productName: 'Shot whisky',
    ingredients: [{ key: 'whisky-old-parr', qty: 1, unit: 'oz' }],
    costs: [LIMON_300],
    expectedTotal: 9230,
  },
];

async function ensureExtraProducts(
  prisma: PrismaClient,
  companyId: string,
): Promise<void> {
  const extras = [
    {
      name: 'Cerveza Michelada',
      description: 'Cerveza 330 ml con limón, sal o picante.',
      slug: 'cervezas',
      price: 12000,
      sku: '3008',
    },
    {
      name: 'Jarra de hervidos',
      description: 'Jarra 1 L de hervidos con fruta cítrica y licor artesanal.',
      slug: 'cocteles',
      price: 35000,
      sku: '4012',
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
      'Recetas bar (cervezas, cócteles, shots)',
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
