import { Module } from '@nestjs/common';
import { SchedulingEngineModule } from '../scheduling-engine/scheduling-engine.module';
import { BookingNotificationService } from './booking-notification.service';
import { PlatformBookingController } from './platform-booking.controller';
import { PlatformBookingService } from './platform-booking.service';
import { PublicBookingController } from './public-booking.controller';

@Module({
  imports: [SchedulingEngineModule],
  controllers: [PlatformBookingController, PublicBookingController],
  providers: [PlatformBookingService, BookingNotificationService],
  exports: [PlatformBookingService, SchedulingEngineModule],
})
export class PlatformBookingModule {}
