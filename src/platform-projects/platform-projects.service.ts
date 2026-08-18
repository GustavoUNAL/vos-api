import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

function formatRow(row: {
  id: string;
  name: string;
  address: string;
  description: string;
  chargedAmount: Prisma.Decimal;
  status: ProjectStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    description: row.description,
    chargedAmount: Number(row.chargedAmount.toString()),
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PlatformProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenant: TenantContext, status?: string) {
    const where: Prisma.ServiceProjectWhereInput = {
      companyId: tenant.companyId,
    };
    if (
      status &&
      (Object.values(ProjectStatus) as string[]).includes(status)
    ) {
      where.status = status as ProjectStatus;
    }
    const rows = await this.prisma.serviceProject.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    const formatted = rows.map(formatRow);
    const charged = formatted.reduce((sum, p) => sum + p.chargedAmount, 0);
    const inProgress = formatted.filter((p) => p.status === 'IN_PROGRESS').length;
    const completed = formatted.filter((p) => p.status === 'COMPLETED').length;
    return {
      projects: formatted,
      summary: {
        total: formatted.length,
        inProgress,
        completed,
        chargedTotal: charged,
      },
    };
  }

  async create(tenant: TenantContext, dto: CreateProjectDto) {
    const row = await this.prisma.serviceProject.create({
      data: {
        companyId: tenant.companyId,
        name: dto.name.trim(),
        address: dto.address.trim(),
        description: dto.description?.trim() ?? '',
        chargedAmount: new Prisma.Decimal(dto.chargedAmount),
        status: dto.status ?? ProjectStatus.IN_PROGRESS,
        notes: dto.notes?.trim() || null,
      },
    });
    return formatRow(row);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.serviceProject.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Proyecto no encontrado');
    const row = await this.prisma.serviceProject.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.address != null ? { address: dto.address.trim() } : {}),
        ...(dto.description != null ? { description: dto.description.trim() } : {}),
        ...(dto.chargedAmount != null
          ? { chargedAmount: new Prisma.Decimal(dto.chargedAmount) }
          : {}),
        ...(dto.status != null ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
    return formatRow(row);
  }

  async remove(tenant: TenantContext, id: string) {
    const existing = await this.prisma.serviceProject.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Proyecto no encontrado');
    await this.prisma.serviceProject.delete({ where: { id } });
    return { ok: true };
  }
}
