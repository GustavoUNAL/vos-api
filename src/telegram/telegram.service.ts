import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseDataUrl } from './parse-data-url';

export type SaleReceiptMeta = {
  saleDate?: Date;
  total?: number;
  code?: string | null;
  companyName?: string;
};

export type SaleCompletionPayload = {
  text: string;
  invoicePdf?: Buffer;
  invoiceFilename?: string;
  receiptImageDataUrl?: string | null;
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private runtimeAdminChatId: string | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getBotToken());
  }

  getBotToken(): string | null {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim() || null;
  }

  getAdminChatId(): string | null {
    const fromEnv = this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID')?.trim();
    return fromEnv || this.runtimeAdminChatId;
  }

  rememberAdminChatId(chatId: string): void {
    this.runtimeAdminChatId = chatId;
  }

  private truncate(text: string, max = 3900): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 20).trimEnd()}\n…(recortado)`;
  }

  private truncateCaption(text: string, max = 1000): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3).trimEnd()}...`;
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    const token = this.getBotToken();
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN no configurado.');
      return false;
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: this.truncate(text),
            disable_web_page_preview: true,
          }),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        this.logger.error(`Telegram sendMessage ${res.status}: ${detail}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Telegram sendMessage error: ${(err as Error).message}`);
      return false;
    }
  }

  private async sendMultipart(
    method: 'sendPhoto' | 'sendDocument',
    chatId: string,
    field: 'photo' | 'document',
    buffer: Buffer,
    filename: string,
    mime: string,
    caption?: string,
  ): Promise<boolean> {
    const token = this.getBotToken();
    if (!token) return false;
    try {
      const form = new FormData();
      form.append('chat_id', chatId);
      if (caption?.trim()) {
        form.append('caption', this.truncateCaption(caption));
      }
      form.append(
        field,
        new Blob([new Uint8Array(buffer)], { type: mime }),
        filename,
      );
      const res = await fetch(
        `https://api.telegram.org/bot${token}/${method}`,
        { method: 'POST', body: form },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        this.logger.error(`Telegram ${method} ${res.status}: ${detail}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Telegram ${method} error: ${(err as Error).message}`);
      return false;
    }
  }

  async sendPhotoBuffer(
    chatId: string,
    buffer: Buffer,
    mime: string,
    filename: string,
    caption?: string,
  ): Promise<boolean> {
    return this.sendMultipart(
      'sendPhoto',
      chatId,
      'photo',
      buffer,
      filename,
      mime,
      caption,
    );
  }

  async sendDocumentBuffer(
    chatId: string,
    buffer: Buffer,
    filename: string,
    mime: string,
    caption?: string,
  ): Promise<boolean> {
    return this.sendMultipart(
      'sendDocument',
      chatId,
      'document',
      buffer,
      filename,
      mime,
      caption,
    );
  }

  async sendSaleCompletion(payload: SaleCompletionPayload): Promise<boolean> {
    const chatId = this.getAdminChatId();
    if (!chatId) {
      this.logger.warn(
        'TELEGRAM_ADMIN_CHAT_ID no configurado. Escribí /start al bot para vincular.',
      );
      return false;
    }

    let sent = false;
    const shortCaption = payload.text.split('\n').slice(0, 4).join('\n');

    if (payload.receiptImageDataUrl?.trim()) {
      const parsed = parseDataUrl(payload.receiptImageDataUrl);
      if (parsed) {
        const ok = await this.sendPhotoBuffer(
          chatId,
          parsed.buffer,
          parsed.mime,
          `comprobante.${parsed.ext}`,
          shortCaption || 'Comprobante de pago',
        );
        sent = ok || sent;
      }
    }

    if (payload.invoicePdf?.length) {
      const ok = await this.sendDocumentBuffer(
        chatId,
        payload.invoicePdf,
        payload.invoiceFilename ?? 'comprobante.pdf',
        'application/pdf',
        payload.receiptImageDataUrl ? undefined : shortCaption || undefined,
      );
      sent = ok || sent;
    }

    const textOk = await this.sendMessage(chatId, payload.text);
    sent = textOk || sent;

    if (sent) this.logger.log(`Telegram venta enviada a chat ${chatId}`);
    return sent;
  }

  async sendInternalNotification(body: string): Promise<boolean> {
    const chatId = this.getAdminChatId();
    if (!chatId) {
      this.logger.warn(
        'TELEGRAM_ADMIN_CHAT_ID no configurado. Escribí /start al bot para vincular.',
      );
      return false;
    }
    const ok = await this.sendMessage(chatId, body);
    if (ok) this.logger.log(`Telegram interno enviado a chat ${chatId}`);
    return ok;
  }

  /** @deprecated Usar sendSaleCompletion */
  async sendSaleReceipt(
    _rawPhone: string | null | undefined,
    message: string,
    meta?: SaleReceiptMeta,
  ): Promise<boolean> {
    const header = [
      meta?.companyName ? meta.companyName : null,
      meta?.code ? `Venta ${meta.code}` : null,
      meta?.total != null
        ? `Total ${meta.total.toLocaleString('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0,
          })}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
    const body = header ? `${header}\n\n${message}` : message;
    return this.sendInternalNotification(body);
  }
}
