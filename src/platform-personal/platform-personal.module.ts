import { Module } from '@nestjs/common';
import { PlatformPersonalController } from './platform-personal.controller';
import { PlatformPersonalService } from './platform-personal.service';

@Module({
  controllers: [PlatformPersonalController],
  providers: [PlatformPersonalService],
})
export class PlatformPersonalModule {}
