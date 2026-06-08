import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import {
  CreatePurchaseLotDto,
  ReplacePurchaseLotLinesDto,
  UpdatePurchaseLotDto,
} from './dto/purchase-lot.dto';
import { PlatformPurchasesService } from './platform-purchases.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('purchase-lots')
export class PlatformPurchasesController {
  constructor(
    private readonly platformPurchasesService: PlatformPurchasesService,
  ) {}

  @Get('meta/suppliers')
  @RequirePermissions('purchases.view')
  suppliersMeta(@CurrentTenant() tenant: TenantContext) {
    return this.platformPurchasesService.listDistinctSuppliers(tenant);
  }

  @Get('calendar')
  @RequirePermissions('purchases.view')
  calendar(
    @CurrentTenant() tenant: TenantContext,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.platformPurchasesService.getCalendar(tenant, year, month);
  }

  @Post()
  @RequirePermissions('purchases.create')
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreatePurchaseLotDto,
  ) {
    return this.platformPurchasesService.createManual(tenant, dto);
  }

  @Get()
  @RequirePermissions('purchases.view')
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.platformPurchasesService.findAll(tenant, {
      page,
      limit,
      search,
      dateFrom,
      dateTo,
    });
  }

  @Get(':id')
  @RequirePermissions('purchases.view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.platformPurchasesService.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions('purchases.update')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseLotDto,
  ) {
    return this.platformPurchasesService.update(tenant, id, dto);
  }

  @Put(':id/purchase-lines')
  @RequirePermissions('purchases.update')
  replacePurchaseLines(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: ReplacePurchaseLotLinesDto,
  ) {
    return this.platformPurchasesService.replacePurchaseLotLines(
      tenant,
      id,
      dto,
    );
  }
}
