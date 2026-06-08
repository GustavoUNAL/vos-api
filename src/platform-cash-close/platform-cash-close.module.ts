import { Module } from '@nestjs/common';
import { PlatformCashCloseController } from './platform-cash-close.controller';
import { PlatformCashCloseService } from './platform-cash-close.service';

@Module({
  controllers: [PlatformCashCloseController],
  providers: [PlatformCashCloseService],
  exports: [PlatformCashCloseService],
})
export class PlatformCashCloseModule {}
