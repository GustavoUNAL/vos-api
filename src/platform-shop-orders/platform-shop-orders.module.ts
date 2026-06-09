import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformShopOrdersController } from './platform-shop-orders.controller';
import { PlatformShopOrdersService } from './platform-shop-orders.service';
import { ShopOrdersGateway } from './shop-orders.gateway';
import { ShopOrdersRealtimeService } from './shop-orders-realtime.service';

@Module({
  imports: [AuthModule],
  controllers: [PlatformShopOrdersController],
  providers: [
    PlatformShopOrdersService,
    ShopOrdersGateway,
    ShopOrdersRealtimeService,
  ],
  exports: [PlatformShopOrdersService, ShopOrdersRealtimeService],
})
export class PlatformShopOrdersModule {}
