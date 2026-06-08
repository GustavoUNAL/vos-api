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
import { StaffShiftStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import {
  CreateStaffMemberDto,
  UpdateStaffMemberDto,
} from './dto/staff-member.dto';
import {
  CreateStaffShiftDto,
  UpdateStaffShiftDto,
} from './dto/staff-shift.dto';
import { PlatformStaffService } from './platform-staff.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller()
export class PlatformStaffController {
  constructor(private readonly staffService: PlatformStaffService) {}

  @Get('staff/summary')
  @RequirePermissions('staff.view')
  summary(
    @CurrentTenant() tenant: TenantContext,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.staffService.summary(tenant, dateFrom, dateTo);
  }

  @Get('staff')
  @RequirePermissions('staff.view')
  listMembers(
    @CurrentTenant() tenant: TenantContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('active') activeRaw?: string,
  ) {
    let active: boolean | undefined;
    if (activeRaw === 'true') active = true;
    else if (activeRaw === 'false') active = false;
    return this.staffService.listMembers(tenant, { page, limit, search, active });
  }

  @Post('staff')
  @RequirePermissions('staff.create')
  createMember(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateStaffMemberDto,
  ) {
    return this.staffService.createMember(tenant, dto);
  }

  @Get('staff/:id')
  @RequirePermissions('staff.view')
  findMember(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.staffService.findMember(tenant, id);
  }

  @Patch('staff/:id')
  @RequirePermissions('staff.update')
  updateMember(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateStaffMemberDto,
  ) {
    return this.staffService.updateMember(tenant, id, dto);
  }

  @Delete('staff/:id')
  @RequirePermissions('staff.delete')
  removeMember(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.staffService.removeMember(tenant, id);
  }

  @Get('staff-shifts')
  @RequirePermissions('staff.view')
  listShifts(
    @CurrentTenant() tenant: TenantContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('staffMemberId') staffMemberId?: string,
    @Query('status') statusRaw?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    let status: StaffShiftStatus | undefined;
    if (
      statusRaw &&
      (Object.values(StaffShiftStatus) as string[]).includes(statusRaw)
    ) {
      status = statusRaw as StaffShiftStatus;
    }
    return this.staffService.listShifts(tenant, {
      page,
      limit,
      staffMemberId,
      status,
      dateFrom,
      dateTo,
    });
  }

  @Post('staff-shifts')
  @RequirePermissions('staff.create')
  createShift(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateStaffShiftDto,
  ) {
    return this.staffService.createShift(tenant, dto);
  }

  @Get('staff-shifts/:id')
  @RequirePermissions('staff.view')
  findShift(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.staffService.findShift(tenant, id);
  }

  @Patch('staff-shifts/:id')
  @RequirePermissions('staff.update')
  updateShift(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateStaffShiftDto,
  ) {
    return this.staffService.updateShift(tenant, id, dto);
  }

  @Delete('staff-shifts/:id')
  @RequirePermissions('staff.delete')
  removeShift(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.staffService.removeShift(tenant, id);
  }
}
