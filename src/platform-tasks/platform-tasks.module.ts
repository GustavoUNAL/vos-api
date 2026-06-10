import { Module } from '@nestjs/common';
import { PlatformTasksController } from './platform-tasks.controller';
import { PlatformTasksService } from './platform-tasks.service';

@Module({
  controllers: [PlatformTasksController],
  providers: [PlatformTasksService],
})
export class PlatformTasksModule {}
