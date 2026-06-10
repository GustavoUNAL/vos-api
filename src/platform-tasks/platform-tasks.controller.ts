import {
  Body,
  Controller,
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
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { PlatformTasksService } from './platform-tasks.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('tasks')
export class PlatformTasksController {
  constructor(private readonly tasksService: PlatformTasksService) {}

  @Get('calendar')
  @RequirePermissions('tasks.view')
  calendar(
    @CurrentTenant() tenant: TenantContext,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.tasksService.getCalendar(tenant, year, month);
  }

  @Get()
  @RequirePermissions('tasks.view')
  listByDate(
    @CurrentTenant() tenant: TenantContext,
    @Query('date') date: string,
  ) {
    return this.tasksService.listByDate(tenant, date);
  }

  @Post()
  @RequirePermissions('tasks.create')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(tenant, dto);
  }

  @Patch(':id')
  @RequirePermissions('tasks.update')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tasks.delete')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.tasksService.remove(tenant, id);
  }
}
