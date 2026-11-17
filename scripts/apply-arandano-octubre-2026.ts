/**
 * Aplica Ventas_Arandano_octubre_2026.xlsx sobre Arándano.
 * Actualiza las ventas de WhatsApp que el Excel corrige, agrega el 9 de octubre
 * y carga las compras en lotes, sin mover inventario.
 * No toca las ventas del punto de venta (V0…).
 */
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, SaleSource } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { SALES } from './import-whatsapp-arandano-sales';

config({ path: '.env' });
config({ path: '.env.local', override: true });

const COMPANY_ID = 'seed-arandano-cafe-bar';

const REFRESH = new Set([
  'WA-20261003-2307',
  'WA-20261003-2314',
  'WA-20261003-2359',
  'WA-20261006-1859',
  'WA-20261006-1902',
  'WA-20261007-1856',
  'WA-20261008-0009',
  'WA-20261009-VECINOS',
  'WA-20261009-LISTA2',
]);

const SUPERSEDED = ['WA-20261006-2353', 'WA-20261007-2315'];

type PurchaseIn = {
  code: string;
  at: string;
  name: string;
  supplier?: string;
  notes: string;
  lines: { name: string; qty: number; total: number }[];
};

const PURCHASES: PurchaseIn[] = [
  {
    code: 'C-XLS-20261001-JESSICA',
    at: '2026-10-01T12:00:00-05:00',
    name: 'Pago a Jessica — apoyo septiembre',
    supplier: 'Jessica',
    notes: 'Excel octubre 2026 · Nequi M17985931. No es una compra de mercancía.',
    lines: [{ name: 'Pago a Jessica — apoyo mes de septiembre', qty: 1, total: 1000000 }],
  },
  {
    code: 'C-XLS-20261002-FRUVER',
    at: '2026-10-02T12:00:00-05:00',
    name: 'Limón Tahití y lechuga',
    supplier: 'Fruver Maridíaz',
    notes: 'Excel octubre 2026 · Tiquete 86799.',
    lines: [{ name: 'Limón Tahití + lechuga crespa', qty: 1, total: 5000 }],
  },
  {
    code: 'C-XLS-20261002-LIMON',
    at: '2026-10-02T12:00:00-05:00',
    name: 'Limones',
    supplier: 'Sonia',
    notes: 'Excel octubre 2026 · Mensaje de Sonia.',
    lines: [{ name: 'Limones', qty: 1, total: 13000 }],
  },
  {
    code: 'C-XLS-20261003-PAPAS',
    at: '2026-10-03T12:00:00-05:00',
    name: 'Paca de papas jalapeñas',
    notes: 'Excel octubre 2026 · Recibo manual.',
    lines: [{ name: 'Paca de papas jalapeñas', qty: 1, total: 16000 }],
  },
  {
    code: 'C-XLS-20261003-PALANQUETA',
    at: '2026-10-03T12:00:00-05:00',
    name: 'Palanqueta',
    supplier: 'La Merced Restaurante',
    notes: 'Excel octubre 2026 · Davivienda (Sonia).',
    lines: [{ name: 'Palanqueta', qty: 1, total: 12000 }],
  },
  {
    code: 'C-XLS-20261005-SERVILLETAS',
    at: '2026-10-05T12:00:00-05:00',
    name: 'Servilletas',
    notes: 'Excel octubre 2026 · Recibo manual.',
    lines: [{ name: 'Servilletas', qty: 1, total: 4500 }],
  },
  {
    code: 'C-XLS-20261007-INSUMOS',
    at: '2026-10-07T12:00:00-05:00',
    name: 'Sal, algodón y maracuyá',
    notes: 'Excel octubre 2026 · Salieron en el cierre de caja.',
    lines: [
      { name: 'Sal', qty: 1, total: 1700 },
      { name: 'Algodón', qty: 1, total: 2000 },
      { name: 'Maracuyá', qty: 1, total: 8000 },
    ],
  },
  {
    code: 'C-XLS-20261008-FRUVER',
    at: '2026-10-08T12:00:00-05:00',
    name: 'Lulo, maracuyá y limón',
    supplier: 'Fruver Maridíaz',
    notes: 'Excel octubre 2026 · Tiquete 87901.',
    lines: [{ name: 'Lulo, maracuyá y limón', qty: 1, total: 12500 }],
  },
  {
    code: 'C-XLS-20261009-JUMBO-ENSALADA',
    at: '2026-10-09T12:00:00-05:00',
    name: 'Jumbo · ensalada y agua',
    supplier: 'Jumbo',
    notes: 'Excel octubre 2026 · Factura MS12-10000760.',
    lines: [{ name: 'Ensalada + agua', qty: 1, total: 23090 }],
  },
  {
    code: 'C-XLS-20261009-JUMBO-LICOR',
    at: '2026-10-09T12:00:00-05:00',
    name: 'Jumbo · aguardiente y fiambres',
    supplier: 'Jumbo',
    notes: 'Excel octubre 2026 · Factura MS10-10000347.',
    lines: [{ name: '4 aguardientes, queso, jamón, aperitivo y bolsa', qty: 1, total: 194880 }],
  },
  {
    code: 'C-XLS-20261009-PAPAS',
    at: '2026-10-09T12:00:00-05:00',
    name: '12 papas',
    notes: 'Excel octubre 2026 · Recibo manual.',
    lines: [{ name: '12 papas', qty: 12, total: 18000 }],
  },
  {
    code: 'C-XLS-20261009-FRUTAS',
    at: '2026-10-09T12:00:00-05:00',
    name: 'Frutas',
    notes: 'Excel octubre 2026 · Mensaje del chat.',
    lines: [{ name: 'Frutas', qty: 1, total: 20000 }],
  },
  {
    code: 'C-XLS-20261009-PICADA',
    at: '2026-10-09T12:00:00-05:00',
    name: 'Compra de picada',
    supplier: 'Sonia',
    notes: 'Excel octubre 2026 · Mensaje de Sonia. El valor está por confirmar.',
    lines: [{ name: 'Picada', qty: 1, total: 48000 }],
  },
  {
    code: 'C-XLS-20261009-AGUARDIENTE',
    at: '2026-10-09T20:39:00-05:00',
    name: '2 botellas de aguardiente',
    notes:
      'Excel octubre 2026 · Mensaje del chat, $124.000. Otras dos botellas de esa noche no traen valor y no se cargaron.',
    lines: [{ name: '2 botellas de aguardiente', qty: 2, total: 124000 }],
  },
  {
    code: 'C-XLS-20261009-SUPER',
    at: '2026-10-09T20:57:00-05:00',
    name: 'Supermercado',
    supplier: 'Sonia',
    notes: 'Excel octubre 2026 · Factura electrónica de las 8:57 p. m.',
    lines: [
      {
        name: '5 aguardientes, 4 six de cerveza lata, 4 six Poker, servilletas, salsa, soda six y 2 aguas',
        qty: 1,
        total: 365150,
      },
    ],
  },
  {
    code: 'C-XLS-20261010-AGUARDIENTE',
    at: '2026-10-10T12:00:00-05:00',
    name: 'Botellas de aguardiente',
    notes: 'Excel octubre 2026 · Mensaje del chat. No es una venta.',
    lines: [{ name: 'Botellas de aguardiente', qty: 1, total: 186000 }],
  },
  {
    code: 'C-XLS-20261014-AGUA',
    at: '2026-10-14T12:00:00-05:00',
    name: 'Recibo del agua',
    supplier: 'Banco de Bogotá',
    notes: 'Excel octubre 2026 · Pago en corresponsal. Recibo 003468.',
    lines: [{ name: 'Recibo del agua', qty: 1, total: 151180 }],
  },
  {
    code: 'C-XLS-20261014-INTERNET',
    at: '2026-10-14T12:00:00-05:00',
    name: 'Internet Claro Hogar',
    supplier: 'Claro',
    notes: 'Excel octubre 2026 · Nequi M23782653.',
    lines: [{ name: 'Internet Claro Hogar', qty: 1, total: 78700 }],
  },
];

