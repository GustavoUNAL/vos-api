import { Module } from '@nestjs/common';
import { PlatformJournalController } from './platform-journal.controller';
import { PlatformJournalService } from './platform-journal.service';

@Module({
  controllers: [PlatformJournalController],
  providers: [PlatformJournalService],
})
export class PlatformJournalModule {}
