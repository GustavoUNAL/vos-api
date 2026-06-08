import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { PlatformInventoryService } from './platform-inventory.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('inventory')
export class PlatformInventoryController {
  constructor(
    private readonly platformInventoryService: PlatformInventoryService,
  ) {}

  @Get()
  @RequirePermissions('products.view')
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.platformInventoryService.findAll(tenant, {
      page,
      limit,
      search,
      categoryId,
    });
  }
}
