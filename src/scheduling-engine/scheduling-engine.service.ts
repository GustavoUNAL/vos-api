import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingAppointmentSource,
  BookingAppointmentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../billing/usage.service';
import { getAvailableSlots } from './scheduling-availability';
import { rangesOverlap } from './scheduling-conflict';
import {
  dayBounds,
  hhmmInTimeZone,
  resolveTimeZone,
  wallToUtc,
  weekdayFromYmd,
  ymdInTimeZone,
} from './scheduling-time';

export type CreateAppointmentInput = {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceId: string;
  staffId: string;
  date: string;
  time: string;
  notes?: string;
  status?: BookingAppointmentStatus;
};

export type UpdateAppointmentInput = {
  date?: string;
  time?: string;
  staffId?: string;
  serviceId?: string;
  status?: BookingAppointmentStatus;
  notes?: string | null;
};

const ACTIVE: BookingAppointmentStatus[] = [
  BookingAppointmentStatus.PENDING,
  BookingAppointmentStatus.CONFIRMED,
  BookingAppointmentStatus.COMPLETED,
];

const apptInclude = {
  customer: true,
  service: true,
  staff: true,
} as const;

export type SchedulingAppointmentDto = {
  id: string;
  startAt: string;
  endAt: string;
  date: string;
  status: BookingAppointmentStatus;
  source: BookingAppointmentSource;
  notes: string | null;
  customer: { id: string; name: string; phone: string; email: string | null };
  service: {
    id: string;
    name: string;
    durationMin: number;
    price: number;
    currency: string;
  };
  staff: { id: string; name: string };
};

/**
 * Scheduling / Appointment Engine.
 * Generic: Organization + Resource + Service + Customer + Appointment.
 * Consumed by Agenda de citas, and later by VOS AI Health and others.
 */
