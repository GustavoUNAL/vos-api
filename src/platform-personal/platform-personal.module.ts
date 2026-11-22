import { Module } from '@nestjs/common';
import { PlatformPersonalController } from './platform-personal.controller';
import { PlatformPersonalService } from './platform-personal.service';
import { VicenteService } from './vicente.service';

@Module({
  controllers: [PlatformPersonalController],
  providers: [PlatformPersonalService, VicenteService],
})
export class PlatformPersonalModule {}
