import {
  Body,
  Controller,
  Delete,
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
import { PlatformDentalService } from './platform-dental.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('dental')
export class PlatformDentalController {
  constructor(private readonly dental: PlatformDentalService) {}

  @Get('overview')
  @RequirePermissions('dental.view')
  overview(@CurrentTenant() tenant: TenantContext) {
    return this.dental.overview(tenant);
  }

  @Get('sites')
  @RequirePermissions('dental.view')
  sites(@CurrentTenant() tenant: TenantContext) {
    return this.dental.listSites(tenant);
  }

  @Post('sites/ensure-default')
  @RequirePermissions('dental.create')
  ensureSite(@CurrentTenant() tenant: TenantContext) {
    return this.dental.ensureDefaultSite(tenant);
  }

  @Get('patients')
  @RequirePermissions('dental.view')
  patients(@CurrentTenant() tenant: TenantContext, @Query('q') q?: string) {
    return this.dental.listPatients(tenant, q);
  }

  @Get('patients/:id')
  @RequirePermissions('dental.view')
  patient(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.dental.getPatient(tenant, id);
  }

  @Post('patients')
  @RequirePermissions('dental.create')
  createPatient(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, string>,
  ) {
    return this.dental.createPatient(tenant, body as never);
  }

  @Patch('patients/:id')
  @RequirePermissions('dental.update')
  updatePatient(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.updatePatient(tenant, id, body);
  }

  @Delete('patients/:id')
  @RequirePermissions('dental.delete')
  deletePatient(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.dental.deletePatient(tenant, id);
  }

  @Get('appointments')
  @RequirePermissions('dental.view')
  appointments(
    @CurrentTenant() tenant: TenantContext,
    @Query('date') date?: string,
  ) {
    return this.dental.listAppointments(tenant, date);
  }

  @Post('appointments')
  @RequirePermissions('dental.create')
  createAppointment(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.createAppointment(tenant, body as never);
  }

  @Patch('appointments/:id')
  @RequirePermissions('dental.update')
  updateAppointment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.updateAppointment(tenant, id, body);
  }

  @Delete('appointments/:id')
  @RequirePermissions('dental.delete')
  deleteAppointment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.dental.deleteAppointment(tenant, id);
  }

  @Get('incomes')
  @RequirePermissions('dental.view')
  incomes(@CurrentTenant() tenant: TenantContext, @Query('q') q?: string) {
    return this.dental.listIncomes(tenant, q);
  }

  @Post('incomes')
  @RequirePermissions('dental.create')
  createIncome(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.createIncome(tenant, body as never);
  }

  @Delete('incomes/:id')
  @RequirePermissions('dental.delete')
  deleteIncome(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.dental.deleteIncome(tenant, id);
  }

  @Get('expenses')
  @RequirePermissions('dental.view')
  expenses(@CurrentTenant() tenant: TenantContext, @Query('q') q?: string) {
    return this.dental.listExpenses(tenant, q);
  }

  @Post('expenses')
  @RequirePermissions('dental.create')
  createExpense(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.createExpense(tenant, body as never);
  }

  @Delete('expenses/:id')
  @RequirePermissions('dental.delete')
  deleteExpense(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.dental.deleteExpense(tenant, id);
  }

  @Get('sterilizations')
  @RequirePermissions('dental.view')
  sterilizations(@CurrentTenant() tenant: TenantContext) {
    return this.dental.listSterilizations(tenant);
  }

  @Post('sterilizations')
  @RequirePermissions('dental.create')
  createSterilization(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, string>,
  ) {
    return this.dental.createSterilization(tenant, body as never);
  }

  @Get('wastes')
  @RequirePermissions('dental.view')
  wastes(@CurrentTenant() tenant: TenantContext, @Query('q') q?: string) {
    return this.dental.listWastes(tenant, q);
  }

  @Post('wastes')
  @RequirePermissions('dental.create')
  createWaste(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.createWaste(tenant, body as never);
  }

  @Get('temp-humidity')
  @RequirePermissions('dental.view')
  tempLogs(
    @CurrentTenant() tenant: TenantContext,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.dental.listTempLogs(tenant, {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      siteId,
    });
  }

  @Post('temp-humidity')
  @RequirePermissions('dental.create')
  createTempLog(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.createTempLog(tenant, body as never);
  }

  @Post('appointments/:id/charge')
  @RequirePermissions('dental.create')
  chargeAppointment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.chargeAppointment(tenant, id, body as never);
  }

  @Get('procedures')
  @RequirePermissions('dental.view')
  procedures(@CurrentTenant() tenant: TenantContext) {
    return this.dental.listProcedures(tenant);
  }

  @Post('procedures/ensure-defaults')
  @RequirePermissions('dental.create')
  ensureProcedures(@CurrentTenant() tenant: TenantContext) {
    return this.dental.ensureDefaultProcedures(tenant);
  }

  @Post('procedures')
  @RequirePermissions('dental.create')
  createProcedure(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.createProcedure(tenant, body as never);
  }

  @Get('budgets')
  @RequirePermissions('dental.view')
  budgets(
    @CurrentTenant() tenant: TenantContext,
    @Query('patientId') patientId?: string,
  ) {
    return this.dental.listBudgets(tenant, patientId);
  }

  @Post('budgets')
  @RequirePermissions('dental.create')
  createBudget(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.createBudget(tenant, body as never);
  }

  @Post('budgets/:id/approve')
  @RequirePermissions('dental.update')
  approveBudget(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.dental.approveBudget(tenant, id);
  }

  @Get('financings')
  @RequirePermissions('dental.view')
  financings(@CurrentTenant() tenant: TenantContext) {
    return this.dental.listFinancings(tenant);
  }

  @Post('financings')
  @RequirePermissions('dental.create')
  createFinancing(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dental.createFinancing(tenant, body as never);
  }

  @Patch('financings/:id/status')
  @RequirePermissions('dental.update')
  updateFinancingStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    return this.dental.updateFinancingStatus(tenant, id, body.status || 'en_tramite');
  }

  @Get('costs-summary')
  @RequirePermissions('dental.view')
  costsSummary(@CurrentTenant() tenant: TenantContext) {
    return this.dental.costsSummary(tenant);
  }
}
