import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AskAssistantDto,
} from './dto/ask-assistant.dto';
import { LandingAssistantService } from './landing-assistant.service';

@Controller('public/landing')
export class LandingAssistantController {
  constructor(private readonly landing: LandingAssistantService) {}

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('ask')
  async ask(@Body() dto: AskAssistantDto) {
    return this.landing.answer(dto.question, dto.history);
  }
}
