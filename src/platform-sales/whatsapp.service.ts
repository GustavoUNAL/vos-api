import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

export type SaleReceiptMeta = {
  saleDate?: Date;
  total?: number;
  code?: string | null;
  companyName?: string;
};

type WhatsappProvider = 'twilio' | 'meta' | 'none';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private twilioClient: ReturnType<typeof twilio> | null = null;

  constructor(private readonly config: ConfigService) {}

  getProvider(): WhatsappProvider {
    const forced = this.config.get<string>('WHATSAPP_PROVIDER')?.trim().toLowerCase();
    if (forced === 'twilio' || forced === 'meta') return forced;
    if (this.config.get<string>('TWILIO_ACCOUNT_SID')?.trim()) return 'twilio';
    if (this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim()) return 'meta';
    return 'none';
  }

  isConfigured(): boolean {
    const provider = this.getProvider();
    if (provider === 'twilio') {
      return Boolean(
        this.config.get<string>('TWILIO_ACCOUNT_SID')?.trim() &&
          this.config.get<string>('TWILIO_AUTH_TOKEN')?.trim() &&
          this.config.get<string>('TWILIO_WHATSAPP_FROM')?.trim(),
      );
    }
    if (provider === 'meta') {
      return Boolean(
        this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim() &&
          this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim(),
      );
    }
    return false;
  }

  /** Normaliza celular colombiano a E.164 sin + (573001234567). */
  normalizeColombiaPhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    if (!digits.length) return null;
    if (digits.startsWith('57') && digits.length === 12) return digits;
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    if (digits.length === 11 && digits.startsWith('03')) return `57${digits.slice(1)}`;
    return null;
  }

  private toWhatsappAddress(e164Digits: string): string {
    return e164Digits.startsWith('whatsapp:')
      ? e164Digits
      : `whatsapp:+${e164Digits.replace(/^\+/, '')}`;
  }

  private getTwilioClient(): ReturnType<typeof twilio> {
    if (this.twilioClient) return this.twilioClient;
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID')?.trim();
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN')?.trim();
    if (!accountSid || !authToken) {
      throw new Error(
        'Twilio no configurado. Defina TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN.',
      );
    }
    this.twilioClient = twilio(accountSid, authToken);
    return this.twilioClient;
  }

  private formatShortDate(d?: Date): string {
    if (!d) return '';
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(d);
  }

  private formatCop(n?: number): string {
    if (n == null || !Number.isFinite(n)) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(n);
  }

  private truncateBody(body: string, max = 1550): string {
    if (body.length <= max) return body;
    return `${body.slice(0, max - 18).trimEnd()}\n...(recortado)`;
  }

  private buildTwilioContentVariables(
    message: string,
    meta?: SaleReceiptMeta,
  ): Record<string, string> {
    const rawOverride = this.config.get<string>('TWILIO_CONTENT_VARIABLES')?.trim();
    if (rawOverride) {
      try {
        const parsed = JSON.parse(rawOverride) as Record<string, string>;
        return parsed;
      } catch {
        this.logger.warn('TWILIO_CONTENT_VARIABLES inválido; usando valores automáticos.');
      }
    }

    const summary = this.truncateBody(message.replace(/\*/g, ''), 420);
    const vars: Record<string, string> = {
      '1': this.formatShortDate(meta?.saleDate) || meta?.companyName?.slice(0, 40) || 'Venta',
      '2':
        meta?.total != null
          ? `${this.formatCop(meta.total)}${meta.code ? ` · ${meta.code}` : ''}`
          : summary,
    };
    const extraKeys = this.config.get<string>('TWILIO_CONTENT_EXTRA_KEYS')?.trim();
    if (extraKeys?.includes('3')) {
      vars['3'] = summary;
    }
    return vars;
  }

  private async sendViaTwilio(
    toE164: string,
    body: string,
    meta?: SaleReceiptMeta,
  ): Promise<void> {
    const from =
      this.config.get<string>('TWILIO_WHATSAPP_FROM')?.trim() ??
      'whatsapp:+14155238886';
    const contentSid = this.config.get<string>('TWILIO_CONTENT_SID')?.trim();
    const client = this.getTwilioClient();
    const to = this.toWhatsappAddress(toE164);
    const fromAddr = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

    if (contentSid) {
      await client.messages.create({
        from: fromAddr,
        to,
        contentSid,
        contentVariables: JSON.stringify(
          this.buildTwilioContentVariables(body, meta),
        ),
      });
      return;
    }

    await client.messages.create({
      from: fromAddr,
      to,
      body: this.truncateBody(body),
    });
  }

  private async sendViaMeta(toE164: string, body: string): Promise<void> {
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
          text: { preview_url: false, body: this.truncateBody(body) },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`WhatsApp API ${res.status}: ${detail}`);
    }
  }

  async sendText(
    toE164: string,
    body: string,
    meta?: SaleReceiptMeta,
  ): Promise<void> {
    const provider = this.getProvider();
    if (provider === 'twilio') {
      await this.sendViaTwilio(toE164, body, meta);
      return;
    }
    if (provider === 'meta') {
      await this.sendViaMeta(toE164, body);
      return;
    }
    throw new Error(
      'WhatsApp no configurado. Use Twilio (TWILIO_*) o Meta (WHATSAPP_*).',
    );
  }

  async sendInternalNotification(body: string): Promise<boolean> {
    const raw =
      this.config.get<string>('TWILIO_WHATSAPP_INTERNAL_TO')?.trim() ||
      this.config.get<string>('WHATSAPP_INTERNAL_GROUP')?.trim();
    if (!raw) {
      this.logger.warn('Grupo interno WhatsApp no configurado (TWILIO_WHATSAPP_INTERNAL_TO).');
      return false;
    }
    const digits = raw.replace(/\D/g, '');
    if (!digits.length) return false;
    const e164 = digits.startsWith('57') ? digits : `57${digits}`;
    if (!this.isConfigured()) return false;
    try {
      await this.sendText(e164, body);
      return true;
    } catch (err) {
      this.logger.error(
        `Error enviando WhatsApp interno: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async sendSaleReceipt(
    rawPhone: string,
    message: string,
    meta?: SaleReceiptMeta,
  ): Promise<boolean> {
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
      await this.sendText(to, message, meta);
      this.logger.log(
        `WhatsApp enviado (${this.getProvider()}) a +${to}${meta?.code ? ` · ${meta.code}` : ''}`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Error enviando WhatsApp a +${to}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
