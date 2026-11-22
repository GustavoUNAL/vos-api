import { Module } from '@nestjs/common';
import { PlatformPersonalController } from './platform-personal.controller';
import { PlatformPersonalService } from './platform-personal.service';
import { AuraService } from './aura.service';

@Module({
  controllers: [PlatformPersonalController],
  providers: [PlatformPersonalService, AuraService],
})
export class PlatformPersonalModule {}
