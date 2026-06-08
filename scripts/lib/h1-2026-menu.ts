import { Prisma, type PrismaClient } from '@prisma/client';

/** Carta comercial Arándano — precios 1.er semestre 2026 (COP). */
export const H1_2026_MENU: readonly {
  name: string;
  categorySlug: string;
  price: number;
  sku: string;
  description?: string;
}[] = [
  // Cafés
  {
    name: 'Café negro artesanal',
    categorySlug: 'cafeteria',
    price: 4000,
    sku: '1001',
  },
  {
    name: 'Café aromatizado',
    categorySlug: 'cafeteria',
    price: 5000,
    sku: '1004',
    description: 'Canela o vainilla.',
  },
  {
    name: 'Café con leche',
    categorySlug: 'cafeteria',
    price: 5000,
    sku: '1002',
    description: 'Café artesanal con leche.',
  },
  {
    name: 'Vaso de leche',
    categorySlug: 'cafeteria',
    price: 5000,
    sku: '1003',
  },
  { name: 'Carajillo', categorySlug: 'cafeteria', price: 8000, sku: '1005' },
  { name: 'Café irlandés', categorySlug: 'cafeteria', price: 10000, sku: '1006' },
  {
    name: 'Café frío artesanal',
    categorySlug: 'cafeteria',
    price: 4000,
    sku: '1017',
  },
  {
    name: 'Café frío con leche',
    categorySlug: 'cafeteria',
    price: 5000,
    sku: '1018',
  },
  { name: 'Affogato', categorySlug: 'cafeteria', price: 10000, sku: '1008' },
  // Pastelería
  {
    name: 'Acompañante del día',
    categorySlug: 'comida-rapida',
    price: 3000,
    sku: '2007',
    description: 'Empanada, buñuelo o galleta del día.',
  },
  {
    name: 'Pastel del día',
    categorySlug: 'comida-rapida',
    price: 7000,
    sku: '2008',
  },
  {
    name: 'Sándwich del día',
    categorySlug: 'comida-rapida',
    price: 10000,
    sku: '2009',
  },
  {
    name: 'Combo café y pastel',
    categorySlug: 'cafeteria',
    price: 12000,
    sku: '1019',
    description: 'Café artesanal caliente + pastel del día.',
  },
  // Cócteles / hervidos
  {
    name: 'Cóctel Arándano',
    categorySlug: 'cocteles',
    price: 15000,
    sku: '4001',
  },
  {
    name: 'Cóctel de Campari',
    categorySlug: 'cocteles',
    price: 15000,
    sku: '4002',
  },
  {
    name: 'Cóctel de soda sin licor',
    categorySlug: 'cocteles',
    price: 15000,
    sku: '4003',
  },
  {
    name: 'Moscow Mule',
    categorySlug: 'cocteles',
    price: 15000,
    sku: '4005',
  },
  { name: 'Margarita', categorySlug: 'cocteles', price: 15000, sku: '4004' },
  {
    name: 'Hervido de fruta de temporada',
    categorySlug: 'cocteles',
    price: 8000,
    sku: '4000',
  },
  {
    name: 'Vino caliente',
    categorySlug: 'cocteles',
    price: 10000,
    sku: '4013',
  },
  // Cervezas
  {
    name: 'Cerveza Águila',
    categorySlug: 'cervezas',
    price: 4500,
    sku: '3002',
    description: '330 ml.',
  },
  {
    name: 'Cerveza Club Colombia',
    categorySlug: 'cervezas',
    price: 4500,
    sku: '3004',
    description: '330 ml.',
  },
  {
    name: 'Cerveza Budweiser',
    categorySlug: 'cervezas',
    price: 5000,
    sku: '3003',
  },
  {
    name: 'Cerveza Coronita',
    categorySlug: 'cervezas',
    price: 5000,
    sku: '3005',
  },
  {
    name: 'Cerveza Heineken',
    categorySlug: 'cervezas',
    price: 5000,
    sku: '3010',
  },
  {
    name: 'Cerveza Poker',
    categorySlug: 'cervezas',
    price: 4500,
    sku: '3001',
    description: '330 ml.',
  },
  {
    name: 'Cerveza Poker 475 ml',
    categorySlug: 'cervezas',
    price: 7000,
    sku: '3009',
  },
  // Shots
  {
    name: 'Shot aguardiente',
    categorySlug: 'shots',
    price: 6000,
    sku: '5002',
  },
  { name: 'Shot ron', categorySlug: 'shots', price: 6000, sku: '5007' },
  { name: 'Shot vodka', categorySlug: 'shots', price: 10000, sku: '5001' },
  { name: 'Shot brandy', categorySlug: 'shots', price: 10000, sku: '5005' },
  { name: 'Shot tequila', categorySlug: 'shots', price: 10000, sku: '5004' },
  // Extras frecuentes en ventas históricas (fuera de carta de 29)
  {
    name: 'Cerveza Michelada',
    categorySlug: 'cervezas',
    price: 12000,
    sku: '3008',
  },
  { name: 'Soda', categorySlug: 'cafeteria', price: 5000, sku: '1012' },
  {
    name: 'Limonada de la casa',
    categorySlug: 'cafeteria',
    price: 7500,
    sku: '1015',
  },
  {
    name: 'Aromática con fruta',
    categorySlug: 'cafeteria',
    price: 4000,
    sku: '1010',
  },
  {
    name: 'Cigarrillo',
    categorySlug: 'comida-rapida',
    price: 1000,
    sku: '2010',
    description: 'Cigarrillo suelto.',
  },
  {
    name: 'Refajo',
    categorySlug: 'cervezas',
    price: 5000,
    sku: '2011',
  },
  {
    name: 'Papas fritas',
    categorySlug: 'comida-rapida',
    price: 7000,
    sku: '2012',
  },
  // Licores (botellas)
  {
    name: 'Vodka Smirnoff Tamarindo',
    categorySlug: 'licores',
    price: 75000,
    sku: '6007',
  },
  {
    name: 'Media Aguardiente Nariño',
    categorySlug: 'licores',
    price: 40000,
    sku: '6002',
  },
  {
    name: 'Aguardiente Amarillo',
    categorySlug: 'licores',
    price: 75000,
    sku: '6003',
  },
  {
    name: 'Botella Aguardiente Nariño',
    categorySlug: 'licores',
    price: 75000,
    sku: '6001',
  },
  {
    name: 'Botella de licor',
    categorySlug: 'licores',
    price: 175000,
    sku: '6012',
    description: 'Botella genérica (histórico).',
  },
] as const;

