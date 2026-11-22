import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { TenantGuard } from '../tenant/tenant.guard';
import type { TenantContext } from '../tenant/tenant.types';
import {
  UpsertPersonalCalendarDto,
  UpsertPersonalMoneyDto,
} from './dto/personal.dto';
import { PlatformPersonalService } from './platform-personal.service';

/**
 * Vida personal (Main): finanzas y calendario.
 * Persisten en Neon; un deploy (`migrate deploy`) no borra estos datos.
 */
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('personal')
export class PlatformPersonalController {
  constructor(private readonly personal: PlatformPersonalService) {}

  @Get('money')
  listMoney(
    @CurrentTenant() tenant: TenantContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.personal.listMoney(tenant, { from, to });
  }

  @Post('money')
  createMoney(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertPersonalMoneyDto,
  ) {
    return this.personal.createMoney(tenant, dto);
  }

  @Patch('money/:id')
  updateMoney(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpsertPersonalMoneyDto,
  ) {
    return this.personal.updateMoney(tenant, id, dto);
  }

  @Delete('money/:id')
  removeMoney(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.personal.removeMoney(tenant, id);
  }

  @Get('calendar')
  listCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.personal.listCalendar(tenant, { from, to });
  }

  @Post('calendar')
  createCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertPersonalCalendarDto,
  ) {
    return this.personal.createCalendar(tenant, dto);
  }

  @Patch('calendar/:id')
  updateCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpsertPersonalCalendarDto,
  ) {
    return this.personal.updateCalendar(tenant, id, dto);
  }

  @Delete('calendar/:id')
  removeCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.personal.removeCalendar(tenant, id);
  }
}
