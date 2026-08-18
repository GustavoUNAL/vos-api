import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlatformBookingService } from './platform-booking.service';
import { PublicCreateAppointmentDto } from './dto/booking.dto';

@Controller('public/booking')
export class PublicBookingController {
  constructor(private readonly booking: PlatformBookingService) {}

  @Get(':slug')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  catalog(@Param('slug') slug: string) {
    return this.booking.publicCatalog(slug);
  }

  @Get(':slug/availability')
  @Throttle({ default: { limit: 80, ttl: 60_000 } })
  availability(
    @Param('slug') slug: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId: string,
    @Query('staffId') staffId: string,
  ) {
    return this.booking.publicAvailability(slug, date, serviceId, staffId);
  }

  @Post(':slug/appointments')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@Param('slug') slug: string, @Body() dto: PublicCreateAppointmentDto) {
    return this.booking.publicCreate(slug, dto);
  }
}
