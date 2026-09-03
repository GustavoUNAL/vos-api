import { Injectable, Logger } from '@nestjs/common';

export type BookingNotifyKind = 'confirmed' | 'cancelled' | 'rescheduled';

/** Reservado para avisos futuros. En este despliegue no envía nada. */
@Injectable()
export class BookingNotificationService {
  private readonly log = new Logger(BookingNotificationService.name);

  async notify(kind: BookingNotifyKind, _payload: unknown, _companyId?: string): Promise<void> {
    this.log.debug(`booking.notify ${kind}`);
  }
}
