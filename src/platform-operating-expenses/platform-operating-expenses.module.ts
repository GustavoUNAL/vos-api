import { Module } from '@nestjs/common';
import { PlatformOperatingExpensesController } from './platform-operating-expenses.controller';
import { PlatformOperatingExpensesService } from './platform-operating-expenses.service';

@Module({
  controllers: [PlatformOperatingExpensesController],
  providers: [PlatformOperatingExpensesService],
  exports: [PlatformOperatingExpensesService],
})
export class PlatformOperatingExpensesModule {}
