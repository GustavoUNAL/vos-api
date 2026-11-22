import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.types';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { TenantGuard } from '../tenant/tenant.guard';
import type { TenantContext } from '../tenant/tenant.types';
import {
  AskVicenteDto,
  UpsertMoneyBudgetDto,
  UpsertPersonalCalendarDto,
  UpsertPersonalIdeaDto,
  UpsertPersonalMoneyDto,
  UpsertWellnessDto,
} from './dto/personal.dto';
import { PlatformPersonalService } from './platform-personal.service';
import { VicenteService } from './vicente.service';

/**
 * Vida personal (Main): finanzas, notas/ideas, bienestar, Vicente.
 * Persistente en Neon; migrate deploy no borra datos.
 */
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('personal')
export class PlatformPersonalController {
  constructor(
    private readonly personal: PlatformPersonalService,
    private readonly vicente: VicenteService,
  ) {}

  @Get('overview')
  overview(@CurrentTenant() tenant: TenantContext) {
    return this.personal.overview(tenant);
  }

  @Get('money')
  listMoney(
    @CurrentTenant() tenant: TenantContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.personal.listMoney(tenant, { from, to });
  }

  @Post('money')
  createMoney(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertPersonalMoneyDto,
  ) {
    return this.personal.createMoney(tenant, dto);
  }

  @Patch('money/:id')
  updateMoney(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpsertPersonalMoneyDto,
  ) {
    return this.personal.updateMoney(tenant, id, dto);
  }

  @Delete('money/:id')
  removeMoney(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.personal.removeMoney(tenant, id);
  }

  @Get('money/budgets')
  listBudgets(
    @CurrentTenant() tenant: TenantContext,
    @Query('month') month?: string,
  ) {
    return this.personal.listBudgets(tenant, month);
  }

  @Put('money/budgets')
  upsertBudget(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertMoneyBudgetDto,
  ) {
    return this.personal.upsertBudget(tenant, dto);
  }

  @Get('calendar')
  listCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.personal.listCalendar(tenant, { from, to });
  }

  @Post('calendar')
  createCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertPersonalCalendarDto,
  ) {
    return this.personal.createCalendar(tenant, dto);
  }

  @Patch('calendar/:id')
  updateCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpsertPersonalCalendarDto,
  ) {
    return this.personal.updateCalendar(tenant, id, dto);
  }

  @Delete('calendar/:id')
  removeCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.personal.removeCalendar(tenant, id);
  }

  @Get('ideas')
  listIdeas(@CurrentTenant() tenant: TenantContext) {
    return this.personal.listIdeas(tenant);
  }

  @Post('ideas')
  createIdea(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertPersonalIdeaDto,
  ) {
    return this.personal.createIdea(tenant, dto);
  }

  @Patch('ideas/:id')
  updateIdea(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpsertPersonalIdeaDto,
  ) {
    return this.personal.updateIdea(tenant, id, dto);
  }

  @Delete('ideas/:id')
  removeIdea(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.personal.removeIdea(tenant, id);
  }

  @Get('wellness')
  listWellness(@CurrentTenant() tenant: TenantContext) {
    return this.personal.listWellness(tenant);
  }

  @Put('wellness')
  upsertWellness(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpsertWellnessDto,
  ) {
    return this.personal.upsertWellness(tenant, dto);
  }

  @Get('vicente/history')
  vicenteHistory(@CurrentTenant() tenant: TenantContext) {
    return this.vicente.history(tenant);
  }

  @Post('vicente/ask')
  vicenteAsk(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AskVicenteDto,
  ) {
    return this.vicente.ask(tenant, dto.question, user.name);
  }

  @Delete('vicente/history')
  clearVicente(@CurrentTenant() tenant: TenantContext) {
    return this.vicente.clear(tenant);
  }
}
