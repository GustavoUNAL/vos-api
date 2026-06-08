import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { PlatformRecipesService } from './platform-recipes.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('recipes')
export class PlatformRecipesController {
  constructor(private readonly platformRecipesService: PlatformRecipesService) {}

  @Get('costs')
  @RequirePermissions('products.view')
  costs(@CurrentTenant() tenant: TenantContext) {
    return this.platformRecipesService.listRecipeCosts(tenant.companyId);
  }

  @Get()
  @RequirePermissions('products.view')
  catalog(
    @CurrentTenant() tenant: TenantContext,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.platformRecipesService.listCatalog(
      tenant.companyId,
      categoryId,
    );
  }
}
