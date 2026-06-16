import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { UpsertCashCloseDto } from './dto/cash-close.dto';
import { PlatformCashCloseService } from './platform-cash-close.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('cash-close')
export class PlatformCashCloseController {
  constructor(private readonly cashClose: PlatformCashCloseService) {}

  @Get('calendar')
  @RequirePermissions('sales.view')
  calendar(
    @CurrentTenant() tenant: TenantContext,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = Number(year);
    const m = Number(month);
    const now = new Date();
    return this.cashClose.getCalendar(
      tenant,
      Number.isFinite(y) ? y : now.getFullYear(),
      Number.isFinite(m) ? m : now.getMonth() + 1,
    );
  }

  @Get('daily')
  @RequirePermissions('sales.view')
  daily(
    @CurrentTenant() tenant: TenantContext,
    @Query('date') date?: string,
  ) {
    const dateKey =
      date?.trim() ||
      new Date().toISOString().slice(0, 10);
    return this.cashClose.getDailyClose(tenant, dateKey);
  }

  @Put(':date')
  @RequirePermissions('sales.view')
  upsert(
    @CurrentTenant() tenant: TenantContext,
    @Param('date') date: string,
    @Body() dto: UpsertCashCloseDto,
  ) {
    return this.cashClose.upsertRecord(tenant, date.trim(), dto);
  }

  @Post(':date/finalize')
  @RequirePermissions('sales.view')
  finalize(
    @CurrentTenant() tenant: TenantContext,
    @Param('date') date: string,
  ) {
    return this.cashClose.finalizeRecord(tenant, date.trim());
  }
}
