import { Global, Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { BusinessAssistantService } from './business-assistant.service';
import { BusinessInsightsService } from './business-insights.service';
import { LandingAssistantController } from './landing-assistant.controller';
import { LandingAssistantService } from './landing-assistant.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramService } from './telegram.service';

@Global()
@Module({
  controllers: [AssistantController, LandingAssistantController],
  providers: [
    TelegramService,
    BusinessInsightsService,
    BusinessAssistantService,
    LandingAssistantService,
    TelegramBotService,
  ],
  exports: [
    TelegramService,
    BusinessInsightsService,
    BusinessAssistantService,
    LandingAssistantService,
  ],
})
export class TelegramModule {}
