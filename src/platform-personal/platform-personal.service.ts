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
  UpsertMoneyBudgetDto,
  UpsertPersonalCalendarDto,
  UpsertPersonalIdeaDto,
  UpsertPersonalMoneyDto,
  UpsertWellnessDto,
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
    const byCategory: Record<string, { incomeCOP: number; expenseCOP: number }> =
      {};
    for (const e of entries) {
      const bucket = byCategory[e.category] ?? { incomeCOP: 0, expenseCOP: 0 };
      if (e.kind === 'INCOME') bucket.incomeCOP += e.amountCOP;
      else bucket.expenseCOP += e.amountCOP;
      byCategory[e.category] = bucket;
    }
    return {
      entries,
      summary: {
        incomeCOP: income,
        expenseCOP: expense,
        balanceCOP: income - expense,
      },
      byCategory: Object.entries(byCategory).map(([category, v]) => ({
        category,
        ...v,
      })),
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

  async overview(tenant: TenantContext) {
    const today = new Date().toISOString().slice(0, 10);
    const [money, ideas, notes, wellness, tasks, events] = await Promise.all([
      this.listMoney(tenant),
      this.listIdeas(tenant),
      this.prisma.companyJournalEntry.count({
        where: { companyId: tenant.companyId },
      }),
      this.listWellness(tenant),
      this.prisma.companyTask.count({
        where: {
          companyId: tenant.companyId,
          taskDate: today,
          completed: false,
        },
      }),
      this.prisma.personalCalendarEvent.count({
        where: {
          companyId: tenant.companyId,
          startsAt: { gte: new Date() },
        },
      }),
    ]);
    return {
      money: money.summary,
      ideasCount: ideas.ideas.length,
      notesCount: notes,
      pendingTasksToday: tasks,
      upcomingEvents: events,
      latestWellness: wellness.checkIns[0] ?? null,
      graph: wellness.graph,
    };
  }

  async listIdeas(tenant: TenantContext) {
    const rows = await this.prisma.personalIdea.findMany({
      where: { companyId: tenant.companyId },
      orderBy: [{ starred: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
      include: { author: { select: { id: true, name: true } } },
    });
    return {
      ideas: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        tags: r.tags,
        starred: r.starred,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        authorId: r.author.id,
        authorName: r.author.name,
      })),
    };
  }

  async createIdea(tenant: TenantContext, dto: UpsertPersonalIdeaDto) {
    const row = await this.prisma.personalIdea.create({
      data: {
        companyId: tenant.companyId,
        authorId: tenant.userId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        tags: this.cleanTags(dto.tags),
        starred: Boolean(dto.starred),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      tags: row.tags,
      starred: row.starred,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      authorId: row.author.id,
      authorName: row.author.name,
    };
  }

  async updateIdea(
    tenant: TenantContext,
    id: string,
    dto: UpsertPersonalIdeaDto,
  ) {
    await this.findIdeaOwned(tenant, id);
    const row = await this.prisma.personalIdea.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        tags: this.cleanTags(dto.tags),
        starred: Boolean(dto.starred),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      tags: row.tags,
      starred: row.starred,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      authorId: row.author.id,
      authorName: row.author.name,
    };
  }

  async removeIdea(tenant: TenantContext, id: string) {
    await this.findIdeaOwned(tenant, id);
    await this.prisma.personalIdea.delete({ where: { id } });
    return { ok: true };
  }

  async listWellness(tenant: TenantContext) {
    const rows = await this.prisma.personalWellnessCheckIn.findMany({
      where: { companyId: tenant.companyId, authorId: tenant.userId },
      orderBy: { checkedOn: 'desc' },
      take: 60,
    });
    const checkIns = rows.map((r) => ({
      id: r.id,
      mood: r.mood,
      health: r.health,
      love: r.love,
      friendships: r.friendships,
      family: r.family,
      note: r.note,
      checkedOn: r.checkedOn.toISOString().slice(0, 10),
      createdAt: r.createdAt.toISOString(),
    }));
    return { checkIns, graph: this.buildWellnessGraph(checkIns) };
  }

  async upsertWellness(tenant: TenantContext, dto: UpsertWellnessDto) {
    const day = this.parseDay(
      dto.checkedOn?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    );
    const row = await this.prisma.personalWellnessCheckIn.upsert({
      where: {
        companyId_authorId_checkedOn: {
          companyId: tenant.companyId,
          authorId: tenant.userId,
          checkedOn: day,
        },
      },
      create: {
        companyId: tenant.companyId,
        authorId: tenant.userId,
        mood: dto.mood,
        health: dto.health,
        love: dto.love,
        friendships: dto.friendships,
        family: dto.family,
        note: dto.note?.trim() || null,
        checkedOn: day,
      },
      update: {
        mood: dto.mood,
        health: dto.health,
        love: dto.love,
        friendships: dto.friendships,
        family: dto.family,
        note: dto.note?.trim() || null,
      },
    });
    return {
      id: row.id,
      mood: row.mood,
      health: row.health,
      love: row.love,
      friendships: row.friendships,
      family: row.family,
      note: row.note,
      checkedOn: row.checkedOn.toISOString().slice(0, 10),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listBudgets(tenant: TenantContext, month?: string) {
    const monthDate = this.parseMonth(month || new Date().toISOString().slice(0, 7));
    const rows = await this.prisma.personalMoneyBudget.findMany({
      where: { companyId: tenant.companyId, month: monthDate },
      orderBy: { category: 'asc' },
    });
    const money = await this.listMoney(tenant, {
      from: monthDate.toISOString().slice(0, 10),
      to: new Date(
        Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
      )
        .toISOString()
        .slice(0, 10),
    });
    return {
      month: monthDate.toISOString().slice(0, 7),
      budgets: rows.map((r) => {
        const spent =
          money.byCategory.find((c) => c.category === r.category)?.expenseCOP ??
          0;
        return {
          id: r.id,
          category: r.category,
          limitCOP: Number(r.limitCOP),
          spentCOP: spent,
          remainingCOP: Number(r.limitCOP) - spent,
        };
      }),
    };
  }

  async upsertBudget(tenant: TenantContext, dto: UpsertMoneyBudgetDto) {
    const month = this.parseMonth(dto.month);
    const row = await this.prisma.personalMoneyBudget.upsert({
      where: {
        companyId_category_month: {
          companyId: tenant.companyId,
          category: dto.category.trim().toLowerCase(),
          month,
        },
      },
      create: {
        companyId: tenant.companyId,
        authorId: tenant.userId,
        category: dto.category.trim().toLowerCase(),
        month,
        limitCOP: new Prisma.Decimal(dto.limitCOP),
      },
      update: {
        limitCOP: new Prisma.Decimal(dto.limitCOP),
      },
    });
    return {
      id: row.id,
      category: row.category,
      month: row.month.toISOString().slice(0, 7),
      limitCOP: Number(row.limitCOP),
    };
  }

  private buildWellnessGraph(
    checkIns: {
      mood: number;
      health: number;
      love: number;
      friendships: number;
      family: number;
    }[],
  ) {
    const dims = [
      'mood',
      'health',
      'love',
      'friendships',
      'family',
    ] as const;
    const labels: Record<(typeof dims)[number], string> = {
      mood: 'Ánimo',
      health: 'Salud',
      love: 'Amor',
      friendships: 'Amistades',
      family: 'Familia',
    };
    const latest = checkIns[0];
    const nodes = dims.map((id) => ({
      id,
      label: labels[id],
      value: latest ? latest[id] : 5,
    }));
    const edges: { from: string; to: string; weight: number }[] = [];
    if (checkIns.length >= 3) {
      for (let i = 0; i < dims.length; i++) {
        for (let j = i + 1; j < dims.length; j++) {
          const a = dims[i];
          const b = dims[j];
          const corr = this.pearson(
            checkIns.map((c) => c[a]),
            checkIns.map((c) => c[b]),
          );
          if (Math.abs(corr) >= 0.25) {
            edges.push({
              from: a,
              to: b,
              weight: Math.round(corr * 100) / 100,
            });
          }
        }
      }
    } else if (latest) {
      // Sin historial suficiente: grafo suave centrado en ánimo.
      for (const d of dims) {
        if (d === 'mood') continue;
        edges.push({
          from: 'mood',
          to: d,
          weight: Math.round(((latest.mood + latest[d]) / 20) * 100) / 100,
        });
      }
    }
    return { nodes, edges };
  }

  private pearson(xs: number[], ys: number[]) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return 0;
    const ax = xs.slice(0, n);
    const ay = ys.slice(0, n);
    const mx = ax.reduce((s, v) => s + v, 0) / n;
    const my = ay.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
      const vx = ax[i] - mx;
      const vy = ay[i] - my;
      num += vx * vy;
      dx += vx * vx;
      dy += vy * vy;
    }
    if (dx === 0 || dy === 0) return 0;
    return num / Math.sqrt(dx * dy);
  }

  private cleanTags(tags?: string[]) {
    if (!tags?.length) return [];
    return [
      ...new Set(
        tags
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 12),
      ),
    ];
  }

  private parseMonth(value: string) {
    const m = value.trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) {
      throw new BadRequestException('Mes inválido (use YYYY-MM)');
    }
    return new Date(`${m}-01T00:00:00.000Z`);
  }

  private async findIdeaOwned(tenant: TenantContext, id: string) {
    const row = await this.prisma.personalIdea.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Idea no encontrada');
    if (row.authorId !== tenant.userId && tenant.role !== 'platform-admin') {
      throw new ForbiddenException('Solo puede editar sus propias ideas');
    }
    return row;
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
