import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import type { AnalyticsGranularity } from './analytics-period';
import { PlatformAnalyticsService } from './platform-analytics.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('analytics')
export class PlatformAnalyticsController {
  constructor(private readonly analyticsService: PlatformAnalyticsService) {}

  @Get('financial')
  @RequirePermissions('finance.view')
  financial(
    @CurrentTenant() tenant: TenantContext,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('granularity') granularity?: AnalyticsGranularity,
  ) {
    return this.analyticsService.getFinancialOverview(tenant, {
      dateFrom,
      dateTo,
      granularity,
    });
  }
}
