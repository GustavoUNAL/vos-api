/**
 * Recetas de cafetería (costos históricos del recetario).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import {
  type CostLine,
  type InvDef,
  type IngLine,
  type RecipeDef,
  SEED_COMPANY_ID,
  seedRecipeBatch,
} from './lib/platform-recipe-seed';

const INVENTORY: Record<string, InvDef> = {
  'cafe-molido': { name: 'Café molido', unit: 'g', unitCost: 81.5 },
  leche: { name: 'Leche entera', unit: 'ml', unitCost: 500 / 60 },
  'aguardiente-narino': { name: 'Aguardiente Nariño', unit: 'ml', unitCost: 75 },
  'whisky-coctel': { name: 'Whisky para cóctel', unit: 'ml', unitCost: 80 },
  soda: { name: 'Soda Bretaña', unit: 'ml', unitCost: 5 },
  sirope: { name: 'Sirope', unit: 'ml', unitCost: 50 },
  azucar: { name: 'Azúcar', unit: 'g', unitCost: 8 },
};

const AGUA_180: CostLine = { name: 'Agua (indirecto)', lineTotalCOP: 700 };
const AGUA_120: CostLine = { name: 'Agua (indirecto)', lineTotalCOP: 700 };
const AGUA_90: CostLine = { name: 'Agua (indirecto)', lineTotalCOP: 700 };
const AGUA_200: CostLine = { name: 'Agua (indirecto)', lineTotalCOP: 700 };
const AGUA_1000: CostLine = { name: 'Agua (indirecto)', lineTotalCOP: 700 };
const ENERGIA_200: CostLine = { name: 'Energía (indirecto)', lineTotalCOP: 200 };
const ENERGIA_300: CostLine = { name: 'Energía (indirecto)', lineTotalCOP: 300 };
const ENERGIA_500: CostLine = { name: 'Energía (indirecto)', lineTotalCOP: 500 };
const ENERGIA_100: CostLine = { name: 'Energía (indirecto)', lineTotalCOP: 100 };
const CAFE_15G: IngLine = { key: 'cafe-molido', qty: 15, unit: 'g' };

const RECIPES: RecipeDef[] = [
  {
    productName: 'Café negro artesanal',
    ingredients: [CAFE_15G],
    costs: [AGUA_180, ENERGIA_200],
    expectedTotal: 2759,
  },
  {
    productName: 'Café aromatizado',
    ingredients: [CAFE_15G],
    costs: [
      { name: 'Aromatizante', lineTotalCOP: 100 },
      AGUA_180,
      ENERGIA_200,
    ],
    expectedTotal: 2889,
  },
  {
    productName: 'Carajillo',
    ingredients: [
      CAFE_15G,
      { key: 'aguardiente-narino', qty: 30, unit: 'ml' },
    ],
    costs: [AGUA_120, ENERGIA_200],
    expectedTotal: 5684,
  },
  {
    productName: 'Café con leche',
    ingredients: [CAFE_15G, { key: 'leche', qty: 60, unit: 'ml' }],
    costs: [AGUA_120, ENERGIA_200],
    expectedTotal: 3409,
  },
  {
    productName: 'Café irlandés',
    ingredients: [
      CAFE_15G,
      { key: 'whisky-coctel', qty: 60, unit: 'ml' },
      { key: 'leche', qty: 60, unit: 'ml' },
    ],
    costs: [AGUA_90, ENERGIA_200],
    expectedTotal: 9649,
  },
  {
    productName: 'Vaso de leche',
    ingredients: [{ key: 'leche', qty: 240, unit: 'ml' }],
    costs: [],
    expectedTotal: 2600,
  },
  {
    productName: 'Café frappé',
    ingredients: [{ key: 'leche', qty: 60, unit: 'ml' }],
    costs: [
      { name: 'Café preparado', lineTotalCOP: 1200 },
      { name: 'Hielo', lineTotalCOP: 200 },
      { name: 'Azúcar', lineTotalCOP: 100 },
      { name: 'Chispas de chocolate', lineTotalCOP: 500 },
      { name: 'Arequipe', lineTotalCOP: 600 },
      { name: 'Chantilly (lata)', lineTotalCOP: 1500 },
      ENERGIA_300,
    ],
    expectedTotal: 6370,
  },
  {
    productName: 'Affogato',
    ingredients: [],
    costs: [
      { name: 'Espresso', lineTotalCOP: 1200 },
      { name: 'Helado', lineTotalCOP: 3000 },
    ],
    expectedTotal: 5460,
  },
  {
    productName: 'Leche achocolatada',
    ingredients: [{ key: 'leche', qty: 180, unit: 'ml' }],
    costs: [{ name: 'Chocolate', lineTotalCOP: 800 }, ENERGIA_200],
    expectedTotal: 3250,
  },
  {
    productName: 'Aromática con fruta',
    ingredients: [],
    costs: [
      { name: 'Aromática', lineTotalCOP: 500 },
      { name: 'Fruta', lineTotalCOP: 1000 },
      AGUA_200,
      ENERGIA_200,
    ],
    expectedTotal: 3120,
  },
  {
    productName: 'Jarra de aromática con fruta',
    ingredients: [],
    costs: [
      { name: 'Aromática', lineTotalCOP: 1000 },
      { name: 'Fruta', lineTotalCOP: 3000 },
      AGUA_1000,
      ENERGIA_500,
    ],
    expectedTotal: 6760,
  },
  {
    productName: 'Soda italiana',
    ingredients: [
      { key: 'soda', qty: 300, unit: 'ml' },
      { key: 'sirope', qty: 30, unit: 'ml' },
    ],
    costs: [
      { name: 'Limón', lineTotalCOP: 300 },
      { name: 'Hielo', lineTotalCOP: 200 },
      { name: 'Sal / picante', lineTotalCOP: 100 },
      ENERGIA_100,
    ],
    expectedTotal: 4810,
  },
];

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

    await seedRecipeBatch(
      prisma,
      company.id,
      INVENTORY,
      RECIPES,
      'Recetas de cafetería',
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
