import { Module } from '@nestjs/common';
import { PlatformInventoryController } from './platform-inventory.controller';
import { PlatformInventoryService } from './platform-inventory.service';

@Module({
  controllers: [PlatformInventoryController],
  providers: [PlatformInventoryService],
})
export class PlatformInventoryModule {}
