import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessAssistantService } from './business-assistant.service';
import { TelegramService } from './telegram.service';

type TgUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    from?: { first_name?: string };
  };
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private running = false;
  private offset = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramService,
    private readonly assistant: BusinessAssistantService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('TELEGRAM_BOT_ENABLED') === 'false') return;
    if (!this.telegram.isConfigured()) return;
    this.running = true;
    void this.pollLoop();
    this.logger.log('Bot Telegram en polling (preguntas de negocio).');
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.logger.error(`Telegram poll: ${(err as Error).message}`);
        await this.sleep(5000);
      }
    }
  }

  private async pollOnce(): Promise<void> {
    const token = this.telegram.getBotToken();
    if (!token) return;

    const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
    url.searchParams.set('offset', String(this.offset));
    url.searchParams.set('timeout', '25');

    const res = await fetch(url);
    if (!res.ok) {
      await this.sleep(3000);
      return;
    }
    const data = (await res.json()) as {
      ok: boolean;
      result: TgUpdate[];
    };
    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      this.offset = update.update_id + 1;
      const msg = update.message;
      if (!msg?.text) continue;
      await this.handleMessage(String(msg.chat.id), msg.text, msg.from?.first_name);
    }
  }

  private async handleMessage(
    chatId: string,
    text: string,
    firstName?: string,
  ): Promise<void> {
    const n = normalize(text);

    this.telegram.rememberAdminChatId(chatId);

    if (n === '/start' || n.startsWith('/start ')) {
      const name = firstName ? `, ${firstName}` : '';
      await this.telegram.sendMessage(
        chatId,
        [
          `¡Hola${name}! Soy el asistente de VOS AI.`,
          '',
          'Preguntame cosas como:',
          '• ¿Cómo va el negocio hoy?',
          '• ¿Qué debo comprar?',
          '• ¿Cuál fue la utilidad del mes?',
          '• ¿Qué producto deja más dinero?',
          '• ¿Qué clientes no han regresado?',
          '',
          `Tu chat ID: ${chatId}`,
          'Agregá TELEGRAM_ADMIN_CHAT_ID en .env con ese número para recibir comprobantes.',
        ].join('\n'),
      );
      return;
    }

    if (n === '/help' || n === '/ayuda') {
      await this.telegram.sendMessage(
        chatId,
        'Comandos: /start · /help\nO escribe una pregunta en español sobre ventas, inventario o clientes.',
      );
      return;
    }

    const reply = await this.assistant.answer(text);
    await this.telegram.sendMessage(chatId, reply);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
