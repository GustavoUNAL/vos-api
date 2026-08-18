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
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { PlatformProjectsService } from './platform-projects.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('projects')
export class PlatformProjectsController {
  constructor(private readonly projects: PlatformProjectsService) {}

  @Get()
  @RequirePermissions('projects.view')
  list(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string) {
    return this.projects.list(tenant, status);
  }

  @Post()
  @RequirePermissions('projects.create')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateProjectDto) {
    return this.projects.create(tenant, dto);
  }

  @Patch(':id')
  @RequirePermissions('projects.update')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('projects.delete')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.projects.remove(tenant, id);
  }
}
