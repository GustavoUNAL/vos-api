import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingAppointmentSource,
  BookingAppointmentStatus,
  Prisma,
  SaleSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { SchedulingEngineService } from '../scheduling-engine/scheduling-engine.service';
import { dayBounds, ymdInTimeZone } from '../scheduling-engine/scheduling-time';
import {
  CreateAppointmentDto,
  CreateBlockDto,
  PublicCreateAppointmentDto,
  ReplaceHoursDto,
  UpdateAppointmentDto,
  UpdateSettingsDto,
  UpsertBookingCustomerDto,
  UpsertBookingServiceDto,
  UpsertBookingStaffDto,
} from './dto/booking.dto';
import { BookingNotificationService } from './booking-notification.service';
import { resolveTimeZone } from '../scheduling-engine/scheduling-time';
import type { SchedulingAppointmentDto } from '../scheduling-engine/scheduling-engine.service';

const bookingSaleTag = (appointmentId: string) => `booking:${appointmentId}`;

/**
 * Módulo Agenda de citas — adaptador de tenant sobre el Scheduling Engine.
 * La lógica de disponibilidad, conflictos y reservas vive en SchedulingEngineService.
 */
@Injectable()
export class PlatformBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: SchedulingEngineService,
    private readonly notifications: BookingNotificationService,
  ) {}

  async getSettings(companyId: string) {
    const existing = await this.prisma.bookingSettings.findUnique({
      where: { companyId },
    });
    if (existing) {
      await this.ensurePublicDefaults(companyId);
      return existing;
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    const base =
      (company.name || 'negocio')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'negocio';
    let slug = base;
    let n = 2;
    while (
      await this.prisma.bookingSettings.findUnique({
        where: { publicSlug: slug },
      })
    ) {
      slug = `${base}-${n++}`;
    }
    const created = await this.prisma.bookingSettings.create({
      data: {
        companyId,
        publicSlug: slug,
        publicEnabled: true,
        welcomeMessage: `Agenda tu cita en ${company.name}`,
      },
    });
    await this.ensurePublicDefaults(companyId);
    return created;
  }

  /** Servicio, profesional y horario base para que el enlace público funcione sin setup. */
  async ensurePublicDefaults(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    let services = await this.prisma.bookingService.findMany({
      where: { companyId, active: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!services.length) {
      services = [
        await this.prisma.bookingService.create({
          data: {
            companyId,
            name: 'Cita',
            description: 'Turno con el negocio',
            durationMin: 30,
            price: 0,
          },
        }),
      ];
    }
    let staffList = await this.prisma.bookingStaff.findMany({
      where: { companyId, active: true },
      orderBy: { name: 'asc' },
    });
    if (!staffList.length) {
      staffList = [
        await this.prisma.bookingStaff.create({
          data: {
            companyId,
            name: company?.name?.trim() || 'Equipo',
          },
        }),
      ];
    }
    for (const staff of staffList) {
      const linked = await this.prisma.bookingStaffService.count({
        where: { staffId: staff.id },
      });
      if (linked) continue;
      for (const service of services) {
        await this.prisma.bookingStaffService.upsert({
          where: {
            staffId_serviceId: { staffId: staff.id, serviceId: service.id },
          },
          create: { staffId: staff.id, serviceId: service.id },
          update: {},
        });
      }
    }
    for (const service of services) {
      const linked = await this.prisma.bookingStaffService.count({
        where: { serviceId: service.id },
      });
      if (linked || !staffList[0]) continue;
      await this.prisma.bookingStaffService.upsert({
        where: {
          staffId_serviceId: {
            staffId: staffList[0].id,
            serviceId: service.id,
          },
        },
        create: { staffId: staffList[0].id, serviceId: service.id },
        update: {},
      });
    }
    const hours = await this.prisma.bookingWorkingHour.count({
      where: { companyId },
    });
    if (!hours) {
      await this.prisma.bookingWorkingHour.createMany({
        data: [1, 2, 3, 4, 5, 6].map((weekday) => ({
          companyId,
          weekday,
          startMin: 8 * 60,
          endMin: 18 * 60,
        })),
      });
    }
  }

  async updateSettings(tenant: TenantContext, dto: UpdateSettingsDto) {
    const current = await this.getSettings(tenant.companyId);
    if (dto.publicSlug && dto.publicSlug !== current.publicSlug) {
      const taken = await this.prisma.bookingSettings.findUnique({
        where: { publicSlug: dto.publicSlug },
      });
      if (taken)
        throw new ConflictException('Ese enlace público ya está en uso');
    }
    if (dto.timezone) resolveTimeZone(dto.timezone);
    return this.prisma.bookingSettings.update({
      where: { companyId: tenant.companyId },
      data: {
        ...(dto.publicSlug != null ? { publicSlug: dto.publicSlug } : {}),
        ...(dto.publicEnabled != null
          ? { publicEnabled: dto.publicEnabled }
          : {}),
        ...(dto.welcomeMessage != null
          ? { welcomeMessage: dto.welcomeMessage }
          : {}),
        ...(dto.noticeMessage != null ? { noticeMessage: dto.noticeMessage } : {}),
        ...(dto.whatsappPhone != null
          ? { whatsappPhone: dto.whatsappPhone.trim() }
          : {}),
        ...(dto.slotIntervalMin != null
          ? { slotIntervalMin: dto.slotIntervalMin }
          : {}),
        ...(dto.bufferMin != null ? { bufferMin: dto.bufferMin } : {}),
        ...(dto.timezone != null
          ? { timezone: resolveTimeZone(dto.timezone) }
          : {}),
      },
    });
  }

  async dashboard(tenant: TenantContext) {
    const timeZone = await this.engine.timezoneFor(tenant.companyId);
    const today = ymdInTimeZone(new Date(), timeZone);
    const { start, end } = dayBounds(today, timeZone);
    const rows = await this.prisma.bookingAppointment.findMany({
      where: {
        companyId: tenant.companyId,
        startAt: { gte: start, lte: end },
      },
      include: { customer: true, service: true, staff: true },
      orderBy: { startAt: 'asc' },
    });
    const next = rows.find(
      (r) =>
        r.startAt.getTime() >= Date.now() &&
        r.status !== BookingAppointmentStatus.CANCELLED &&
        r.status !== BookingAppointmentStatus.NO_SHOW &&
        r.status !== BookingAppointmentStatus.COMPLETED,
    );
    const completed = rows.filter((r) => r.status === 'COMPLETED');
    const cancelled = rows.filter((r) => r.status === 'CANCELLED').length;
    const revenue = completed.reduce(
      (s, r) => s + Number(r.service.price.toString()),
      0,
    );
    return {
      date: today,
      total: rows.length,
      completed: completed.length,
      cancelled,
      revenue,
      next: next ? this.engine.formatAppointment(next, timeZone) : null,
      appointments: rows.map((r) => this.engine.formatAppointment(r, timeZone)),
    };
  }

  listServices(tenant: TenantContext, all = false) {
    return this.prisma.bookingService.findMany({
      where: { companyId: tenant.companyId, ...(all ? {} : { active: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createService(tenant: TenantContext, dto: UpsertBookingServiceDto) {
    return this.prisma.bookingService.create({
      data: {
        companyId: tenant.companyId,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? '',
        durationMin: dto.durationMin,
        price: new Prisma.Decimal(dto.price),
        currency: dto.currency?.trim().toUpperCase() || 'COP',
        active: dto.active ?? true,
      },
    });
  }

  async updateService(
    tenant: TenantContext,
    id: string,
    dto: Partial<UpsertBookingServiceDto>,
  ) {
    await this.ensureService(tenant.companyId, id);
    return this.prisma.bookingService.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description != null
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.durationMin != null ? { durationMin: dto.durationMin } : {}),
        ...(dto.price != null ? { price: new Prisma.Decimal(dto.price) } : {}),
        ...(dto.currency != null
          ? { currency: dto.currency.trim().toUpperCase() }
          : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
      },
    });
  }

  async listStaff(tenant: TenantContext, all = false) {
    const rows = await this.prisma.bookingStaff.findMany({
      where: { companyId: tenant.companyId, ...(all ? {} : { active: true }) },
      include: { serviceLinks: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((s) => ({
      ...s,
      serviceIds: s.serviceLinks.map((l) => l.serviceId),
    }));
  }

  async createStaff(tenant: TenantContext, dto: UpsertBookingStaffDto) {
    return this.prisma.bookingStaff.create({
      data: {
        companyId: tenant.companyId,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        photoUrl: dto.photoUrl?.trim() || null,
        active: dto.active ?? true,
        serviceLinks: dto.serviceIds?.length
          ? { create: dto.serviceIds.map((serviceId) => ({ serviceId })) }
          : undefined,
      },
      include: { serviceLinks: true },
    });
  }

  async updateStaff(
    tenant: TenantContext,
    id: string,
    dto: Partial<UpsertBookingStaffDto>,
  ) {
    await this.ensureStaff(tenant.companyId, id);
    if (dto.serviceIds) {
      await this.prisma.bookingStaffService.deleteMany({
        where: { staffId: id },
      });
      if (dto.serviceIds.length) {
        await this.prisma.bookingStaffService.createMany({
          data: dto.serviceIds.map((serviceId) => ({ staffId: id, serviceId })),
        });
      }
    }
    return this.prisma.bookingStaff.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim() || null }
          : {}),
        ...(dto.photoUrl !== undefined
          ? { photoUrl: dto.photoUrl?.trim() || null }
          : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
      },
      include: { serviceLinks: true },
    });
  }

  listCustomers(tenant: TenantContext, q?: string) {
    return this.prisma.bookingCustomer.findMany({
      where: {
        companyId: tenant.companyId,
        ...(q?.trim()
          ? {
              OR: [
                { name: { contains: q.trim(), mode: 'insensitive' } },
                { phone: { contains: q.trim() } },
              ],
            }
          : {}),
      },
      include: {
        appointments: {
          orderBy: { startAt: 'desc' },
          take: 8,
          include: { service: true, staff: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async upsertCustomer(tenant: TenantContext, dto: UpsertBookingCustomerDto) {
    const phone = dto.phone.replace(/\s+/g, '');
    return this.prisma.bookingCustomer.upsert({
      where: {
        companyId_phone: { companyId: tenant.companyId, phone },
      },
      create: {
        companyId: tenant.companyId,
        name: dto.name.trim(),
        phone,
        email: dto.email?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      update: {
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  getCustomerAppointments(tenant: TenantContext, customerId: string) {
    return this.engine.getCustomerAppointments(tenant.companyId, customerId);
  }

  async listHours(tenant: TenantContext, staffId?: string | null) {
    return this.prisma.bookingWorkingHour.findMany({
      where: {
        companyId: tenant.companyId,
        staffId: staffId === undefined ? undefined : staffId,
      },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    });
  }

  async replaceHours(tenant: TenantContext, dto: ReplaceHoursDto) {
    const staffId = dto.staffId ?? null;
    await this.prisma.bookingWorkingHour.deleteMany({
      where: { companyId: tenant.companyId, staffId },
    });
    if (!dto.hours?.length) return [];
    await this.prisma.bookingWorkingHour.createMany({
      data: dto.hours.map((h) => ({
        companyId: tenant.companyId,
        staffId,
        weekday: h.weekday,
        startMin: h.startMin,
        endMin: h.endMin,
      })),
    });
    return this.listHours(tenant, staffId);
  }

  listBlocks(tenant: TenantContext) {
    return this.prisma.bookingAvailabilityBlock.findMany({
      where: { companyId: tenant.companyId, endAt: { gte: new Date() } },
      orderBy: { startAt: 'asc' },
    });
  }

  createBlock(tenant: TenantContext, dto: CreateBlockDto) {
    return this.prisma.bookingAvailabilityBlock.create({
      data: {
        companyId: tenant.companyId,
        staffId: dto.staffId || null,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        reason: dto.reason?.trim() || null,
      },
    });
  }

  async deleteBlock(tenant: TenantContext, id: string) {
    const row = await this.prisma.bookingAvailabilityBlock.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Bloqueo no encontrado');
    await this.prisma.bookingAvailabilityBlock.delete({ where: { id } });
    return { ok: true };
  }

  listAppointments(tenant: TenantContext, from: string, to: string) {
    return this.engine.listAppointments(tenant.companyId, from, to);
  }

  getAppointment(tenant: TenantContext, id: string) {
    return this.engine.getAppointment(tenant.companyId, id);
  }

  availability(
    companyId: string,
    date: string,
    serviceId: string,
    staffId: string,
  ) {
    return this.engine.getAvailability(companyId, date, serviceId, staffId);
  }

  async createAppointment(
    companyId: string,
    dto: CreateAppointmentDto,
    source: BookingAppointmentSource,
  ) {
    const formatted = await this.engine.createAppointment(
      companyId,
      dto,
      source,
    );
    if (formatted.status === BookingAppointmentStatus.CONFIRMED) {
      await this.notifications.notify('confirmed', formatted);
    }
    return formatted;
  }

  async updateAppointment(
    tenant: TenantContext,
    id: string,
    dto: UpdateAppointmentDto,
  ) {
    const formatted = await this.engine.updateAppointment(
      tenant.companyId,
      id,
      dto,
    );
    if (dto.status === 'COMPLETED') {
      await this.recordCompletedServiceSale(tenant, formatted);
    } else if (dto.status === 'CANCELLED' || dto.status === 'NO_SHOW') {
      await this.removeCompletedServiceSale(tenant.companyId, id);
    }
    if (dto.status === 'CANCELLED') {
      await this.notifications.notify('cancelled', formatted);
    } else if (dto.status === 'CONFIRMED') {
      await this.notifications.notify('confirmed', formatted);
    } else if (
      dto.date != null ||
      dto.time != null ||
      dto.staffId != null ||
      dto.serviceId != null
    ) {
      await this.notifications.notify('rescheduled', formatted);
    }
    return formatted;
  }

  cancelAppointment(tenant: TenantContext, id: string) {
    return this.engine
      .cancelAppointment(tenant.companyId, id)
      .then(async (row) => {
        await this.removeCompletedServiceSale(tenant.companyId, id);
        await this.notifications.notify('cancelled', row);
        return row;
      });
  }

  rescheduleAppointment(
    tenant: TenantContext,
    id: string,
    dto: { date: string; time: string; staffId?: string; serviceId?: string },
  ) {
    return this.engine
      .rescheduleAppointment(tenant.companyId, id, dto)
      .then(async (row) => {
        await this.notifications.notify('rescheduled', row);
        return row;
      });
  }

  async publicCatalog(slug: string) {
    const settings = await this.prisma.bookingSettings.findUnique({
      where: { publicSlug: slug },
    });
    if (!settings?.publicEnabled) {
      throw new NotFoundException('Reservas no disponibles');
    }
    await this.ensurePublicDefaults(settings.companyId);
    const company = await this.prisma.company.findUnique({
      where: { id: settings.companyId },
    });
    if (!company) throw new NotFoundException('Negocio no encontrado');
    const [services, staff, hours] = await Promise.all([
      this.prisma.bookingService.findMany({
        where: { companyId: company.id, active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.bookingStaff.findMany({
        where: { companyId: company.id, active: true },
        include: { serviceLinks: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.bookingWorkingHour.findMany({
        where: { companyId: company.id },
        select: { weekday: true, startMin: true, endMin: true },
      }),
    ]);
    return {
      business: {
        name: company.name,
        slug: settings.publicSlug,
        welcomeMessage: settings.welcomeMessage,
        noticeMessage: settings.noticeMessage,
        whatsappPhone: settings.whatsappPhone || '',
        timezone: settings.timezone,
      },
      hours,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        price: Number(s.price.toString()),
        currency: s.currency,
      })),
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        photoUrl: s.photoUrl,
        serviceIds: s.serviceLinks.map((l) => l.serviceId),
      })),
    };
  }

  async publicAvailability(
    slug: string,
    date: string,
    serviceId: string,
    staffId: string,
  ) {
    const settings = await this.prisma.bookingSettings.findUnique({
      where: { publicSlug: slug },
    });
    if (!settings?.publicEnabled) {
      throw new NotFoundException('Reservas no disponibles');
    }
    await this.ensurePublicDefaults(settings.companyId);
    return this.engine.getAvailability(
      settings.companyId,
      date,
      serviceId,
      staffId,
      { durationMin: 60, slotIntervalMin: 60 },
    );
  }

  async publicCreate(slug: string, dto: PublicCreateAppointmentDto) {
    const settings = await this.prisma.bookingSettings.findUnique({
      where: { publicSlug: slug },
    });
    if (!settings?.publicEnabled) {
      throw new NotFoundException('Reservas no disponibles');
    }
    await this.ensurePublicDefaults(settings.companyId);
    const [service, staff] = await Promise.all([
      dto.serviceId
        ? this.prisma.bookingService.findFirst({
            where: { id: dto.serviceId, companyId: settings.companyId, active: true },
          })
        : this.prisma.bookingService.findFirst({
            where: { companyId: settings.companyId, active: true },
            orderBy: { sortOrder: 'asc' },
          }),
      dto.staffId
        ? this.prisma.bookingStaff.findFirst({
            where: { id: dto.staffId, companyId: settings.companyId, active: true },
          })
        : this.prisma.bookingStaff.findFirst({
            where: {
              companyId: settings.companyId,
              active: true,
              name: { equals: 'Ricky', mode: 'insensitive' },
            },
          }).then(
            (row) =>
              row ??
              this.prisma.bookingStaff.findFirst({
                where: { companyId: settings.companyId, active: true },
                orderBy: { name: 'asc' },
              }),
          ),
    ]);
    if (!service || !staff) {
      throw new NotFoundException('Agenda no disponible');
    }
    return this.createAppointment(
      settings.companyId,
      {
        serviceId: service.id,
        staffId: staff.id,
        date: dto.date,
        time: dto.time,
        customerName: dto.name,
        customerPhone: dto.phone,
        customerEmail: dto.email,
        notes: dto.notes,
        status: BookingAppointmentStatus.CONFIRMED,
      },
      BookingAppointmentSource.PUBLIC_BOOKING,
    );
  }

  private async findServiceSale(companyId: string, appointmentId: string) {
    return this.prisma.sale.findFirst({
      where: {
        companyId,
        notes: { equals: bookingSaleTag(appointmentId) },
      },
    });
  }

  /** Al terminar un servicio, se registra una venta para el cierre del día y finanzas. */
  private async recordCompletedServiceSale(
    tenant: TenantContext,
    appointment: SchedulingAppointmentDto,
  ) {
    const existing = await this.findServiceSale(
      tenant.companyId,
      appointment.id,
    );
    if (existing) return existing;

    const price = Math.max(0, Math.round(Number(appointment.service.price) || 0));
    const total = new Prisma.Decimal(price);
    const count = await this.prisma.sale.count({
      where: { companyId: tenant.companyId },
    });
    const code = `V${String(count + 1).padStart(4, '0')}`;

    return this.prisma.sale.create({
      data: {
        companyId: tenant.companyId,
        code,
        saleDate: new Date(),
        total,
        paymentMethod: 'Efectivo',
        source: SaleSource.MANUAL,
        userId: tenant.userId,
        mesa: appointment.customer.name,
        customerPhone: appointment.customer.phone || null,
        notes: bookingSaleTag(appointment.id),
        lines: {
          create: {
            productName: appointment.service.name,
            quantity: new Prisma.Decimal(1),
            unitPrice: total,
            profit: total,
          },
        },
      },
    });
  }

  private async removeCompletedServiceSale(
    companyId: string,
    appointmentId: string,
  ) {
    const existing = await this.findServiceSale(companyId, appointmentId);
    if (!existing) return;
    await this.prisma.sale.delete({ where: { id: existing.id } });
  }

  private async ensureService(companyId: string, id: string) {
    const row = await this.prisma.bookingService.findFirst({
      where: { id, companyId },
    });
    if (!row) throw new NotFoundException('Servicio no encontrado');
    return row;
  }

  private async ensureStaff(companyId: string, id: string) {
    const row = await this.prisma.bookingStaff.findFirst({
      where: { id, companyId },
    });
    if (!row) throw new NotFoundException('Profesional no encontrado');
    return row;
  }
}
