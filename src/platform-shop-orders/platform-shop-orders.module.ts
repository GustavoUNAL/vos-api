import { Module } from '@nestjs/common';
import { WhatsappService } from '../platform-sales/whatsapp.service';
import { PlatformShopOrdersController } from './platform-shop-orders.controller';
import { PlatformShopOrdersService } from './platform-shop-orders.service';

@Module({
  controllers: [PlatformShopOrdersController],
  providers: [PlatformShopOrdersService, WhatsappService],
  exports: [PlatformShopOrdersService],
})
export class PlatformShopOrdersModule {}
