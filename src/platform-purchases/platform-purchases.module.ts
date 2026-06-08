import { Module } from '@nestjs/common';
import { PlatformPurchasesController } from './platform-purchases.controller';
import { PlatformPurchasesService } from './platform-purchases.service';

@Module({
  controllers: [PlatformPurchasesController],
  providers: [PlatformPurchasesService],
})
export class PlatformPurchasesModule {}
