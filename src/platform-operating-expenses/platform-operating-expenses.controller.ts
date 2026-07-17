import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  UpsertMonthUtilitiesDto,
  UpsertOperatingExpenseDto,
} from './dto/operating-expense.dto';
import { PlatformOperatingExpensesService } from './platform-operating-expenses.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('operating-expenses')
export class PlatformOperatingExpensesController {
  constructor(
    private readonly expensesService: PlatformOperatingExpensesService,
  ) {}

  @Get()
  @RequirePermissions('finance.view')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.expensesService.list(tenant, { dateFrom, dateTo });
  }

  @Get('month')
  @RequirePermissions('finance.view')
  month(
    @CurrentTenant() tenant: TenantContext,
    @Query('expenseMonth') expenseMonth: string,
  ) {
    return this.expensesService.monthSnapshot(
      tenant,
      expenseMonth || new Date().toISOString().slice(0, 7),
    );
  }

  @Put()
  @RequirePermissions('finance.view')
  upsert(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertOperatingExpenseDto,
  ) {
    return this.expensesService.upsert(tenant, dto);
  }

  @Put('utilities')
  @RequirePermissions('finance.view')
  upsertUtilities(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertMonthUtilitiesDto,
  ) {
    return this.expensesService.upsertMonthUtilities(tenant, dto);
  }

  @Delete(':id')
  @RequirePermissions('finance.view')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.expensesService.remove(tenant, id);
  }
}
