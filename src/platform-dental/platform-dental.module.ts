import { Module } from '@nestjs/common';
import { PlatformDentalController } from './platform-dental.controller';
import { PlatformDentalService } from './platform-dental.service';

@Module({
  controllers: [PlatformDentalController],
  providers: [PlatformDentalService],
  exports: [PlatformDentalService],
})
export class PlatformDentalModule {}
