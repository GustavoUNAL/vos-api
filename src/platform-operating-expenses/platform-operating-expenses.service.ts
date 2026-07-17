import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OperatingExpenseKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import type {
  UpsertMonthUtilitiesDto,
  UpsertOperatingExpenseDto,
} from './dto/operating-expense.dto';

function monthStartDate(raw: string): Date {
  const trimmed = raw.trim();
  const ym = trimmed.length === 7 ? `${trimmed}-01` : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ym)) {
    throw new BadRequestException('expenseMonth inválido (usa YYYY-MM)');
  }
  const day = ym.slice(8, 10);
  if (day !== '01') {
    // force first of month
  }
  const key = `${ym.slice(0, 7)}-01`;
  return new Date(`${key}T00:00:00.000Z`);
}

function monthKeyFromDate(d: Date): string {
  return d.toISOString().slice(0, 7);
}

@Injectable()
export class PlatformOperatingExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenant: TenantContext,
    opts?: { dateFrom?: string; dateTo?: string },
  ) {
    const where: Prisma.OperatingExpenseWhereInput = {
      companyId: tenant.companyId,
    };

    if (opts?.dateFrom || opts?.dateTo) {
      const from = opts.dateFrom
        ? monthStartDate(opts.dateFrom.slice(0, 7))
        : undefined;
      const to = opts.dateTo
        ? monthStartDate(opts.dateTo.slice(0, 7))
        : undefined;
      where.expenseMonth = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const rows = await this.prisma.operatingExpense.findMany({
      where,
      orderBy: [{ expenseMonth: 'desc' }, { kind: 'asc' }],
    });

    return rows.map((r) => this.serialize(r));
  }

  async monthSnapshot(tenant: TenantContext, expenseMonth: string) {
    const month = monthStartDate(expenseMonth);
    const rows = await this.prisma.operatingExpense.findMany({
      where: { companyId: tenant.companyId, expenseMonth: month },
    });
    const byKind = Object.fromEntries(
      rows.map((r) => [r.kind, Number(r.amountCOP)]),
    ) as Partial<Record<OperatingExpenseKind, number>>;
    return {
      expenseMonth: monthKeyFromDate(month),
      aguaCOP: byKind.AGUA ?? 0,
      energiaCOP: byKind.ENERGIA ?? 0,
      internetCOP: byKind.INTERNET ?? 0,
      otherCOP: byKind.OTHER ?? 0,
      totalCOP:
        (byKind.AGUA ?? 0) +
        (byKind.ENERGIA ?? 0) +
        (byKind.INTERNET ?? 0) +
        (byKind.OTHER ?? 0),
      items: rows.map((r) => this.serialize(r)),
    };
  }

  async upsert(tenant: TenantContext, dto: UpsertOperatingExpenseDto) {
    const month = monthStartDate(dto.expenseMonth);
    const amount = Math.round(dto.amountCOP);
    const row = await this.prisma.operatingExpense.upsert({
      where: {
        companyId_kind_expenseMonth: {
          companyId: tenant.companyId,
          kind: dto.kind,
          expenseMonth: month,
        },
      },
      create: {
        companyId: tenant.companyId,
        kind: dto.kind,
        expenseMonth: month,
        amountCOP: new Prisma.Decimal(amount),
        notes: dto.notes?.trim() || null,
      },
      update: {
        amountCOP: new Prisma.Decimal(amount),
        notes: dto.notes?.trim() || null,
      },
    });
    return this.serialize(row);
  }

  async upsertMonthUtilities(
    tenant: TenantContext,
    dto: UpsertMonthUtilitiesDto,
  ) {
    const kinds: Array<{
      kind: OperatingExpenseKind;
      amount: number | undefined;
    }> = [
      { kind: OperatingExpenseKind.AGUA, amount: dto.aguaCOP },
      { kind: OperatingExpenseKind.ENERGIA, amount: dto.energiaCOP },
      { kind: OperatingExpenseKind.INTERNET, amount: dto.internetCOP },
    ];

    for (const entry of kinds) {
      if (entry.amount == null || !Number.isFinite(entry.amount)) continue;
      await this.upsert(tenant, {
        kind: entry.kind,
        expenseMonth: dto.expenseMonth,
        amountCOP: entry.amount,
        notes: dto.notes,
      });
    }
    return this.monthSnapshot(tenant, dto.expenseMonth);
  }

  async remove(tenant: TenantContext, id: string) {
    const existing = await this.prisma.operatingExpense.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    await this.prisma.operatingExpense.delete({ where: { id } });
    return { ok: true };
  }

  private serialize(row: {
    id: string;
    kind: OperatingExpenseKind;
    expenseMonth: Date;
    amountCOP: Prisma.Decimal;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      kind: row.kind,
      expenseMonth: monthKeyFromDate(row.expenseMonth),
      amountCOP: Math.round(Number(row.amountCOP)),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
