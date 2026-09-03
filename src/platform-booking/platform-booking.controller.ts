import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { PlatformBookingService } from './platform-booking.service';
import {
  CreateAppointmentDto,
  CreateBlockDto,
  ReplaceHoursDto,
  UpdateAppointmentDto,
  UpdateSettingsDto,
  UpsertBookingCustomerDto,
  UpsertBookingServiceDto,
  UpsertBookingStaffDto,
} from './dto/booking.dto';
import { BookingPushService } from './booking-push.service';
import { BookingAppointmentSource } from '@prisma/client';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('booking')
export class PlatformBookingController {
  constructor(
    private readonly booking: PlatformBookingService,
    private readonly push: BookingPushService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('booking.view')
  dashboard(@CurrentTenant() tenant: TenantContext) {
    return this.booking.dashboard(tenant);
  }

  @Get('settings')
  @RequirePermissions('booking.view')
  settings(@CurrentTenant() tenant: TenantContext) {
    return this.booking.getSettings(tenant.companyId);
  }

  @Patch('settings')
  @RequirePermissions('booking.update')
  updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.booking.updateSettings(tenant, dto);
  }

  @Get('services')
  @RequirePermissions('booking.view')
  services(@CurrentTenant() tenant: TenantContext, @Query('all') all?: string) {
    return this.booking.listServices(tenant, all === '1');
  }

  @Post('services')
  @RequirePermissions('booking.create')
  createService(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertBookingServiceDto,
  ) {
    return this.booking.createService(tenant, dto);
  }

  @Patch('services/:id')
  @RequirePermissions('booking.update')
  updateService(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: Partial<UpsertBookingServiceDto>,
  ) {
    return this.booking.updateService(tenant, id, dto);
  }

  @Get('staff')
  @RequirePermissions('booking.view')
  staff(@CurrentTenant() tenant: TenantContext, @Query('all') all?: string) {
    return this.booking.listStaff(tenant, all === '1');
  }

  @Post('staff')
  @RequirePermissions('booking.create')
  createStaff(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertBookingStaffDto,
  ) {
    return this.booking.createStaff(tenant, dto);
  }

  @Patch('staff/:id')
  @RequirePermissions('booking.update')
  updateStaff(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: Partial<UpsertBookingStaffDto>,
  ) {
    return this.booking.updateStaff(tenant, id, dto);
  }

  @Get('customers')
  @RequirePermissions('booking.view')
  customers(@CurrentTenant() tenant: TenantContext, @Query('q') q?: string) {
    return this.booking.listCustomers(tenant, q);
  }

  @Post('customers')
  @RequirePermissions('booking.create')
  upsertCustomer(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertBookingCustomerDto,
  ) {
    return this.booking.upsertCustomer(tenant, dto);
  }

  @Get('hours')
  @RequirePermissions('booking.view')
  hours(
    @CurrentTenant() tenant: TenantContext,
    @Query('staffId') staffId?: string,
  ) {
    return this.booking.listHours(tenant, staffId === '' ? null : staffId);
  }

  @Post('hours')
  @RequirePermissions('booking.update')
  replaceHours(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: ReplaceHoursDto,
  ) {
    return this.booking.replaceHours(tenant, dto);
  }

  @Get('blocks')
  @RequirePermissions('booking.view')
  blocks(@CurrentTenant() tenant: TenantContext) {
    return this.booking.listBlocks(tenant);
  }

  @Post('blocks')
  @RequirePermissions('booking.update')
  createBlock(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateBlockDto,
  ) {
    return this.booking.createBlock(tenant, dto);
  }

  @Delete('blocks/:id')
  @RequirePermissions('booking.delete')
  deleteBlock(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.booking.deleteBlock(tenant, id);
  }

  @Get('appointments')
  @RequirePermissions('booking.view')
  appointments(
    @CurrentTenant() tenant: TenantContext,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.booking.listAppointments(tenant, from, to);
  }

  @Get('appointments/:id')
  @RequirePermissions('booking.view')
  appointment(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.booking.getAppointment(tenant, id);
  }

  @Get('customers/:id/appointments')
  @RequirePermissions('booking.view')
  customerAppointments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.booking.getCustomerAppointments(tenant, id);
  }

  @Get('availability')
  @RequirePermissions('booking.view')
  availability(
    @CurrentTenant() tenant: TenantContext,
    @Query('date') date: string,
    @Query('serviceId') serviceId: string,
    @Query('staffId') staffId: string,
  ) {
    return this.booking.availability(
      tenant.companyId,
      date,
      serviceId,
      staffId,
    );
  }

  @Post('appointments')
  @RequirePermissions('booking.create')
  createAppointment(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.booking.createAppointment(
      tenant.companyId,
      dto,
      BookingAppointmentSource.ADMIN,
    );
  }

  @Patch('appointments/:id')
  @RequirePermissions('booking.update')
  updateAppointment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.booking.updateAppointment(tenant, id, dto);
  }

  @Post('appointments/:id/cancel')
  @RequirePermissions('booking.update')
  cancelAppointment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.booking.cancelAppointment(tenant, id);
  }

  @Get('push/vapid')
  @RequirePermissions('booking.view')
  pushVapid() {
    return {
      configured: this.push.isConfigured(),
      publicKey: this.push.publicKey(),
    };
  }

  @Post('push/subscribe')
  @RequirePermissions('booking.view')
  subscribePush(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    },
    @Headers('user-agent') userAgent?: string,
  ) {
    const endpoint = body.endpoint?.trim() ?? '';
    const p256dh = body.keys?.p256dh?.trim() ?? '';
    const auth = body.keys?.auth?.trim() ?? '';
    if (!endpoint || !p256dh || !auth) {
      return { ok: false };
    }
    return this.push.saveDevice({
      companyId: tenant.companyId,
      userId: tenant.userId,
      endpoint,
      p256dh,
      auth,
      userAgent,
    });
  }

  @Delete('push/subscribe')
  @RequirePermissions('booking.view')
  unsubscribePush(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { endpoint?: string },
  ) {
    const endpoint = body.endpoint?.trim() ?? '';
    if (!endpoint) return { ok: false };
    return this.push.removeDevice(tenant.companyId, endpoint);
  }

  @Post('appointments/:id/reschedule')
  @RequirePermissions('booking.update')
  rescheduleAppointment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    if (!dto.date || !dto.time) {
      return this.booking.updateAppointment(tenant, id, dto);
    }
    return this.booking.rescheduleAppointment(tenant, id, {
      date: dto.date,
      time: dto.time,
      staffId: dto.staffId,
      serviceId: dto.serviceId,
    });
  }
}
