import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export type BookingPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

@Injectable()
export class BookingPushService {
  private readonly log = new Logger(BookingPushService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.publicKey() && this.privateKey());
  }

  publicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() ?? '';
  }

  private privateKey(): string {
    return this.config.get<string>('VAPID_PRIVATE_KEY')?.trim() ?? '';
  }

  private applyVapid(): boolean {
    const pub = this.publicKey();
    const priv = this.privateKey();
    if (!pub || !priv) return false;
    const subject =
      this.config.get<string>('VAPID_SUBJECT')?.trim() ||
      'mailto:arteagaestacio@gmail.com';
    webpush.setVapidDetails(subject, pub, priv);
    return true;
  }

  async saveDevice(opts: {
    companyId: string;
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  }) {
    await this.prisma.bookingPushDevice.upsert({
      where: { endpoint: opts.endpoint },
      create: {
        companyId: opts.companyId,
        userId: opts.userId,
        endpoint: opts.endpoint,
        p256dh: opts.p256dh,
        auth: opts.auth,
        userAgent: opts.userAgent?.slice(0, 240) ?? '',
      },
      update: {
        companyId: opts.companyId,
        userId: opts.userId,
        p256dh: opts.p256dh,
        auth: opts.auth,
        userAgent: opts.userAgent?.slice(0, 240) ?? '',
      },
    });
    return { ok: true };
  }

  async removeDevice(companyId: string, endpoint: string) {
    await this.prisma.bookingPushDevice.deleteMany({
      where: { companyId, endpoint },
    });
    return { ok: true };
  }

  async sendToCompany(companyId: string, payload: BookingPushPayload) {
    if (!this.applyVapid()) {
      this.log.debug('VAPID no configurado: no se envía push');
      return;
    }
    const devices = await this.prisma.bookingPushDevice.findMany({
      where: { companyId },
    });
    if (!devices.length) return;
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      tag: payload.tag ?? 'booking',
    });
    await Promise.all(
      devices.map(async (device) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: device.endpoint,
              keys: { p256dh: device.p256dh, auth: device.auth },
            },
            body,
            { TTL: 60 * 60 * 12 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.bookingPushDevice.delete({
              where: { id: device.id },
            });
            return;
          }
          this.log.warn(
            `push falló (${status ?? 'sin código'}) para ${device.id}`,
          );
        }
      }),
    );
  }
}
