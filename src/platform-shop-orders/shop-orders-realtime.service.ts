import { Injectable } from '@nestjs/common';
import { ShopOrdersGateway } from './shop-orders.gateway';

@Injectable()
export class ShopOrdersRealtimeService {
  constructor(private readonly gateway: ShopOrdersGateway) {}

  emitCreated(companyId: string, order: Record<string, unknown>): void {
    this.gateway.emitShopOrderEvent(companyId, 'shop-order.created', order);
  }

  emitUpdated(companyId: string, order: Record<string, unknown>): void {
    this.gateway.emitShopOrderEvent(companyId, 'shop-order.updated', order);
  }
}
