import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { TenantGuard } from '../tenant/tenant.guard';
import type { TenantContext } from '../tenant/tenant.types';
import { BusinessAssistantService } from './business-assistant.service';
import { AskAssistantDto } from './dto/ask-assistant.dto';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: BusinessAssistantService) {}

  @Post('ask')
  async ask(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: AskAssistantDto,
  ) {
    const answer = await this.assistant.answer(
      dto.question,
      tenant.companyId,
      dto.history,
    );
    return { answer };
  }
}
