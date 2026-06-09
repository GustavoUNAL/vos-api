import { Prisma, SaleSource, ShopOrderStatus, ShopPaymentMethod } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { formatSaleReceiptText } from '../platform-sales/sale-invoice.pdf';
import type { WhatsappService } from '../platform-sales/whatsapp.service';

export type ShopCartLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export function shopPaymentLabel(method: ShopPaymentMethod): string {
  if (method === ShopPaymentMethod.NEQUI) return 'Nequi';
  if (method === ShopPaymentMethod.BREB) return 'Bre-B';
  return 'Efectivo';
}

export async function settleShopOrderAsSale(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  order: {
    id: string;
    companyId: string;
    orderCode: string;
    customerName: string | null;
    customerPhone: string;
    customerNotes?: string | null;
    items: unknown;
    total: Prisma.Decimal;
    paymentMethod: ShopPaymentMethod;
  },
): Promise<{
  saleId: string;
  saleCode: string;
  whatsappSent: boolean;
  internalNotified: boolean;
}> {
  const lines = order.items as ShopCartLine[];
  const paymentLabel = shopPaymentLabel(order.paymentMethod);

  const result = await prisma.$transaction(async (tx) => {
    const saleCount = await tx.sale.count({
      where: { companyId: order.companyId },
    });
    const saleCode = `V${String(saleCount + 1).padStart(4, '0')}`;

    const sale = await tx.sale.create({
      data: {
        companyId: order.companyId,
        code: saleCode,
        saleDate: new Date(),
        total: order.total,
        paymentMethod: paymentLabel,
        source: SaleSource.SHOP,
        mesa: order.customerName?.trim() || 'Tienda online',
        customerPhone: order.customerPhone,
        notes: [
          `Pedido ${order.orderCode}`,
          order.customerNotes?.trim() ? order.customerNotes.trim() : null,
        ]
          .filter(Boolean)
          .join(' · '),
      },
    });

    for (const line of lines) {
      const product = await tx.product.findFirst({
        where: { id: line.productId, companyId: order.companyId },
        select: { cost: true },
      });
      const costAtSale = product?.cost ?? null;
      const lineTotal = line.quantity * line.unitPrice;
      const profit =
        costAtSale != null
          ? new Prisma.Decimal(
              Math.round(lineTotal - Number(costAtSale) * line.quantity),
            )
          : null;

      await tx.saleLine.create({
        data: {
          saleId: sale.id,
          productId: line.productId,
          productName: line.productName,
          quantity: new Prisma.Decimal(line.quantity),
          unitPrice: new Prisma.Decimal(line.unitPrice),
          costAtSale,
          profit,
        },
      });
    }

    await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        status: ShopOrderStatus.PAID,
        paidAt: new Date(),
        saleId: sale.id,
        paymentMethod: order.paymentMethod,
      },
    });

    return tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        lines: { orderBy: { productName: 'asc' } },
        company: { select: { name: true } },
      },
    });
  });

  const receiptBody = formatSaleReceiptText({
    ...result,
    notes: `${result.notes ?? ''}\nPedido tienda online.`,
  });

  const whatsappSent = await whatsapp.sendSaleReceipt(
    order.customerPhone,
    receiptBody,
    {
      saleDate: result.saleDate,
      total: Number(result.total),
      code: result.code,
      companyName: result.company.name,
    },
  );

  const internalNotified = await whatsapp.sendInternalNotification(
    [
      `*Nuevo cobro tienda*`,
      `Pedido: ${order.orderCode}`,
      `Cliente: ${order.customerName?.trim() || order.customerPhone}`,
      `Pago: ${paymentLabel}`,
      `Total: ${Number(order.total).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}`,
      '',
      receiptBody.replace(/\*/g, ''),
    ].join('\n'),
  );

  return {
    saleId: result.id,
    saleCode: result.code ?? result.id.slice(0, 8),
    whatsappSent,
    internalNotified,
  };
}

export function formatShopOrderInternalAlert(order: {
  orderCode: string;
  customerName: string | null;
  customerPhone: string;
  total: Prisma.Decimal | number;
  items: unknown;
}): string {
  const lines = order.items as ShopCartLine[];
  const detail = lines
    .map(
      (l) =>
        `• ${l.productName} x${l.quantity} — ${(l.quantity * l.unitPrice).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}`,
    )
    .join('\n');
  const total =
    typeof order.total === 'number'
      ? order.total
      : Number(order.total.toString());
  return [
    '*Pedido tienda recibido*',
    `Código: ${order.orderCode}`,
    `Cliente: ${order.customerName?.trim() || order.customerPhone}`,
    `Tel: ${order.customerPhone}`,
    '',
    detail,
    '',
    `Total: ${total.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}`,
  ].join('\n');
}
