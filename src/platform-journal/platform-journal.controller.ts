import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { TenantGuard } from '../tenant/tenant.guard';
import type { TenantContext } from '../tenant/tenant.types';
import { UpsertJournalDto } from './dto/journal.dto';
import { PlatformJournalService } from './platform-journal.service';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('journal')
export class PlatformJournalController {
  constructor(private readonly journal: PlatformJournalService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.journal.list(tenant);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertJournalDto) {
    return this.journal.create(tenant, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpsertJournalDto,
  ) {
    return this.journal.update(tenant, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.journal.remove(tenant, id);
  }
}
