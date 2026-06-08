import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ProductStatus,
  SaleSource,
  ShopOrderStatus,
  ShopPaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatSaleReceiptText } from '../platform-sales/sale-invoice.pdf';
import { WhatsappService } from '../platform-sales/whatsapp.service';
import { ShopCheckoutDto } from './dto/shop-checkout.dto';
import { PaymentLinkService } from './payment-link.service';

type ShopCartLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

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
        productName: item.productName.trim() || dbProducts.find((p) => p.id === item.productId)!.name,
        quantity: item.quantity,
        unitPrice,
      });
    }

    const orderCode = await this.nextOrderCode(company.id);
    const shopFront = this.config.get<string>('SHOP_FRONT_URL')?.trim();
    const payment = this.paymentLinks.build(dto.paymentMethod, {
      orderCode,
      totalCOP: total,
      customerPhone: phone,
      shopFrontUrl: shopFront
        ? `${shopFront.replace(/\/$/, '')}/#/tienda/pago/${orderCode}`
        : undefined,
    });

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const order = await this.prisma.shopOrder.create({
      data: {
        companyId: company.id,
        orderCode,
        status: ShopOrderStatus.PENDING_PAYMENT,
        paymentMethod: dto.paymentMethod,
        customerName: dto.customerName?.trim() || null,
        customerPhone: phone,
        items: lines as unknown as Prisma.InputJsonValue,
        total: new Prisma.Decimal(Math.round(total)),
        paymentRef: payment.paymentRef,
        paymentLink: payment.paymentLink,
        paymentInstructions: payment.paymentInstructions,
        expiresAt,
      },
    });

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

  async confirmPayment(orderId: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status === ShopOrderStatus.PAID) {
      return this.formatOrder(order, order.company.name, {
        whatsappSent: true,
        saleId: order.saleId,
      });
    }
    if (order.status !== ShopOrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Este pedido ya no se puede pagar.');
    }
    if (order.expiresAt && order.expiresAt < new Date()) {
      await this.prisma.shopOrder.update({
        where: { id: order.id },
        data: { status: ShopOrderStatus.EXPIRED },
      });
      throw new BadRequestException('El pedido expiró. Creá uno nuevo.');
    }

    const lines = order.items as unknown as ShopCartLine[];
    const paymentLabel =
      order.paymentMethod === ShopPaymentMethod.NEQUI ? 'Nequi' : 'Bre-B';

    const result = await this.prisma.$transaction(async (tx) => {
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
          notes: `Pedido ${order.orderCode}`,
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

      const updated = await tx.shopOrder.update({
        where: { id: order.id },
        data: {
          status: ShopOrderStatus.PAID,
          paidAt: new Date(),
          saleId: sale.id,
        },
        include: {
          company: { select: { name: true } },
        },
      });

      const saleFull = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: {
          lines: { orderBy: { productName: 'asc' } },
          company: { select: { name: true } },
        },
      });

      return { updated, saleFull };
    });

    const whatsappSent = await this.whatsapp.sendSaleReceipt(
      order.customerPhone,
      formatSaleReceiptText({
        ...result.saleFull,
        notes: `${result.saleFull.notes ?? ''}\nPedido tienda online.`,
      }),
    );

    return this.formatOrder(result.updated, result.updated.company.name, {
      whatsappSent,
      saleId: result.updated.saleId,
      saleCode: result.saleFull.code,
    });
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
      createdAt: Date;
      paidAt: Date | null;
      expiresAt: Date | null;
    },
    companyName: string,
    extra?: { whatsappSent?: boolean; saleId?: string | null; saleCode?: string | null },
  ) {
    return {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      paymentMethod: order.paymentMethod,
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
      expiresAt: order.expiresAt?.toISOString() ?? null,
      whatsappSent: extra?.whatsappSent,
    };
  }
}
