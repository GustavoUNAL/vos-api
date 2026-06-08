import { Module } from '@nestjs/common';
import { PlatformSalesController } from './platform-sales.controller';
import { PlatformSalesService } from './platform-sales.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  controllers: [PlatformSalesController],
  providers: [PlatformSalesService, WhatsappService],
})
export class PlatformSalesModule {}
