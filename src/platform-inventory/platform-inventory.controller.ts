import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { PlatformInventoryService } from './platform-inventory.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('inventory')
export class PlatformInventoryController {
  constructor(
    private readonly platformInventoryService: PlatformInventoryService,
  ) {}

  @Get('categories')
  @RequirePermissions('inventory.view')
  listCategories(@CurrentTenant() tenant: TenantContext) {
    return this.platformInventoryService.listCategories(tenant);
  }

  @Get()
  @RequirePermissions('inventory.view')
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('lot') lot?: string,
    @Query('availability') availability?: 'available' | 'depleted',
    @Query('belowMinimum') belowMinimumRaw?: string,
    @Query('includeStats') includeStatsRaw?: string,
  ) {
    const belowMinimum = ['1', 'true', 'yes'].includes(
      belowMinimumRaw?.trim().toLowerCase() ?? '',
    );
    const includeStats = ['1', 'true', 'yes'].includes(
      includeStatsRaw?.trim().toLowerCase() ?? '',
    );

    return this.platformInventoryService.findAll(tenant, {
      page,
      limit,
      search,
      categoryId,
      lot,
      availability:
        availability === 'available' || availability === 'depleted'
          ? availability
          : undefined,
      belowMinimum,
      includeStats,
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.view')
  findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query('includeStats') includeStatsRaw?: string,
  ) {
    const includeStats = ['1', 'true', 'yes'].includes(
      includeStatsRaw?.trim().toLowerCase() ?? '',
    );
    return this.platformInventoryService.findOne(tenant, id, includeStats);
  }

  @Post()
  @RequirePermissions('inventory.create')
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.platformInventoryService.create(tenant, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory.update')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.platformInventoryService.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('inventory.delete')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.platformInventoryService.remove(tenant, id);
  }
}
