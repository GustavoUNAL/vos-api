import { Module } from '@nestjs/common';
import { PaymentLinkService } from './payment-link.service';
import { PublicShopController } from './public-shop.controller';
import { PublicShopService } from './public-shop.service';
import { WhatsappService } from '../platform-sales/whatsapp.service';

@Module({
  controllers: [PublicShopController],
  providers: [PublicShopService, PaymentLinkService, WhatsappService],
})
export class PublicShopModule {}
