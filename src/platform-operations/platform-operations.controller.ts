import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { TenantGuard } from '../tenant/tenant.guard';
import type { TenantContext } from '../tenant/tenant.types';
import { PlatformOperationsService } from './platform-operations.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('operations')
export class PlatformOperationsController {
  constructor(private readonly operations: PlatformOperationsService) {}

  @Get('day')
  @RequirePermissions('sales.view', 'finance.view')
  getDay(@CurrentTenant() tenant: TenantContext, @Query('date') date?: string) {
    return this.operations.getDay(tenant, date);
  }
}
