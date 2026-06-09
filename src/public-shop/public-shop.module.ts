import { Module } from '@nestjs/common';
import { PaymentLinkService } from './payment-link.service';
import { PublicShopController } from './public-shop.controller';
import { PublicShopService } from './public-shop.service';
import { PlatformShopOrdersModule } from '../platform-shop-orders/platform-shop-orders.module';

@Module({
  imports: [PlatformShopOrdersModule],
  controllers: [PublicShopController],
  providers: [PublicShopService, PaymentLinkService],
})
export class PublicShopModule {}
