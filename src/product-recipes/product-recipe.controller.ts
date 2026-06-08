import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import {
  UpdateRecipeAdminDto,
  UpsertRecipeDto,
} from './dto/upsert-recipe.dto';
import { ProductRecipeService } from './product-recipe.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('products/:productId/recipe')
export class ProductRecipeController {
  constructor(private readonly productRecipeService: ProductRecipeService) {}

  @Get()
  @RequirePermissions('products.view')
  getRecipe(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
  ) {
    return this.productRecipeService.getRecipe(tenant, productId);
  }

  @Put()
  @RequirePermissions('products.update')
  upsertRecipe(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Body() dto: UpsertRecipeDto,
  ) {
    return this.productRecipeService.upsertRecipe(tenant, productId, dto);
  }

  @Get('cost-controls')
  @RequirePermissions('products.view')
  costControls(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
  ) {
    return this.productRecipeService.getCostControls(tenant, productId);
  }

  @Put('admin')
  @RequirePermissions('products.update')
  updateAdmin(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Body() dto: UpdateRecipeAdminDto,
  ) {
    return this.productRecipeService.updateAdminRate(tenant, productId, dto);
  }
}
