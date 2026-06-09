import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminService } from './platform-admin.service';

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformAdminController {
  constructor(private readonly platform: PlatformAdminService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('companies')
  companies() {
    return this.platform.listCompanies();
  }

  @Get('companies/:id')
  async company(@Param('id') id: string) {
    const detail = await this.platform.companyDetail(id);
    if (!detail) throw new NotFoundException('Empresa no encontrada');
    return detail;
  }

  @Get('users')
  users() {
    return this.platform.listUsers();
  }

  @Get('access-requests')
  accessRequests(@Query('status') status?: string) {
    return this.platform.listAccessRequests(status);
  }
}
