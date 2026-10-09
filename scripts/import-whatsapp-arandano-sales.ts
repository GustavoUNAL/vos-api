/**
 * Carga las ventas que Jessica dejó en el chat de WhatsApp
 * «Operación arándano 2.0» (22 sep – 8 oct 2026), cuando la app no registraba.
 * Idempotente por `code` (WA-…). No mueve inventario.
 *
 * También quita los duplicados V0357–V0360 (la misma venta de 3 Club Colombia).
 */
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, SaleSource } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

config({ path: '.env' });
config({ path: '.env.local', override: true });

const COMPANY_ID = 'seed-arandano-cafe-bar';

type LineIn = {
  /** Nombre en catálogo. Si no está, la línea queda sin producto. */
  catalog?: string;
  name: string;
  qty: number;
  unitPrice: number;
};

type SaleIn = {
  code: string;
  at: string;
  payment: string;
  notes: string;
  lines: LineIn[];
};

const SALES: SaleIn[] = [
  {
    code: 'WA-20260917-1824',
    at: '2026-09-17T18:24:00-05:00',
    payment: 'Nequi',
    notes:
      'WhatsApp · Nequi de NICOLAS RIOBAMBA $20.000. El chat no detalla productos.',
    lines: [{ name: 'Consumo Nequi', qty: 1, unitPrice: 20000 }],
  },
  {
    code: 'WA-20260922-2323',
    at: '2026-09-22T23:23:00-05:00',
    payment: 'Transferencia',
    notes:
      'WhatsApp · 1 Heineken, 2 Club Colombia, 2 vasos michelados, sándwich club y 4 hervidos. Comprobante $72.000.',
    lines: [
      { name: 'Cerveza Heineken', qty: 1, unitPrice: 8000 },
      { catalog: 'Cerveza Club Colombia', name: 'Cerveza Club Colombia', qty: 2, unitPrice: 6000 },
      { catalog: 'Vaso michelado', name: 'Vaso michelado', qty: 2, unitPrice: 3000 },
      { name: 'Sándwich club Arándano', qty: 1, unitPrice: 18000 },
      { catalog: 'Hervido', name: 'Hervido', qty: 4, unitPrice: 7000 },
    ],
  },
  {
    code: 'WA-20260923-0014',
    at: '2026-09-23T00:14:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · Gustavo vendió 4 perros; Sonia confirmó que eran pequeños. $28.000.',
    lines: [{ catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 4, unitPrice: 7000 }],
  },
  {
    code: 'WA-20260923-1901',
    at: '2026-09-23T19:01:00-05:00',
    payment: 'Transferencia',
    notes: 'WhatsApp · 2 perros pequeños. La foto del comprobante no vino en el export.',
    lines: [{ catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 2, unitPrice: 7000 }],
  },
  {
    code: 'WA-20260923-1902',
    at: '2026-09-23T19:02:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · 1 perro grande en efectivo.',
    lines: [{ catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 1, unitPrice: 14000 }],
  },
  {
    code: 'WA-20260923-1948',
    at: '2026-09-23T19:48:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · 2 perros grandes en efectivo $28.000.',
    lines: [{ catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 2, unitPrice: 14000 }],
  },
  {
    code: 'WA-20260924-1824',
    at: '2026-09-24T18:24:00-05:00',
    payment: 'Transferencia',
    notes: 'WhatsApp · 1 perro grande y 1 pequeño por transferencia $21.000.',
    lines: [
      { catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 1, unitPrice: 14000 },
      { catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 1, unitPrice: 7000 },
    ],
  },
  {
    code: 'WA-20260924-1937',
    at: '2026-09-24T19:37:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · 1 perro pequeño en efectivo $7.000.',
    lines: [{ catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 1, unitPrice: 7000 }],
  },
  {
    code: 'WA-20260925-2237',
    at: '2026-09-25T22:37:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 6 hervidos y 2 perros grandes. Davivienda 91030489 · $70.000.',
    lines: [
      { catalog: 'Hervido', name: 'Hervido', qty: 6, unitPrice: 7000 },
      { catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 2, unitPrice: 14000 },
    ],
  },
  {
    code: 'WA-20260925-2335',
    at: '2026-09-25T23:35:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · 1 perro pequeño en efectivo.',
    lines: [{ catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 1, unitPrice: 7000 }],
  },
  {
    code: 'WA-20260925-2347',
    at: '2026-09-25T23:47:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 2 perros pequeños. Nequi M28055378 · $14.000.',
    lines: [{ catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 2, unitPrice: 7000 }],
  },
  {
    code: 'WA-20260926-0232',
    at: '2026-09-26T02:32:00-05:00',
    payment: 'Nequi',
    notes:
      'WhatsApp · 12 Poker, 2 Club Colombia y 4 shots de ron. Davivienda 7643062 · $102.000. El shot quedó en $7.500 para cuadrar el comprobante.',
    lines: [
      { catalog: 'Cerveza Poker', name: 'Cerveza Poker', qty: 12, unitPrice: 5000 },
      { catalog: 'Cerveza Club Colombia', name: 'Cerveza Club Colombia', qty: 2, unitPrice: 6000 },
      { catalog: 'Shot ron', name: 'Shot ron', qty: 4, unitPrice: 7500 },
    ],
  },
  {
    code: 'WA-20260926-1639',
    at: '2026-09-26T16:39:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · Jugo de lulo. Nequi M17646893 · $6.000.',
    lines: [{ catalog: 'Jugo natural', name: 'Jugo de lulo', qty: 1, unitPrice: 6000 }],
  },
  {
    code: 'WA-20260926-1724',
    at: '2026-09-26T17:24:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 5 Heineken en botella. Nequi M19116305 · $40.000.',
    lines: [{ name: 'Cerveza Heineken', qty: 5, unitPrice: 8000 }],
  },
  {
    code: 'WA-20260926-2311',
    at: '2026-09-26T23:11:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · Sándwich club, 2 perros pequeños y soda italiana. Efectivo $42.000.',
    lines: [
      { name: 'Sándwich club Arándano', qty: 1, unitPrice: 20000 },
      { catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 2, unitPrice: 7000 },
      { catalog: 'Soda italiana', name: 'Soda italiana', qty: 1, unitPrice: 8000 },
    ],
  },
  {
    code: 'WA-20260929-2145',
    at: '2026-09-29T21:45:00-05:00',
    payment: 'Nequi',
    notes:
      'WhatsApp · 3 perros grandes, Coca Cola y 2 Poker. Cuadra con el Nequi del día ($57.000).',
    lines: [
      { catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 3, unitPrice: 14000 },
      { catalog: 'Coca Cola', name: 'Coca Cola', qty: 1, unitPrice: 5000 },
      { catalog: 'Cerveza Poker', name: 'Cerveza Poker', qty: 2, unitPrice: 5000 },
    ],
  },
  {
    code: 'WA-20260930-1054',
    at: '2026-09-30T10:54:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · Agua Brisa. Nequi M07136564 · $5.000.',
    lines: [{ name: 'Agua Brisa', qty: 1, unitPrice: 5000 }],
  },
  {
    code: 'WA-20260930-2011',
    at: '2026-09-30T20:11:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · Jarra de cerveza, perro pequeño y tostadas. Total $35.000.',
    lines: [
      { catalog: 'Jarra de cerveza', name: 'Jarra de cerveza', qty: 1, unitPrice: 25000 },
      { catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 1, unitPrice: 7000 },
      { catalog: 'Tostadas', name: 'Tostadas', qty: 1, unitPrice: 3000 },
    ],
  },
  {
    code: 'WA-20260930-2249',
    at: '2026-09-30T22:49:00-05:00',
    payment: 'Efectivo',
    notes:
      'WhatsApp · 2 hervidos y 1 perro pequeño en efectivo. El mensaje dice $22.000 (la carta suma $21.000); el peso de más quedó en el perro.',
    lines: [
      { catalog: 'Hervido', name: 'Hervido', qty: 2, unitPrice: 7000 },
      { catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 1, unitPrice: 8000 },
    ],
  },
  {
    code: 'WA-20261001-2134',
    at: '2026-10-01T21:34:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · 1 Poker en efectivo $5.000.',
    lines: [{ catalog: 'Cerveza Poker', name: 'Cerveza Poker', qty: 1, unitPrice: 5000 }],
  },
  {
    code: 'WA-20261001-2211',
    at: '2026-10-01T22:11:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · 6 hervidos en efectivo $42.000.',
    lines: [{ catalog: 'Hervido', name: 'Hervido', qty: 6, unitPrice: 7000 }],
  },
  {
    code: 'WA-20261001-2324',
    at: '2026-10-01T23:24:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · 2 margaritas y 1 mojito en efectivo $64.000.',
    lines: [
      { catalog: 'Margarita', name: 'Margarita', qty: 2, unitPrice: 22000 },
      { catalog: 'Mojito', name: 'Mojito', qty: 1, unitPrice: 20000 },
    ],
  },
  {
    code: 'WA-20261002-2032',
    at: '2026-10-02T20:32:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 2 margaritas frozen. Nequi M29097119 · $22.000.',
    lines: [{ catalog: 'Margarita', name: 'Margarita frozen', qty: 2, unitPrice: 11000 }],
  },
  {
    code: 'WA-20261002-2100',
    at: '2026-10-02T21:00:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · Margarita, perro grande y Club Colombia. Nequi M29961518 · $42.000.',
    lines: [
      { catalog: 'Margarita', name: 'Margarita', qty: 1, unitPrice: 22000 },
      { catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 1, unitPrice: 14000 },
      { catalog: 'Cerveza Club Colombia', name: 'Cerveza Club Colombia', qty: 1, unitPrice: 6000 },
    ],
  },
  {
    code: 'WA-20261002-2117',
    at: '2026-10-02T21:17:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · Agua pequeña en efectivo $3.500.',
    lines: [{ name: 'Agua pequeña', qty: 1, unitPrice: 3500 }],
  },
  {
    code: 'WA-20261003-2307',
    at: '2026-10-03T23:07:00-05:00',
    payment: 'Nequi',
    notes:
      'WhatsApp · 2 perros pequeños y 2 Poker. La foto no vino en el export; precios de carta. El cierre del día dice $146.000 y esta venta no lo cubre sola.',
    lines: [
      { catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 2, unitPrice: 7000 },
      { catalog: 'Cerveza Poker', name: 'Cerveza Poker', qty: 2, unitPrice: 5000 },
    ],
  },
  {
    code: 'WA-20261003-2314',
    at: '2026-10-03T23:14:00-05:00',
    payment: 'Nequi',
    notes:
      'WhatsApp · 2 Moscow Mule y 2 hervidos. La foto no vino en el export; precios de carta.',
    lines: [
      { catalog: 'Moscow Mule', name: 'Moscow Mule', qty: 2, unitPrice: 15000 },
      { catalog: 'Hervido', name: 'Hervido', qty: 2, unitPrice: 7000 },
    ],
  },
  {
    code: 'WA-20261005-2139',
    at: '2026-10-05T21:39:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 1 perro grande. Cuadra con el Nequi del día ($14.000).',
    lines: [{ catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 1, unitPrice: 14000 }],
  },
  {
    code: 'WA-20261005-2208',
    at: '2026-10-05T22:08:00-05:00',
    payment: 'Efectivo',
    notes:
      'WhatsApp · Perro pequeño, margarita y Heineken. El mensaje dice $39.000; la Heineken quedó en $10.000 para cuadrar.',
    lines: [
      { catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 1, unitPrice: 7000 },
      { catalog: 'Margarita', name: 'Margarita', qty: 1, unitPrice: 22000 },
      { name: 'Cerveza Heineken', qty: 1, unitPrice: 10000 },
    ],
  },
  {
    code: 'WA-20261006-1859',
    at: '2026-10-06T18:59:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 2 perros grandes y 2 cafés artesanales. Comprobante $37.000.',
    lines: [
      { catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 2, unitPrice: 14000 },
      { catalog: 'Café negro artesanal', name: 'Café negro artesanal', qty: 2, unitPrice: 4500 },
    ],
  },
  {
    code: 'WA-20261006-1902',
    at: '2026-10-06T19:02:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · Sándwich club Arándano. Dale 78117596 · $20.000.',
    lines: [{ name: 'Sándwich club Arándano', qty: 1, unitPrice: 20000 }],
  },
  {
    code: 'WA-20261006-2353',
    at: '2026-10-06T23:53:00-05:00',
    payment: 'Efectivo',
    notes: 'WhatsApp · Hervido, perro pequeño y 2 Poker, sumados al cierre.',
    lines: [
      { catalog: 'Hervido', name: 'Hervido', qty: 1, unitPrice: 7000 },
      { catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 1, unitPrice: 7000 },
      { catalog: 'Cerveza Poker', name: 'Cerveza Poker', qty: 2, unitPrice: 5000 },
    ],
  },
  {
    code: 'WA-20261007-1717',
    at: '2026-10-07T17:17:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 1 perro grande. Nequi M17340963 · $14.000.',
    lines: [{ catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 1, unitPrice: 14000 }],
  },
  {
    code: 'WA-20261007-1856',
    at: '2026-10-07T18:56:00-05:00',
    payment: 'Bre-B',
    notes:
      'WhatsApp · 3 perros grandes, 2 aromáticas y 1 hervido. Bre-B TRnVGtVU9pEC · $61.000.',
    lines: [
      { catalog: 'Hot dog grande', name: 'Hot dog grande', qty: 3, unitPrice: 14000 },
      { catalog: 'Aromática con fruta', name: 'Aromática con fruta', qty: 2, unitPrice: 6000 },
      { catalog: 'Hervido', name: 'Hervido', qty: 1, unitPrice: 7000 },
    ],
  },
  {
    code: 'WA-20261007-2315',
    at: '2026-10-07T23:15:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 1 margarita. Dale 78317897 · $22.000.',
    lines: [{ catalog: 'Margarita', name: 'Margarita', qty: 1, unitPrice: 22000 }],
  },
  {
    code: 'WA-20261008-0009',
    at: '2026-10-08T00:09:00-05:00',
    payment: 'Efectivo',
    notes:
      'WhatsApp · 18 hervidos, 2 perros pequeños y mitad de sándwich Arándano. Efectivo $160.000.',
    lines: [
      { catalog: 'Hervido', name: 'Hervido', qty: 18, unitPrice: 7000 },
      { catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 2, unitPrice: 7000 },
      { name: 'Mitad sándwich club Arándano', qty: 1, unitPrice: 20000 },
    ],
  },
  {
    code: 'WA-20261008-1848',
    at: '2026-10-08T18:48:00-05:00',
    payment: 'Nequi',
    notes: 'WhatsApp · 2 perros pequeños. Nequi M20423228 · $14.000.',
    lines: [{ catalog: 'Hot dog pequeño', name: 'Hot dog pequeño', qty: 2, unitPrice: 7000 }],
  },
];

