import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim() &&
        this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim(),
    );
  }

  /** Normaliza celular colombiano a formato internacional sin + (573001234567). */
  normalizeColombiaPhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    if (!digits.length) return null;
    if (digits.startsWith('57') && digits.length === 12) return digits;
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    if (digits.length === 11 && digits.startsWith('03')) return `57${digits.slice(1)}`;
    return null;
  }

  async sendText(toE164: string, body: string): Promise<void> {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim();
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim();
    if (!token || !phoneId) {
      throw new Error(
        'WhatsApp no configurado. Defina WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID.',
      );
    }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toE164,
          type: 'text',
          text: { preview_url: false, body },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`WhatsApp API ${res.status}: ${detail}`);
    }
  }

  async sendSaleReceipt(rawPhone: string, message: string): Promise<boolean> {
    const to = this.normalizeColombiaPhone(rawPhone);
    if (!to) {
      this.logger.warn(`Celular inválido para WhatsApp: ${rawPhone}`);
      return false;
    }
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp no configurado; omitiendo envío.');
      return false;
    }
    try {
      await this.sendText(to, message);
      return true;
    } catch (err) {
      this.logger.error(
        `Error enviando WhatsApp a ${to}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
