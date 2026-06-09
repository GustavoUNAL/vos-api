import { Module } from '@nestjs/common';
import { PlatformSalesController } from './platform-sales.controller';
import { PlatformSalesService } from './platform-sales.service';
@Module({
  controllers: [PlatformSalesController],
  providers: [PlatformSalesService],
})
export class PlatformSalesModule {}