function lineTotal(lines: LineIn[]): number {
  return lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
}

async function removeDuplicateClubSales(prisma: PrismaClient): Promise<string[]> {
  const dupes = await prisma.sale.findMany({
    where: {
      companyId: COMPANY_ID,
      code: { in: ['V0357', 'V0358', 'V0359', 'V0360'] },
    },
    include: { lines: true, shopOrders: { select: { id: true } } },
  });
  const removed: string[] = [];
  for (const sale of dupes) {
    const onlyClub =
      sale.lines.length === 1 &&
      sale.lines[0]?.productName === 'Cerveza Club Colombia' &&
      Number(sale.lines[0].quantity) === 3 &&
      Number(sale.total) === 18000 &&
      sale.shopOrders.length === 0;
    if (!onlyClub) {
      console.warn(`No se borró ${sale.code}: no coincide con el duplicado de 3 Club.`);
      continue;
    }
    await prisma.sale.delete({ where: { id: sale.id } });
    removed.push(sale.code ?? sale.id);
  }
  return removed;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  for (const sale of SALES) {
    const total = lineTotal(sale.lines);
    if (total <= 0) throw new Error(`${sale.code} sin total`);
  }

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
    if (!company) throw new Error(`Empresa ${COMPANY_ID} no encontrada`);

    const products = await prisma.product.findMany({
      where: { companyId: COMPANY_ID },
      select: { id: true, name: true, cost: true },
    });
    const byName = new Map(products.map((p) => [p.name, p]));

    const removed = await removeDuplicateClubSales(prisma);
    let created = 0;
    let skipped = 0;
    let totalCop = 0;

    for (const sale of SALES) {
      const existing = await prisma.sale.findFirst({
        where: { companyId: COMPANY_ID, code: sale.code },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const total = lineTotal(sale.lines);
      const lineCreates: Prisma.SaleLineCreateWithoutSaleInput[] = sale.lines.map((line) => {
        const product = line.catalog ? byName.get(line.catalog) : undefined;
        if (line.catalog && !product) {
          throw new Error(`${sale.code}: no existe el producto «${line.catalog}»`);
        }
        const qty = new Prisma.Decimal(line.qty);
        const unitPrice = new Prisma.Decimal(line.unitPrice);
        const costAtSale =
          product && Number(product.cost) > 0 ? product.cost.mul(qty) : null;
        const profit = costAtSale ? unitPrice.mul(qty).sub(costAtSale) : null;
        return {
          ...(product ? { product: { connect: { id: product.id } } } : {}),
          productName: line.name,
          quantity: qty,
          unitPrice,
          costAtSale,
          profit,
        };
      });

      await prisma.sale.create({
        data: {
          companyId: COMPANY_ID,
          code: sale.code,
          saleDate: new Date(sale.at),
          total: new Prisma.Decimal(total),
          paymentMethod: sale.payment,
          notes: sale.notes,
          source: SaleSource.IMPORT,
          lines: { create: lineCreates },
        },
      });
      created++;
      totalCop += total;
      console.log(`${sale.code}  $${total.toLocaleString('es-CO')}  ${sale.payment}`);
    }

    console.log(
      JSON.stringify(
        { removedDuplicates: removed, created, skipped, totalCop },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
