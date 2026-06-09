import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { UpdateShopSettingsDto } from './dto/update-shop-settings.dto';
import { PlatformShopSettingsService } from './platform-shop-settings.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('shop-settings')
export class PlatformShopSettingsController {
  constructor(private readonly shopSettings: PlatformShopSettingsService) {}

  @Get()
  @RequirePermissions('sales.view')
  getSettings(@CurrentTenant() tenant: TenantContext) {
    return this.shopSettings.getSettings(tenant);
  }

  @Patch()
  @RequirePermissions('sales.update')
  updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateShopSettingsDto,
  ) {
    return this.shopSettings.updateSettings(tenant, dto);
  }
}
