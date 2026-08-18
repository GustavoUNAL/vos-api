import { Module } from '@nestjs/common';
import { PlatformProjectsController } from './platform-projects.controller';
import { PlatformProjectsService } from './platform-projects.service';

@Module({
  controllers: [PlatformProjectsController],
  providers: [PlatformProjectsService],
})
export class PlatformProjectsModule {}
