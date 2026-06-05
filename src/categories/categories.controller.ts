import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ProductCategoriesService } from '../product-categories/product-categories.service';

/** Alias legacy: GET /categories → categorías de producto del tenant. */
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: ProductCategoriesService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.categories.list(tenant);
  }
}
