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
import { SaleSource } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import {
  CreateSaleDto,
  ReplaceSaleLinesDto,
  UpdateSaleDto,
} from './dto/sale.dto';
import { PlatformSalesService } from './platform-sales.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('sales')
export class PlatformSalesController {
  constructor(private readonly platformSalesService: PlatformSalesService) {}

  @Post()
  @RequirePermissions('sales.create')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateSaleDto) {
    return this.platformSalesService.create(tenant, dto);
  }

  @Get('meta/payment-methods')
  @RequirePermissions('sales.view')
  paymentMethodsMeta(@CurrentTenant() tenant: TenantContext) {
    return this.platformSalesService.listPaymentMethodsMeta(tenant);
  }

  @Get('calendar')
  @RequirePermissions('sales.view')
  calendar(
    @CurrentTenant() tenant: TenantContext,
    @Query('year', new DefaultValuePipe(new Date().getUTCFullYear()), ParseIntPipe)
    year: number,
    @Query('month', new DefaultValuePipe(new Date().getUTCMonth() + 1), ParseIntPipe)
    month: number,
  ) {
    return this.platformSalesService.getCalendar(tenant, year, month);
  }

  @Get()
  @RequirePermissions('sales.view')
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('source') sourceRaw?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    let source: SaleSource | undefined;
    if (
      sourceRaw &&
      (Object.values(SaleSource) as string[]).includes(sourceRaw)
    ) {
      source = sourceRaw as SaleSource;
    }
    return this.platformSalesService.findAll(tenant, {
      page,
      limit,
      search,
      source,
      dateFrom,
      dateTo,
    });
  }

  @Put(':id/lines')
  @RequirePermissions('sales.update')
  replaceLines(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: ReplaceSaleLinesDto,
  ) {
    return this.platformSalesService.replaceLines(tenant, id, dto);
  }

  @Patch(':id')
  @RequirePermissions('sales.update')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
  ) {
    return this.platformSalesService.update(tenant, id, dto);
  }

  @Get(':id')
  @RequirePermissions('sales.view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.platformSalesService.findOne(tenant, id);
  }
}