/** IDs legacy del POS → nombre en catálogo H1 2026. */
export const LEGACY_PRODUCT_ID_MAP: Record<string, string> = {
  'cafe-negro': 'Café negro artesanal',
  acompanante: 'Acompañante del día',
  'pastel-dia': 'Pastel del día',
  'sandwich-dia': 'Sándwich del día',
  'combo-cafe-pastel': 'Combo café y pastel',
  'bebida-1767479537737-5pcmv20sn': 'Hervido de fruta de temporada',
  'bebida-1767478463497-c2aya0ta0': 'Cóctel de Campari',
  'bebida-1767478306369-c8s8nr6nh': 'Moscow Mule',
  'bebida-soda': 'Soda',
  'bebida-limonada': 'Limonada de la casa',
  'prod-aromatica': 'Aromática con fruta',
  'prod-suspiros': 'Acompañante del día',
  'prod-1770687422697-le373wgmo': 'Cerveza Michelada',
  'cerveza-club-colombia-330': 'Cerveza Club Colombia',
  'cerveza-poker-330': 'Cerveza Poker',
  'cerveza-budweiser': 'Cerveza Budweiser',
  'cerveza-heineken': 'Cerveza Heineken',
  'cerveza-aguila-330': 'Cerveza Águila',
  'tequila-olmeca-shot': 'Shot tequila',
  'gin-gordons-shot': 'Shot ginebra',
  'vodka-smirnoff-shot': 'Shot vodka',
  'vodka-smirnoff-media': 'Vodka Smirnoff Tamarindo',
  'vodka-smirnoff-botella': 'Vodka Smirnoff Tamarindo',
  'media-aguardiente-narino': 'Media Aguardiente Nariño',
  'prod-1768501043986-dzy4iyvgk': 'Media Aguardiente Nariño',
  'prod-1768501042805-nuujaxetr': 'Aguardiente Amarillo',
  'botella-generica': 'Botella de licor',
  refajo: 'Refajo',
  papas: 'Papas fritas',
  'cig-marlboro-rojo': 'Cigarrillo',
  'cig-marlboro-morado': 'Cigarrillo',
  'cigarro-suelto': 'Cigarrillo',
  'prod-1768843715583-n44rw1kv2': 'Cigarrillo',
};

export async function ensureH1MenuProducts(
  prisma: PrismaClient,
  companyId: string,
): Promise<Map<string, { id: string; name: string; cost: Prisma.Decimal }>> {
  const categories = await prisma.productCategory.findMany({
    where: { companyId, active: true },
    select: { id: true, slug: true },
  });
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const byName = new Map<string, { id: string; name: string; cost: Prisma.Decimal }>();

  for (const item of H1_2026_MENU) {
    const categoryId = catBySlug.get(item.categorySlug);
    if (!categoryId) continue;

    const existing = await prisma.product.findFirst({
      where: { companyId, sku: item.sku },
      select: { id: true, name: true, cost: true },
    });

    const data = {
      name: item.name,
      description: item.description ?? '',
      categoryId,
      salePrice: new Prisma.Decimal(item.price),
      status: 'ACTIVE' as const,
    };

    const row = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data,
          select: { id: true, name: true, cost: true },
        })
      : await prisma.product.create({
          data: { companyId, sku: item.sku, ...data },
          select: { id: true, name: true, cost: true },
        });

    byName.set(item.name, row);
  }

  // Alias: producto antiguo "Hervido" → mismo id que hervido de temporada
  const hervido = byName.get('Hervido de fruta de temporada');
  if (hervido) {
    const old = await prisma.product.findFirst({
      where: { companyId, name: 'Hervido', status: { not: 'ARCHIVED' } },
    });
    if (old && old.id !== hervido.id) {
      await prisma.product.update({
        where: { id: old.id },
        data: { status: 'ARCHIVED' },
      });
    }
  }

  return byName;
}

/** Fecha/hora del CSV (día local de negocio, hora en reloj de pared). */
export function parseCsvSaleDateTime(fecha: string, hora: string | number): Date {
  const [y, m, d] = fecha.trim().split('-').map((x) => parseInt(x, 10));
  let h =
    typeof hora === 'number' ? hora : parseInt(String(hora ?? '').trim(), 10);
  if (!y || !m || !d) throw new Error(`Fecha inválida: ${fecha}`);
  if (!Number.isFinite(h) || h < 0) h = 12;
  if (h > 23) h = 23;
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0));
}

export function csvDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
