import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShopOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import {
  settleShopOrderAsSale,
  shopPaymentLabel,
} from '../public-shop/shop-order-settlement';
import { TelegramService } from '../telegram/telegram.service';
import { ShopOrdersRealtimeService } from './shop-orders-realtime.service';
import type { CollectShopOrderPaymentDto } from './dto/shop-order.dto';

@Injectable()
export class PlatformShopOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly realtime: ShopOrdersRealtimeService,
  ) {}

  async list(tenant: TenantContext, status?: string) {
    const where: { companyId: string; status?: ShopOrderStatus } = {
      companyId: tenant.companyId,
    };
    if (
      status &&
      (Object.values(ShopOrderStatus) as string[]).includes(status)
    ) {
      where.status = status as ShopOrderStatus;
    }

    const orders = await this.prisma.shopOrder.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((o) => this.format(o));
  }

  async updateStatus(
    tenant: TenantContext,
    id: string,
    next: 'PREPARING' | 'DELIVERED',
  ) {
    const order = await this.prisma.shopOrder.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    if (next === 'PREPARING') {
      if (
        order.status !== ShopOrderStatus.PENDING &&
        order.status !== ShopOrderStatus.PREPARING
      ) {
        throw new BadRequestException('El pedido no puede pasar a preparación.');
      }
      const updated = await this.prisma.shopOrder.update({
        where: { id: order.id },
        data: {
          status: ShopOrderStatus.PREPARING,
          preparingAt: order.preparingAt ?? new Date(),
        },
      });
      const formatted = this.format(updated);
      this.realtime.emitUpdated(tenant.companyId, formatted);
      return formatted;
    }

    if (
      order.status !== ShopOrderStatus.PREPARING &&
      order.status !== ShopOrderStatus.PENDING
    ) {
      throw new BadRequestException('El pedido no está listo para entregar.');
    }

    const updated = await this.prisma.shopOrder.update({
      where: { id: order.id },
      data: {
        status: ShopOrderStatus.DELIVERED,
        deliveredAt: new Date(),
        preparingAt: order.preparingAt ?? new Date(),
      },
    });
    const formatted = this.format(updated);
    this.realtime.emitUpdated(tenant.companyId, formatted);
    return formatted;
  }

  async collectPayment(
    tenant: TenantContext,
    id: string,
    dto: CollectShopOrderPaymentDto,
  ) {
    const order = await this.prisma.shopOrder.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status === ShopOrderStatus.PAID) {
      return {
        ...this.format(order),
        whatsappSent: true,
        internalNotified: true,
        saleCode: order.saleId,
      };
    }
    if (order.status !== ShopOrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Marcá el pedido como entregado antes de cobrar.',
      );
    }

    const settlement = await settleShopOrderAsSale(
      this.prisma,
      this.telegram,
      {
        ...order,
        paymentMethod: dto.paymentMethod,
      },
    );

    const refreshed = await this.prisma.shopOrder.findUniqueOrThrow({
      where: { id: order.id },
    });

    const formatted = {
      ...this.format(refreshed),
      whatsappSent: settlement.whatsappSent,
      internalNotified: settlement.internalNotified,
      saleCode: settlement.saleCode,
      paymentMethodLabel: shopPaymentLabel(dto.paymentMethod),
    };
    this.realtime.emitUpdated(tenant.companyId, formatted);
    return formatted;
  }

  private format(order: {
    id: string;
    orderCode: string;
    status: ShopOrderStatus;
    paymentMethod: import('@prisma/client').ShopPaymentMethod;
    customerName: string | null;
    customerPhone: string;
    items: unknown;
    total: import('@prisma/client').Prisma.Decimal;
    paymentRef: string | null;
    paymentLink: string | null;
    paymentInstructions: string | null;
    saleId: string | null;
    preparingAt: Date | null;
    deliveredAt: Date | null;
    createdAt: Date;
    paidAt: Date | null;
    expiresAt: Date | null;
  }) {
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
      saleId: order.saleId,
      preparingAt: order.preparingAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      expiresAt: order.expiresAt?.toISOString() ?? null,
    };
  }
}
