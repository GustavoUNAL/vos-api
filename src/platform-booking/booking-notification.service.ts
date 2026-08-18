import { Injectable, Logger } from '@nestjs/common';

export type BookingNotifyKind = 'confirmed' | 'cancelled' | 'rescheduled';

/** Abstracción lista para WhatsApp / email / SMS. El MVP no envía mensajes. */
@Injectable()
export class BookingNotificationService {
  private readonly log = new Logger(BookingNotificationService.name);

  async notify(kind: BookingNotifyKind, payload: unknown): Promise<void> {
    this.log.debug(`booking.notify ${kind}`);
    void payload;
  }
}
