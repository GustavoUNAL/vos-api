import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';

function formatRow(row: {
  id: string;
  taskDate: string;
  title: string;
  description: string | null;
  completed: boolean;
  completedAt: Date | null;
  sortOrder: number;
  createdById: string | null;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    taskDate: row.taskDate,
    title: row.title,
    description: row.description,
    completed: row.completed,
    completedAt: row.completedAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
    createdById: row.createdById,
    assignedToId: row.assignedToId,
    createdByName: row.createdBy?.name ?? null,
    assignedToName: row.assignedTo?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const taskInclude = {
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

@Injectable()
export class PlatformTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listByDate(tenant: TenantContext, taskDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate.trim())) {
      throw new BadRequestException('taskDate debe ser YYYY-MM-DD');
    }
    const rows = await this.prisma.companyTask.findMany({
      where: { companyId: tenant.companyId, taskDate: taskDate.trim() },
      orderBy: [{ completed: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: taskInclude,
    });
    const completed = rows.filter((r) => r.completed).length;
    return {
      taskDate: taskDate.trim(),
      tasks: rows.map(formatRow),
      summary: { total: rows.length, completed, pending: rows.length - completed },
    };
  }

  async getCalendar(tenant: TenantContext, year: number, month: number) {
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new BadRequestException('year/month fuera de rango.');
    }
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const rows = await this.prisma.companyTask.groupBy({
      by: ['taskDate'],
      where: {
        companyId: tenant.companyId,
        taskDate: { startsWith: prefix },
      },
      _count: { _all: true },
    });

    const byDay = new Map<string, { total: number; completed: number }>();
    for (const r of rows) {
      byDay.set(r.taskDate, { total: r._count._all, completed: 0 });
    }

    const completedRows = await this.prisma.companyTask.groupBy({
      by: ['taskDate'],
      where: {
        companyId: tenant.companyId,
        taskDate: { startsWith: prefix },
        completed: true,
      },
      _count: { _all: true },
    });
    for (const r of completedRows) {
      const prev = byDay.get(r.taskDate);
      if (prev) prev.completed = r._count._all;
    }

    const days = [...byDay.entries()]
      .map(([date, agg]) => ({
        date,
        count: agg.total,
        completedCount: agg.completed,
        pendingCount: agg.total - agg.completed,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { year, month, days };
  }

  async create(tenant: TenantContext, dto: CreateTaskDto) {
    const maxSort = await this.prisma.companyTask.aggregate({
      where: {
        companyId: tenant.companyId,
        taskDate: dto.taskDate.trim(),
      },
      _max: { sortOrder: true },
    });
    const row = await this.prisma.companyTask.create({
      data: {
        companyId: tenant.companyId,
        taskDate: dto.taskDate.trim(),
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        createdById: tenant.userId,
        assignedToId: dto.assignedToId?.trim() || null,
      },
      include: taskInclude,
    });
    return formatRow(row);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.companyTask.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Tarea no encontrada');

    const data: {
      title?: string;
      description?: string | null;
      completed?: boolean;
      completedAt?: Date | null;
      assignedToId?: string | null;
    } = {};

    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.assignedToId !== undefined) {
      data.assignedToId = dto.assignedToId?.trim() || null;
    }
    if (dto.completed !== undefined) {
      data.completed = dto.completed;
      data.completedAt = dto.completed ? new Date() : null;
    }

    const row = await this.prisma.companyTask.update({
      where: { id },
      data,
      include: taskInclude,
    });
    return formatRow(row);
  }

  async remove(tenant: TenantContext, id: string) {
    const existing = await this.prisma.companyTask.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Tarea no encontrada');
    await this.prisma.companyTask.delete({ where: { id } });
    return { ok: true };
  }
}