function lineTotal(lines: { qty: number; unitPrice: number }[]): number {
  return lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const products = await prisma.product.findMany({
      where: { companyId: COMPANY_ID },
      select: { id: true, name: true, cost: true },
    });
    const byName = new Map(products.map((p) => [p.name, p]));

    const removed: string[] = [];
    for (const code of SUPERSEDED) {
      const sale = await prisma.sale.findFirst({
        where: { companyId: COMPANY_ID, code },
        include: { shopOrders: { select: { id: true } } },
      });
      if (!sale) continue;
      if (sale.shopOrders.length > 0) {
        throw new Error(`${code} tiene pedidos de tienda; no se borra`);
      }
      await prisma.sale.delete({ where: { id: sale.id } });
      removed.push(code);
    }

    const updated: string[] = [];
    const created: string[] = [];
    for (const sale of SALES) {
      if (!REFRESH.has(sale.code)) continue;
      const total = lineTotal(sale.lines);
      const lineCreates: Prisma.SaleLineCreateWithoutSaleInput[] = sale.lines.map((line) => {
        const product = line.catalog ? byName.get(line.catalog) : undefined;
        if (line.catalog && !product) {
          throw new Error(`${sale.code}: no existe el producto «${line.catalog}»`);
        }
        const qty = new Prisma.Decimal(line.qty);
        const unitPrice = new Prisma.Decimal(line.unitPrice);
        const costAtSale = product && Number(product.cost) > 0 ? product.cost.mul(qty) : null;
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

      const existing = await prisma.sale.findFirst({
        where: { companyId: COMPANY_ID, code: sale.code },
        select: { id: true },
      });
      if (existing) {
        await prisma.saleLine.deleteMany({ where: { saleId: existing.id } });
        await prisma.sale.update({
          where: { id: existing.id },
          data: {
            saleDate: new Date(sale.at),
            total: new Prisma.Decimal(total),
            paymentMethod: sale.payment,
            notes: sale.notes,
            source: SaleSource.IMPORT,
            lines: { create: lineCreates },
          },
        });
        updated.push(`${sale.code} $${total}`);
      } else {
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
        created.push(`${sale.code} $${total}`);
      }
    }

    const purchases: string[] = [];
    for (const lot of PURCHASES) {
      const existing = await prisma.purchaseLot.findFirst({
        where: { companyId: COMPANY_ID, code: lot.code },
        select: { id: true },
      });
      if (existing) {
        purchases.push(`${lot.code} ya estaba`);
        continue;
      }
      const total = lot.lines.reduce((sum, line) => sum + line.total, 0);
      await prisma.purchaseLot.create({
        data: {
          companyId: COMPANY_ID,
          code: lot.code,
          name: lot.name,
          supplier: lot.supplier,
          purchaseDate: new Date(lot.at),
          notes: lot.notes,
          itemCount: lot.lines.length,
          totalValue: new Prisma.Decimal(total),
          lines: {
            create: lot.lines.map((line, index) => ({
              companyId: COMPANY_ID,
              lineName: line.name,
              quantityPurchased: new Prisma.Decimal(line.qty),
              unit: 'und',
              purchaseUnitCostCOP: new Prisma.Decimal(line.total / line.qty),
              lineTotalCOP: new Prisma.Decimal(line.total),
              sortOrder: index,
            })),
          },
        },
      });
      purchases.push(`${lot.code} $${total}`);
    }

    console.log(JSON.stringify({ removed, updated, created, purchases }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
