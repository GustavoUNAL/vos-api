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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequirePermissions('products.create')
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(tenant, dto);
  }

  @Get()
  @RequirePermissions('products.view')
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('active') activeRaw?: string,
    @Query('type') type?: string,
    @Query('sort') sort?: 'name' | 'price_asc' | 'price_desc',
  ) {
    let active: boolean | undefined;
    if (activeRaw === 'true') active = true;
    else if (activeRaw === 'false') active = false;

    return this.productsService.findAll(tenant, {
      page,
      limit,
      search,
      categoryId,
      active,
      type,
      sort: sort ?? 'name',
    });
  }

  @Get(':id')
  @RequirePermissions('products.view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.productsService.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions('products.update')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products.delete')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.productsService.remove(tenant, id);
  }
}
