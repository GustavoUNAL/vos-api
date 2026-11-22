import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PersonalMoneyKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import {
  UpsertPersonalCalendarDto,
  UpsertPersonalMoneyDto,
} from './dto/personal.dto';

function moneyRow(row: {
  id: string;
  kind: PersonalMoneyKind;
  amountCOP: Prisma.Decimal;
  category: string;
  note: string | null;
  occurredOn: Date;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string };
}) {
  return {
    id: row.id,
    kind: row.kind,
    amountCOP: Number(row.amountCOP),
    category: row.category,
    note: row.note,
    occurredOn: row.occurredOn.toISOString().slice(0, 10),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.author.id,
    authorName: row.author.name,
  };
}

function calendarRow(row: {
  id: string;
  title: string;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string };
}) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    allDay: row.allDay,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.author.id,
    authorName: row.author.name,
  };
}

@Injectable()
export class PlatformPersonalService {
  constructor(private readonly prisma: PrismaService) {}

  async listMoney(
    tenant: TenantContext,
    opts: { from?: string; to?: string } = {},
  ) {
    const where: Prisma.PersonalMoneyEntryWhereInput = {
      companyId: tenant.companyId,
    };
    if (opts.from || opts.to) {
      where.occurredOn = {};
      if (opts.from) where.occurredOn.gte = this.parseDay(opts.from);
      if (opts.to) where.occurredOn.lte = this.parseDay(opts.to);
    }
    const rows = await this.prisma.personalMoneyEntry.findMany({
      where,
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: { author: { select: { id: true, name: true } } },
    });
    const entries = rows.map(moneyRow);
    const income = entries
      .filter((e) => e.kind === 'INCOME')
      .reduce((s, e) => s + e.amountCOP, 0);
    const expense = entries
      .filter((e) => e.kind === 'EXPENSE')
      .reduce((s, e) => s + e.amountCOP, 0);
    return {
      entries,
      summary: {
        incomeCOP: income,
        expenseCOP: expense,
        balanceCOP: income - expense,
      },
    };
  }

  async createMoney(tenant: TenantContext, dto: UpsertPersonalMoneyDto) {
    const row = await this.prisma.personalMoneyEntry.create({
      data: {
        companyId: tenant.companyId,
        authorId: tenant.userId,
        kind: dto.kind as PersonalMoneyKind,
        amountCOP: new Prisma.Decimal(dto.amountCOP),
        category: (dto.category ?? 'general').trim() || 'general',
        note: dto.note?.trim() || null,
        occurredOn: this.parseDay(dto.occurredOn),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return moneyRow(row);
  }

  async updateMoney(
    tenant: TenantContext,
    id: string,
    dto: UpsertPersonalMoneyDto,
  ) {
    await this.findMoneyOwned(tenant, id);
    const row = await this.prisma.personalMoneyEntry.update({
      where: { id },
      data: {
        kind: dto.kind as PersonalMoneyKind,
        amountCOP: new Prisma.Decimal(dto.amountCOP),
        category: (dto.category ?? 'general').trim() || 'general',
        note: dto.note?.trim() || null,
        occurredOn: this.parseDay(dto.occurredOn),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return moneyRow(row);
  }

  async removeMoney(tenant: TenantContext, id: string) {
    await this.findMoneyOwned(tenant, id);
    await this.prisma.personalMoneyEntry.delete({ where: { id } });
    return { ok: true };
  }

  async listCalendar(
    tenant: TenantContext,
    opts: { from?: string; to?: string } = {},
  ) {
    const where: Prisma.PersonalCalendarEventWhereInput = {
      companyId: tenant.companyId,
    };
    if (opts.from || opts.to) {
      where.startsAt = {};
      if (opts.from) where.startsAt.gte = new Date(opts.from);
      if (opts.to) where.startsAt.lte = new Date(opts.to);
    }
    const rows = await this.prisma.personalCalendarEvent.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      take: 300,
      include: { author: { select: { id: true, name: true } } },
    });
    return { events: rows.map(calendarRow) };
  }

  async createCalendar(tenant: TenantContext, dto: UpsertPersonalCalendarDto) {
    const { startsAt, endsAt } = this.parseRange(dto);
    const row = await this.prisma.personalCalendarEvent.create({
      data: {
        companyId: tenant.companyId,
        authorId: tenant.userId,
        title: dto.title.trim(),
        notes: dto.notes?.trim() || null,
        startsAt,
        endsAt,
        allDay: Boolean(dto.allDay),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return calendarRow(row);
  }

  async updateCalendar(
    tenant: TenantContext,
    id: string,
    dto: UpsertPersonalCalendarDto,
  ) {
    await this.findCalendarOwned(tenant, id);
    const { startsAt, endsAt } = this.parseRange(dto);
    const row = await this.prisma.personalCalendarEvent.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        notes: dto.notes?.trim() || null,
        startsAt,
        endsAt,
        allDay: Boolean(dto.allDay),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return calendarRow(row);
  }

  async removeCalendar(tenant: TenantContext, id: string) {
    await this.findCalendarOwned(tenant, id);
    await this.prisma.personalCalendarEvent.delete({ where: { id } });
    return { ok: true };
  }

  private parseDay(value: string) {
    const day = value.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('Fecha inválida (use YYYY-MM-DD)');
    }
    return new Date(`${day}T00:00:00.000Z`);
  }

  private parseRange(dto: UpsertPersonalCalendarDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (endsAt < startsAt) {
      throw new BadRequestException('La hora de fin debe ser posterior al inicio');
    }
    return { startsAt, endsAt };
  }

  private async findMoneyOwned(tenant: TenantContext, id: string) {
    const row = await this.prisma.personalMoneyEntry.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Movimiento no encontrado');
    if (row.authorId !== tenant.userId && tenant.role !== 'platform-admin') {
      throw new ForbiddenException('Solo puede editar sus propios movimientos');
    }
    return row;
  }

  private async findCalendarOwned(tenant: TenantContext, id: string) {
    const row = await this.prisma.personalCalendarEvent.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Evento no encontrado');
    if (row.authorId !== tenant.userId && tenant.role !== 'platform-admin') {
      throw new ForbiddenException('Solo puede editar sus propios eventos');
    }
    return row;
  }
}
