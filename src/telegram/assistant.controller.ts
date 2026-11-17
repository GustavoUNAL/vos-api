import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.types';
import { BusinessAssistantService } from './business-assistant.service';
import { AskAssistantDto } from './dto/ask-assistant.dto';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: BusinessAssistantService) {}

  @Post('ask')
  @RequirePermissions('sales.view', 'finance.view', 'products.view')
  async ask(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AskAssistantDto,
  ) {
    const answer = await this.assistant.answer(
      dto.question,
      tenant.companyId,
      dto.history,
      user.name,
    );
    return { answer };
  }
}
