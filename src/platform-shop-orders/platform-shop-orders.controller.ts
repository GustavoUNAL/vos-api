import {
  Body,
  Controller,
  Get,
  Param,
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
import {
  CollectShopOrderPaymentDto,
  ListShopOrdersQueryDto,
  UpdateShopOrderStatusDto,
} from './dto/shop-order.dto';
import { PlatformShopOrdersService } from './platform-shop-orders.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('shop-orders')
export class PlatformShopOrdersController {
  constructor(private readonly shopOrders: PlatformShopOrdersService) {}

  @Get()
  @RequirePermissions('sales.view')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListShopOrdersQueryDto,
  ) {
    return this.shopOrders.list(tenant, query.status);
  }

  @Patch(':id/status')
  @RequirePermissions('sales.update')
  updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateShopOrderStatusDto,
  ) {
    return this.shopOrders.updateStatus(tenant, id, dto.status);
  }

  @Post(':id/collect-payment')
  @RequirePermissions('sales.create')
  collectPayment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: CollectShopOrderPaymentDto,
  ) {
    return this.shopOrders.collectPayment(tenant, id, dto);
  }
}