@Injectable()
export class SchedulingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
  ) {}

  private money(v: Prisma.Decimal | number) {
    return Number(typeof v === 'number' ? v : v.toString());
  }

  async timezoneFor(companyId: string): Promise<string> {
    const settings = await this.prisma.bookingSettings.findUnique({
      where: { companyId },
      select: { timezone: true },
    });
    return resolveTimeZone(settings?.timezone);
  }

  formatAppointment(
    row: {
      id: string;
      startAt: Date;
      endAt: Date;
      status: BookingAppointmentStatus;
      source: BookingAppointmentSource;
      notes: string | null;
      customer: {
        id: string;
        name: string;
        phone: string;
        email: string | null;
      };
      service: {
        id: string;
        name: string;
        durationMin: number;
        price: Prisma.Decimal;
        currency?: string;
      };
      staff: { id: string; name: string };
    },
    timeZone: string,
  ): SchedulingAppointmentDto {
    return {
      id: row.id,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      date: ymdInTimeZone(row.startAt, timeZone),
      status: row.status,
      source: row.source,
      notes: row.notes,
      customer: row.customer,
      service: {
        id: row.service.id,
        name: row.service.name,
        durationMin: row.service.durationMin,
        price: this.money(row.service.price),
        currency: row.service.currency ?? 'COP',
      },
      staff: row.staff,
    };
  }

  async getAppointment(companyId: string, id: string) {
    const timeZone = await this.timezoneFor(companyId);
    const row = await this.prisma.bookingAppointment.findFirst({
      where: { id, companyId },
      include: apptInclude,
    });
    if (!row) throw new NotFoundException('Cita no encontrada');
    return this.formatAppointment(row, timeZone);
  }

  async listAppointments(companyId: string, from: string, to: string) {
    const timeZone = await this.timezoneFor(companyId);
    const start = dayBounds(from, timeZone).start;
    const end = dayBounds(to, timeZone).end;
    const rows = await this.prisma.bookingAppointment.findMany({
      where: {
        companyId,
        startAt: { gte: start, lte: end },
      },
      include: apptInclude,
      orderBy: { startAt: 'asc' },
    });
    return rows.map((r) => this.formatAppointment(r, timeZone));
  }

  async getCustomerAppointments(companyId: string, customerId: string) {
    const timeZone = await this.timezoneFor(companyId);
    const customer = await this.prisma.bookingCustomer.findFirst({
      where: { id: customerId, companyId },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    const rows = await this.prisma.bookingAppointment.findMany({
      where: { companyId, customerId },
      include: apptInclude,
      orderBy: { startAt: 'desc' },
    });
    return {
      customer,
      appointments: rows.map((r) => this.formatAppointment(r, timeZone)),
    };
  }

  async getAvailability(
    companyId: string,
    date: string,
    serviceId: string,
    resourceId: string,
  ) {
    const service = await this.prisma.bookingService.findFirst({
      where: { id: serviceId, companyId, active: true },
    });
    if (!service) throw new NotFoundException('Servicio no disponible');
    const resource = await this.prisma.bookingStaff.findFirst({
      where: { id: resourceId, companyId, active: true },
    });
    if (!resource) throw new NotFoundException('Recurso no disponible');
    const can = await this.prisma.bookingStaffService.findUnique({
      where: { staffId_serviceId: { staffId: resourceId, serviceId } },
    });
    if (!can) {
      throw new BadRequestException('Ese recurso no ofrece este servicio');
    }

    const settings = await this.prisma.bookingSettings.findUnique({
      where: { companyId },
    });
    const timeZone = resolveTimeZone(settings?.timezone);
    const weekday = weekdayFromYmd(date, timeZone);
    const staffHours = await this.prisma.bookingWorkingHour.findMany({
      where: { companyId, staffId: resourceId, weekday },
    });
    const companyHours = await this.prisma.bookingWorkingHour.findMany({
      where: { companyId, staffId: null, weekday },
    });
    const hours = (staffHours.length ? staffHours : companyHours).map((h) => ({
      startMin: h.startMin,
      endMin: h.endMin,
    }));
    const { start: dayStart, end: dayEnd } = dayBounds(date, timeZone);
    const [appts, blocks] = await Promise.all([
      this.prisma.bookingAppointment.findMany({
        where: {
          companyId,
          staffId: resourceId,
          status: { in: ACTIVE },
          startAt: { lt: dayEnd },
          endAt: { gt: dayStart },
        },
      }),
      this.prisma.bookingAvailabilityBlock.findMany({
        where: {
          companyId,
          startAt: { lt: dayEnd },
          endAt: { gt: dayStart },
          OR: [{ staffId: null }, { staffId: resourceId }],
        },
      }),
    ]);
    const occupied = [
      ...appts.map((a) => ({ startAt: a.startAt, endAt: a.endAt })),
      ...blocks.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
    ];
    return {
      date,
      durationMin: service.durationMin,
      timeZone,
      slots: getAvailableSlots({
        ymd: date,
        timeZone,
        durationMin: service.durationMin,
        slotIntervalMin: settings?.slotIntervalMin ?? 15,
        bufferMin: settings?.bufferMin ?? 0,
        hours,
        occupied,
      }),
    };
  }

  async createAppointment(
    companyId: string,
    dto: CreateAppointmentInput,
    source: BookingAppointmentSource,
  ) {
    await this.usage.assertWithinQuota(companyId);
    const service = await this.prisma.bookingService.findFirst({
      where: { id: dto.serviceId, companyId, active: true },
    });
    if (!service) throw new NotFoundException('Servicio no disponible');
    await this.ensureResource(companyId, dto.staffId);
    const timeZone = await this.timezoneFor(companyId);
    const startAt = wallToUtc(dto.date, dto.time, timeZone);
    const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
    if (startAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('No se puede reservar en el pasado');
    }

    const avail = await this.getAvailability(
      companyId,
      dto.date,
      dto.serviceId,
      dto.staffId,
    );
    if (!avail.slots.includes(dto.time)) {
      throw new ConflictException('Ese horario ya no está disponible');
    }

    const customer = await this.resolveCustomer(companyId, dto);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.lockResource(tx, dto.staffId);
        const clash = await tx.bookingAppointment.findFirst({
          where: {
            companyId,
            staffId: dto.staffId,
            status: { in: ACTIVE },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
        });
        if (clash) throw new ConflictException('Ese horario ya está ocupado');
        return tx.bookingAppointment.create({
          data: {
            companyId,
            customerId: customer.id,
            serviceId: dto.serviceId,
            staffId: dto.staffId,
            startAt,
            endAt,
            status: dto.status ?? BookingAppointmentStatus.CONFIRMED,
            source,
            notes: dto.notes?.trim() || null,
            events: {
              create: {
                action: 'created',
                payload: { source, date: dto.date, time: dto.time },
              },
            },
          },
          include: apptInclude,
        });
      });
      return this.formatAppointment(row, timeZone);
    } catch (err) {
      this.asConflict(err);
    }
  }

  async updateAppointment(
    companyId: string,
    id: string,
    dto: UpdateAppointmentInput,
  ) {
    const current = await this.prisma.bookingAppointment.findFirst({
      where: { id, companyId },
      include: apptInclude,
    });
    if (!current) throw new NotFoundException('Cita no encontrada');

    const timeZone = await this.timezoneFor(companyId);
    const staffId = dto.staffId ?? current.staffId;
    const serviceId = dto.serviceId ?? current.serviceId;
    const date = dto.date ?? ymdInTimeZone(current.startAt, timeZone);
    const time = dto.time ?? hhmmInTimeZone(current.startAt, timeZone);

    const service = await this.prisma.bookingService.findFirst({
      where: { id: serviceId, companyId },
    });
    if (!service) throw new NotFoundException('Servicio no disponible');
    const startAt = wallToUtc(date, time, timeZone);
    const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
    const moving =
      dto.date != null ||
      dto.time != null ||
      dto.staffId != null ||
      dto.serviceId != null;

    if (moving) {
      const avail = await this.getAvailability(
        companyId,
        date,
        serviceId,
        staffId,
      );
      const stillOwnSlot =
        staffId === current.staffId &&
        rangesOverlap(startAt, endAt, current.startAt, current.endAt) &&
        date === ymdInTimeZone(current.startAt, timeZone);
      if (!avail.slots.includes(time) && !stillOwnSlot) {
        throw new ConflictException('Ese horario ya no está disponible');
      }
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (moving) {
          await this.lockResource(tx, staffId);
          const clash = await tx.bookingAppointment.findFirst({
            where: {
              companyId,
              staffId,
              id: { not: id },
              status: { in: ACTIVE },
              startAt: { lt: endAt },
              endAt: { gt: startAt },
            },
          });
          if (clash) throw new ConflictException('Ese horario ya está ocupado');
        }
        return tx.bookingAppointment.update({
          where: { id },
          data: {
            staffId,
            serviceId,
            startAt,
            endAt,
            ...(dto.status != null ? { status: dto.status } : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
            events: {
              create: {
                action: moving
                  ? 'rescheduled'
                  : dto.status
                    ? 'status'
                    : 'updated',
                payload: { ...dto },
              },
            },
          },
          include: apptInclude,
        });
      });
      return this.formatAppointment(row, timeZone);
    } catch (err) {
      this.asConflict(err);
    }
  }

  async rescheduleAppointment(
    companyId: string,
    id: string,
    dto: { date: string; time: string; staffId?: string; serviceId?: string },
  ) {
    return this.updateAppointment(companyId, id, dto);
  }

  async cancelAppointment(companyId: string, id: string) {
    return this.updateAppointment(companyId, id, {
      status: BookingAppointmentStatus.CANCELLED,
    });
  }

  private async lockResource(tx: Prisma.TransactionClient, resourceId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resourceId}))`;
  }

  private asConflict(err: unknown): never {
    if (err instanceof HttpException) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : '';
    if (
      (err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === 'P2002' || err.code === 'P2034')) ||
      /23P01|exclusion|overlap/i.test(msg)
    ) {
      throw new ConflictException('Ese horario ya está ocupado');
    }
    if (err instanceof Error) throw err;
    throw new ConflictException('Ese horario ya está ocupado');
  }

  private async resolveCustomer(
    companyId: string,
    dto: CreateAppointmentInput,
  ) {
    if (dto.customerId) {
      const row = await this.prisma.bookingCustomer.findFirst({
        where: { id: dto.customerId, companyId },
      });
      if (!row) throw new NotFoundException('Cliente no encontrado');
      return row;
    }
    const phone = (dto.customerPhone ?? '').replace(/\s+/g, '');
    const name = dto.customerName?.trim();
    if (!phone || !name) {
      throw new BadRequestException('Indicá cliente o nombre y teléfono');
    }
    return this.prisma.bookingCustomer.upsert({
      where: { companyId_phone: { companyId, phone } },
      create: {
        companyId,
        name,
        phone,
        email: dto.customerEmail?.trim() || null,
      },
      update: {
        name,
        email: dto.customerEmail?.trim() || undefined,
      },
    });
  }

  private async ensureResource(companyId: string, id: string) {
    const row = await this.prisma.bookingStaff.findFirst({
      where: { id, companyId },
    });
    if (!row) throw new NotFoundException('Recurso no encontrado');
    return row;
  }
}
