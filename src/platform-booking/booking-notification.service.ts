import { Injectable, Logger } from '@nestjs/common';
import { BookingPushService } from './booking-push.service';
import type { SchedulingAppointmentDto } from '../scheduling-engine/scheduling-engine.service';

export type BookingNotifyKind = 'confirmed' | 'cancelled' | 'rescheduled';

const TITLES: Record<BookingNotifyKind, string> = {
  confirmed: 'Nueva cita',
  cancelled: 'Cita cancelada',
  rescheduled: 'Cita reprogramada',
};

@Injectable()
export class BookingNotificationService {
  private readonly log = new Logger(BookingNotificationService.name);

  constructor(private readonly push: BookingPushService) {}

  async notify(
    kind: BookingNotifyKind,
    appointment: SchedulingAppointmentDto,
    companyId?: string,
  ): Promise<void> {
    if (!companyId) return;
    const time = appointment.startAt.slice(11, 16);
    const who = appointment.customer?.name?.trim() || 'Cliente';
    const service = appointment.service?.name?.trim() || 'Servicio';
    const body = `${who} · ${service} · ${appointment.date} ${time}`;
    try {
      await this.push.sendToCompany(companyId, {
        title: TITLES[kind],
        body,
        url: '/',
        tag: `booking-${appointment.id}`,
      });
    } catch (err) {
      this.log.warn(
        `No se pudo avisar (${kind}): ${err instanceof Error ? err.message : 'error'}`,
      );
    }
  }
}
