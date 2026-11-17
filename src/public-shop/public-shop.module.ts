import { Module } from '@nestjs/common';
import { PaymentLinkService } from './payment-link.service';
import { PublicShopController } from './public-shop.controller';
import { WompiWebhookController } from './wompi-webhook.controller';
import { PublicShopService } from './public-shop.service';
import { PlatformShopOrdersModule } from '../platform-shop-orders/platform-shop-orders.module';

@Module({
  imports: [PlatformShopOrdersModule],
  controllers: [PublicShopController, WompiWebhookController],
  providers: [PublicShopService, PaymentLinkService],
})
export class PublicShopModule {}
