import { Global, Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { BusinessAssistantService } from './business-assistant.service';
import { BusinessInsightsService } from './business-insights.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramService } from './telegram.service';

@Global()
@Module({
  controllers: [AssistantController],
  providers: [
    TelegramService,
    BusinessInsightsService,
    BusinessAssistantService,
    TelegramBotService,
  ],
  exports: [TelegramService, BusinessInsightsService, BusinessAssistantService],
})
export class TelegramModule {}
