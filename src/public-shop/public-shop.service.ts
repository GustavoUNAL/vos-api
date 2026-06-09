import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ProductStatus,
  ShopOrderStatus,
  ShopPaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../platform-sales/whatsapp.service';
import { ShopCheckoutDto } from './dto/shop-checkout.dto';
import { PaymentLinkService } from './payment-link.service';
import {
  formatShopOrderInternalAlert,
  settleShopOrderAsSale,
  shopPaymentLabel,
  type ShopCartLine,
} from './shop-order-settlement';

@Injectable()
export class PublicShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentLinks: PaymentLinkService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  private async resolveCompany(slug: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        shopSlug: { equals: slug, mode: 'insensitive' },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        shopSlug: true,
        phone: true,
        address: true,
      },
    });
    if (!company) {
      throw new NotFoundException('Tienda no encontrada');
    }
    return company;
  }

  async getCatalog(slug: string) {
    const company = await this.resolveCompany(slug);
    const [categories, products] = await Promise.all([
      this.prisma.productCategory.findMany({
        where: { companyId: company.id, active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, slug: true, sortOrder: true },
      }),
      this.prisma.product.findMany({
        where: { companyId: company.id, status: ProductStatus.ACTIVE },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          salePrice: true,
          primaryImageUrl: true,
          categoryId: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      company: {
        id: company.id,
        name: company.name,
        slug: company.shopSlug,
        phone: company.phone,
        address: company.address,
      },
      categories,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.salePrice.toString()),
        imageUrl: p.primaryImageUrl,
        categoryId: p.categoryId,
        category: p.category,
      })),
    };
  }

  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('3')) return digits;
    if (digits.length === 12 && digits.startsWith('57')) return digits.slice(2);
    throw new BadRequestException('Celular inválido (10 dígitos, Colombia).');
  }

  private async nextOrderCode(companyId: string): Promise<string> {
    const count = await this.prisma.shopOrder.count({ where: { companyId } });
    return `SHOP-${String(count + 1).padStart(5, '0')}`;
  }

  async checkout(slug: string, dto: ShopCheckoutDto) {
    const company = await this.resolveCompany(slug);
    const phone = this.normalizePhone(dto.customerPhone);
    const paymentMethod = dto.paymentMethod ?? ShopPaymentMethod.NEQUI;

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const dbProducts = await this.prisma.product.findMany({
      where: {
        companyId: company.id,
        id: { in: productIds },
        status: ProductStatus.ACTIVE,
      },
      select: { id: true, name: true, salePrice: true },
    });
    const priceById = new Map(
      dbProducts.map((p) => [p.id, Number(p.salePrice.toString())]),
    );

    const lines: ShopCartLine[] = [];
    let total = 0;
    for (const item of dto.items) {
      const unitPrice = priceById.get(item.productId);
      if (unitPrice == null) {
        throw new BadRequestException(`Producto no disponible: ${item.productId}`);
      }
      if (item.quantity < 1) {
        throw new BadRequestException('Cantidad inválida');
      }
      const lineTotal = unitPrice * item.quantity;
      total += lineTotal;
      lines.push({
        productId: item.productId,
        productName:
          item.productName.trim() ||
          dbProducts.find((p) => p.id === item.productId)!.name,
        quantity: item.quantity,
        unitPrice,
      });
    }

    const orderCode = await this.nextOrderCode(company.id);
    const shopFront = this.config.get<string>('SHOP_FRONT_URL')?.trim();
    const payment =
      paymentMethod === ShopPaymentMethod.CASH
        ? {
            paymentRef: null,
            paymentLink: null,
            paymentInstructions:
              'Pagás en caja al recibir tu pedido (efectivo, Nequi o Bre-B).',
          }
        : this.paymentLinks.build(paymentMethod, {
            orderCode,
            totalCOP: total,
            customerPhone: phone,
            shopFrontUrl: shopFront
              ? `${shopFront.replace(/\/$/, '')}/#/tienda/pedido/${orderCode}`
              : undefined,
          });

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const order = await this.prisma.shopOrder.create({
      data: {
        companyId: company.id,
        orderCode,
        status: ShopOrderStatus.PENDING,
        paymentMethod,
        customerName: dto.customerName?.trim() || null,
        customerPhone: phone,
        customerNotes: dto.customerNotes?.trim() || null,
        items: lines as unknown as Prisma.InputJsonValue,
        total: new Prisma.Decimal(Math.round(total)),
        paymentRef: payment.paymentRef,
        paymentLink: payment.paymentLink,
        paymentInstructions: payment.paymentInstructions,
        expiresAt,
      },
    });

    await this.whatsapp.sendInternalNotification(
      formatShopOrderInternalAlert({
        orderCode: order.orderCode,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        total: order.total,
        items: lines,
      }),
    );

    return this.formatOrder(order, company.name);
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: { company: { select: { name: true, shopSlug: true } } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return this.formatOrder(order, order.company.name);
  }

  async getOrderByCode(slug: string, orderCode: string) {
    const company = await this.resolveCompany(slug);
    const order = await this.prisma.shopOrder.findFirst({
      where: { companyId: company.id, orderCode },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return this.formatOrder(order, company.name);
  }

  /** @deprecated El cobro lo realiza el POS tras marcar entregado. */
  async confirmPayment(orderId: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status === ShopOrderStatus.PAID) {
      return this.formatOrder(order, order.company.name, {
        whatsappSent: true,
        saleId: order.saleId,
      });
    }
    throw new BadRequestException(
      'El pago se confirma en caja cuando el pedido esté entregado.',
    );
  }

  private formatOrder(
    order: {
      id: string;
      orderCode: string;
      status: ShopOrderStatus;
      paymentMethod: ShopPaymentMethod;
      customerName: string | null;
      customerPhone: string;
      items: unknown;
      total: Prisma.Decimal;
      paymentRef: string | null;
      paymentLink: string | null;
      paymentInstructions: string | null;
      saleId: string | null;
      preparingAt?: Date | null;
      deliveredAt?: Date | null;
      createdAt: Date;
      paidAt: Date | null;
      expiresAt: Date | null;
    },
    companyName: string,
    extra?: {
      whatsappSent?: boolean;
      saleId?: string | null;
      saleCode?: string | null;
    },
  ) {
    return {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentMethodLabel: shopPaymentLabel(order.paymentMethod),
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      items: order.items,
      total: Number(order.total.toString()),
      totalCOP: order.total.toFixed(0),
      paymentRef: order.paymentRef,
      paymentLink: order.paymentLink,
      paymentInstructions: order.paymentInstructions,
      saleId: extra?.saleId ?? order.saleId,
      saleCode: extra?.saleCode ?? null,
      companyName,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      preparingAt: order.preparingAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      whatsappSent: extra?.whatsappSent,
    };
  }
}
