import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { PlatformCashCloseService } from './platform-cash-close.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('cash-close')
export class PlatformCashCloseController {
  constructor(private readonly cashClose: PlatformCashCloseService) {}

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
}
