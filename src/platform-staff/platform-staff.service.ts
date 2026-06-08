import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import {
  CreateStaffMemberDto,
  UpdateStaffMemberDto,
} from './dto/staff-member.dto';
import {
  CreateStaffShiftDto,
  UpdateStaffShiftDto,
} from './dto/staff-shift.dto';
import {
  computeShiftPay,
  decimalFromNumber,
  decimalToNumber,
  parseShiftInstant,
  shiftDateFromInstant,
} from './staff-shift.math';

type ListMembersOpts = {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
};

type ListShiftsOpts = {
  page: number;
  limit: number;
  staffMemberId?: string;
  status?: StaffShiftStatus;
  dateFrom?: string;
  dateTo?: string;
};

@Injectable()
export class PlatformStaffService {
  constructor(private readonly prisma: PrismaService) {}

  private formatMember(row: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    idNumber: string | null;
    defaultHourlyRate: Prisma.Decimal;
    active: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      idNumber: row.idNumber,
      defaultHourlyRate: row.defaultHourlyRate.toString(),
      active: row.active,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private formatShift(
    row: Prisma.StaffShiftGetPayload<{ include: { staffMember: true } }>,
  ) {
    return {
      id: row.id,
      staffMemberId: row.staffMemberId,
      staffMemberName: row.staffMember.name,
      shiftDate: row.shiftDate.toISOString().slice(0, 10),
      startAt: row.startAt.toISOString(),
      endAt: row.endAt?.toISOString() ?? null,
      hourlyRateCOP: row.hourlyRateCOP.toString(),
      hoursWorked: row.hoursWorked?.toString() ?? null,
      totalPayCOP: row.totalPayCOP?.toString() ?? null,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private shiftInclude = {
    staffMember: true,
  } as const;

  private async ensureMember(tenant: TenantContext, staffMemberId: string) {
    const member = await this.prisma.staffMember.findFirst({
      where: { id: staffMemberId, companyId: tenant.companyId },
    });
    if (!member) {
      throw new BadRequestException('Persona no encontrada en esta empresa');
    }
    return member;
  }

  async listMembers(tenant: TenantContext, opts: ListMembersOpts) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(Math.max(1, opts.limit), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StaffMemberWhereInput = {
      companyId: tenant.companyId,
    };
    if (opts.active === true) where.active = true;
    else if (opts.active === false) where.active = false;
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { idNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.staffMember.findMany({
        where,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.staffMember.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.formatMember(r)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNextPage: skip + rows.length < total,
      },
    };
  }

  async findMember(tenant: TenantContext, id: string) {
    const row = await this.prisma.staffMember.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Persona no encontrada');
    return this.formatMember(row);
  }

  async createMember(tenant: TenantContext, dto: CreateStaffMemberDto) {
    const row = await this.prisma.staffMember.create({
      data: {
        companyId: tenant.companyId,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        idNumber: dto.idNumber?.trim() || null,
        defaultHourlyRate: decimalFromNumber(dto.defaultHourlyRate),
        active: dto.active ?? true,
        notes: dto.notes?.trim() || null,
      },
    });
    return this.formatMember(row);
  }

  async updateMember(
    tenant: TenantContext,
    id: string,
    dto: UpdateStaffMemberDto,
  ) {
    await this.findMember(tenant, id);
    const data: Prisma.StaffMemberUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.idNumber !== undefined) data.idNumber = dto.idNumber?.trim() || null;
    if (dto.defaultHourlyRate !== undefined) {
      data.defaultHourlyRate = decimalFromNumber(dto.defaultHourlyRate);
    }
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;

    const row = await this.prisma.staffMember.update({
      where: { id },
      data,
    });
    return this.formatMember(row);
  }

  async removeMember(tenant: TenantContext, id: string) {
    await this.findMember(tenant, id);
    await this.prisma.staffMember.delete({ where: { id } });
    return { ok: true };
  }

  async listShifts(tenant: TenantContext, opts: ListShiftsOpts) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(Math.max(1, opts.limit), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StaffShiftWhereInput = {
      companyId: tenant.companyId,
    };
    if (opts.staffMemberId) where.staffMemberId = opts.staffMemberId;
    if (opts.status) where.status = opts.status;
    if (opts.dateFrom || opts.dateTo) {
      where.shiftDate = {};
      if (opts.dateFrom) {
        where.shiftDate.gte = new Date(`${opts.dateFrom}T00:00:00.000Z`);
      }
      if (opts.dateTo) {
        where.shiftDate.lte = new Date(`${opts.dateTo}T00:00:00.000Z`);
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.staffShift.findMany({
        where,
        include: this.shiftInclude,
        orderBy: [{ shiftDate: 'desc' }, { startAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.staffShift.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.formatShift(r)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNextPage: skip + rows.length < total,
      },
    };
  }

  async findShift(tenant: TenantContext, id: string) {
    const row = await this.prisma.staffShift.findFirst({
      where: { id, companyId: tenant.companyId },
      include: this.shiftInclude,
    });
    if (!row) throw new NotFoundException('Turno no encontrado');
    return this.formatShift(row);
  }

  async createShift(tenant: TenantContext, dto: CreateStaffShiftDto) {
    const member = await this.ensureMember(tenant, dto.staffMemberId);
    const startAt = parseShiftInstant(dto.startAt, 'Hora de entrada');
    const endAt = dto.endAt
      ? parseShiftInstant(dto.endAt, 'Hora de salida')
      : null;
    const hourlyRate =
      dto.hourlyRateCOP ?? decimalToNumber(member.defaultHourlyRate) ?? 0;
    const { hoursWorked, totalPayCOP } = computeShiftPay({
      startAt,
      endAt,
      hourlyRateCOP: hourlyRate,
      hoursWorkedOverride: dto.hoursWorked,
    });

    const row = await this.prisma.staffShift.create({
      data: {
        companyId: tenant.companyId,
        staffMemberId: member.id,
        shiftDate: shiftDateFromInstant(startAt),
        startAt,
        endAt,
        hourlyRateCOP: decimalFromNumber(hourlyRate),
        hoursWorked: decimalFromNumber(hoursWorked),
        totalPayCOP: decimalFromNumber(totalPayCOP),
        status: dto.status ?? (endAt ? StaffShiftStatus.CLOSED : StaffShiftStatus.OPEN),
        notes: dto.notes?.trim() || null,
      },
      include: this.shiftInclude,
    });
    return this.formatShift(row);
  }

  async updateShift(
    tenant: TenantContext,
    id: string,
    dto: UpdateStaffShiftDto,
  ) {
    const existing = await this.prisma.staffShift.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Turno no encontrado');

    const startAt =
      dto.startAt != null
        ? parseShiftInstant(dto.startAt, 'Hora de entrada')
        : existing.startAt;
    let endAt: Date | null =
      dto.endAt === null
        ? null
        : dto.endAt != null
          ? parseShiftInstant(dto.endAt, 'Hora de salida')
          : existing.endAt;
    const hourlyRate =
      dto.hourlyRateCOP ??
      decimalToNumber(existing.hourlyRateCOP) ??
      0;
    const hoursOverride =
      dto.hoursWorked === null
        ? undefined
        : dto.hoursWorked !== undefined
          ? dto.hoursWorked
          : decimalToNumber(existing.hoursWorked);

    const { hoursWorked, totalPayCOP } = computeShiftPay({
      startAt,
      endAt,
      hourlyRateCOP: hourlyRate,
      hoursWorkedOverride: hoursOverride,
    });

    let status = dto.status ?? existing.status;
    if (dto.status == null) {
      if (endAt && status === StaffShiftStatus.OPEN) {
        status = StaffShiftStatus.CLOSED;
      }
    }

    const row = await this.prisma.staffShift.update({
      where: { id },
      data: {
        shiftDate: shiftDateFromInstant(startAt),
        startAt,
        endAt,
        hourlyRateCOP: decimalFromNumber(hourlyRate),
        hoursWorked: decimalFromNumber(hoursWorked),
        totalPayCOP: decimalFromNumber(totalPayCOP),
        status,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      },
      include: this.shiftInclude,
    });
    return this.formatShift(row);
  }

  async removeShift(tenant: TenantContext, id: string) {
    await this.findShift(tenant, id);
    await this.prisma.staffShift.delete({ where: { id } });
    return { ok: true };
  }

  async summary(tenant: TenantContext, dateFrom?: string, dateTo?: string) {
    const where: Prisma.StaffShiftWhereInput = {
      companyId: tenant.companyId,
    };
    if (dateFrom || dateTo) {
      where.shiftDate = {};
      if (dateFrom) {
        where.shiftDate.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        where.shiftDate.lte = new Date(`${dateTo}T00:00:00.000Z`);
      }
    }

    const rows = await this.prisma.staffShift.findMany({
      where,
      select: {
        hoursWorked: true,
        totalPayCOP: true,
        status: true,
      },
    });

    let totalHours = 0;
    let totalPay = 0;
    let openShifts = 0;
    for (const row of rows) {
      totalHours += decimalToNumber(row.hoursWorked) ?? 0;
      totalPay += decimalToNumber(row.totalPayCOP) ?? 0;
      if (row.status === StaffShiftStatus.OPEN) openShifts++;
    }

    return {
      shiftCount: rows.length,
      openShifts,
      totalHours: Math.round(totalHours * 100) / 100,
      totalPayCOP: Math.round(totalPay),
    };
  }
}
