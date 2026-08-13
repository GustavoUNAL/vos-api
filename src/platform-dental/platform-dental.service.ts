import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

@Injectable()
export class PlatformDentalService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenant: TenantContext) {
    const companyId = tenant.companyId;
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const [
      patientsCount,
      upcomingAppointments,
      cancelledYear,
      attendedYear,
      notAttendedYear,
      incomesCount,
      expensesCount,
      sites,
    ] = await Promise.all([
      this.prisma.dentalPatient.count({ where: { companyId } }),
      this.prisma.dentalAppointment.count({
        where: { companyId, startsAt: { gte: now }, status: { not: 'cancelada' } },
      }),
      this.prisma.dentalAppointment.count({
        where: {
          companyId,
          startsAt: { gte: yearStart },
          status: 'cancelada',
        },
      }),
      this.prisma.dentalAppointment.count({
        where: {
          companyId,
          startsAt: { gte: yearStart },
          status: 'atendida',
        },
      }),
      this.prisma.dentalAppointment.count({
        where: {
          companyId,
          startsAt: { gte: yearStart },
          status: 'no_atendida',
        },
      }),
      this.prisma.dentalIncome.count({ where: { companyId } }),
      this.prisma.dentalExpense.count({ where: { companyId } }),
      this.prisma.dentalSite.findMany({
        where: { companyId, active: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const recentPatients = await this.prisma.dentalPatient.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const nextAppointments = await this.prisma.dentalAppointment.findMany({
      where: { companyId, startsAt: { gte: now } },
      include: { patient: { select: { id: true, fullName: true } } },
      orderBy: { startsAt: 'asc' },
      take: 8,
    });

    return {
      patientsCount,
      upcomingAppointments,
      cancelledYear,
      indicators: {
        attended: attendedYear,
        notAttended: notAttendedYear,
        cancelled: cancelledYear,
      },
      incomesCount,
      expensesCount,
      sites,
      recentPatients,
      nextAppointments,
    };
  }

  listSites(tenant: TenantContext) {
    return this.prisma.dentalSite.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { name: 'asc' },
    });
  }

  async ensureDefaultSite(tenant: TenantContext) {
    const existing = await this.prisma.dentalSite.findFirst({
      where: { companyId: tenant.companyId },
    });
    if (existing) return existing;
    return this.prisma.dentalSite.create({
      data: {
        companyId: tenant.companyId,
        name: tenant.companyName || 'Consultorio',
        active: true,
      },
    });
  }

  listPatients(tenant: TenantContext, q?: string) {
    return this.prisma.dentalPatient.findMany({
      where: {
        companyId: tenant.companyId,
        ...(q?.trim()
          ? {
              OR: [
                { fullName: { contains: q.trim(), mode: 'insensitive' } },
                { documentNumber: { contains: q.trim(), mode: 'insensitive' } },
                { email: { contains: q.trim(), mode: 'insensitive' } },
                { phone: { contains: q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: 'asc' },
      include: { site: { select: { id: true, name: true } } },
    });
  }

  async getPatient(tenant: TenantContext, id: string) {
    const row = await this.prisma.dentalPatient.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        site: true,
        appointments: { orderBy: { startsAt: 'desc' }, take: 20 },
        incomes: { orderBy: { incomeDate: 'desc' }, take: 20 },
      },
    });
    if (!row) throw new NotFoundException('Paciente no encontrado');
    return row;
  }

  async createPatient(
    tenant: TenantContext,
    data: {
      fullName: string;
      documentType?: string;
      documentNumber: string;
      birthDate?: string;
      gender?: string;
      bloodType?: string;
      maritalStatus?: string;
      occupation?: string;
      phone?: string;
      email?: string;
      address?: string;
      city?: string;
      country?: string;
      insurer?: string;
      coverage?: string;
      notes?: string;
      siteId?: string;
    },
  ) {
    if (!data.fullName?.trim() || !data.documentNumber?.trim()) {
      throw new BadRequestException('Nombre y documento son obligatorios');
    }
    return this.prisma.dentalPatient.create({
      data: {
        companyId: tenant.companyId,
        fullName: data.fullName.trim(),
        documentType: data.documentType?.trim() || 'cc',
        documentNumber: data.documentNumber.trim(),
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        gender: data.gender ?? null,
        bloodType: data.bloodType ?? null,
        maritalStatus: data.maritalStatus ?? null,
        occupation: data.occupation ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        city: data.city ?? null,
        country: data.country ?? 'Colombia',
        insurer: data.insurer ?? null,
        coverage: data.coverage ?? null,
        notes: data.notes ?? null,
        siteId: data.siteId || null,
        clinicalHistory: {
          anamnesis: [],
          odontogramas: [],
          presupuestos: [],
          tratamientos: [],
          consentimientos: [],
          evoluciones: [],
          remisiones: [],
          formulas: [],
          periodontogramas: [],
          incapacidades: [],
        },
        odontogram: { type: 'permanente', teeth: {}, observations: [] },
      },
    });
  }

  async updatePatient(
    tenant: TenantContext,
    id: string,
    data: Record<string, unknown>,
  ) {
    await this.getPatient(tenant, id);
    const birthDate =
      typeof data.birthDate === 'string' && data.birthDate
        ? new Date(data.birthDate)
        : data.birthDate === null
          ? null
          : undefined;
    return this.prisma.dentalPatient.update({
      where: { id },
      data: {
        ...(typeof data.fullName === 'string'
          ? { fullName: data.fullName.trim() }
          : {}),
        ...(typeof data.documentType === 'string'
          ? { documentType: data.documentType }
          : {}),
        ...(typeof data.documentNumber === 'string'
          ? { documentNumber: data.documentNumber.trim() }
          : {}),
        ...(birthDate !== undefined ? { birthDate } : {}),
        ...(data.gender !== undefined
          ? { gender: (data.gender as string) || null }
          : {}),
        ...(data.bloodType !== undefined
          ? { bloodType: (data.bloodType as string) || null }
          : {}),
        ...(data.maritalStatus !== undefined
          ? { maritalStatus: (data.maritalStatus as string) || null }
          : {}),
        ...(data.occupation !== undefined
          ? { occupation: (data.occupation as string) || null }
          : {}),
        ...(data.phone !== undefined
          ? { phone: (data.phone as string) || null }
          : {}),
        ...(data.email !== undefined
          ? { email: (data.email as string) || null }
          : {}),
        ...(data.address !== undefined
          ? { address: (data.address as string) || null }
          : {}),
        ...(data.city !== undefined
          ? { city: (data.city as string) || null }
          : {}),
        ...(data.country !== undefined
          ? { country: (data.country as string) || null }
          : {}),
        ...(data.insurer !== undefined
          ? { insurer: (data.insurer as string) || null }
          : {}),
        ...(data.coverage !== undefined
          ? { coverage: (data.coverage as string) || null }
          : {}),
        ...(data.notes !== undefined
          ? { notes: (data.notes as string) || null }
          : {}),
        ...(data.siteId !== undefined
          ? { siteId: (data.siteId as string) || null }
          : {}),
        ...(data.odontogram !== undefined
          ? { odontogram: data.odontogram as Prisma.InputJsonValue }
          : {}),
        ...(data.clinicalHistory !== undefined
          ? { clinicalHistory: data.clinicalHistory as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async deleteAppointment(tenant: TenantContext, id: string) {
    const row = await this.prisma.dentalAppointment.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Cita no encontrada');
    await this.prisma.dentalIncome.updateMany({
      where: { companyId: tenant.companyId, appointmentId: id },
      data: { appointmentId: null },
    });
    await this.prisma.dentalAppointment.delete({ where: { id } });
    return { ok: true };
  }

  async deleteExpense(tenant: TenantContext, id: string) {
    const row = await this.prisma.dentalExpense.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Gasto no encontrado');
    await this.prisma.dentalExpense.delete({ where: { id } });
    return { ok: true };
  }

  async deletePatient(tenant: TenantContext, id: string) {
    const row = await this.prisma.dentalPatient.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Paciente no encontrado');
    await this.prisma.dentalAppointment.deleteMany({
      where: { companyId: tenant.companyId, patientId: id },
    });
    await this.prisma.dentalIncome.updateMany({
      where: { companyId: tenant.companyId, patientId: id },
      data: { patientId: null },
    });
    await this.prisma.dentalPatient.delete({ where: { id } });
    return { ok: true };
  }

  listAppointments(tenant: TenantContext, date?: string) {
    const include = {
      patient: { select: { id: true, fullName: true } },
      site: { select: { id: true, name: true } },
      procedure: true,
      incomes: { select: { id: true, amount: true, number: true, status: true } },
    } as const;
    if (!date) {
      return this.prisma.dentalAppointment.findMany({
        where: { companyId: tenant.companyId },
        include,
        orderBy: { startsAt: 'asc' },
      });
    }
    const dayStart = new Date(`${date}T05:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.dentalAppointment.findMany({
      where: {
        companyId: tenant.companyId,
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      include,
      orderBy: { startsAt: 'asc' },
    });
  }

  createAppointment(
    tenant: TenantContext,
    data: {
      patientId?: string;
      siteId?: string;
      startsAt: string;
      endsAt?: string;
      kind?: string;
      status?: string;
      room?: string;
      notes?: string;
      procedureId?: string;
      procedureName?: string;
      estimatedCost?: number;
      durationMin?: number;
    },
  ) {
    if (!data.startsAt) throw new BadRequestException('startsAt requerido');
    const duration = data.durationMin ?? 30;
    const startsAt = new Date(data.startsAt);
    const endsAt = data.endsAt
      ? new Date(data.endsAt)
      : new Date(startsAt.getTime() + duration * 60_000);
    return this.prisma.dentalAppointment.create({
      data: {
        companyId: tenant.companyId,
        patientId: data.patientId || null,
        siteId: data.siteId || null,
        procedureId: data.procedureId || null,
        procedureName: data.procedureName || null,
        estimatedCost:
          data.estimatedCost != null
            ? new Prisma.Decimal(data.estimatedCost)
            : null,
        durationMin: duration,
        startsAt,
        endsAt,
        kind: data.kind || 'tratamiento',
        status: data.status || 'confirmada',
        room: data.room || 'CONSULTORIO 1',
        notes: data.notes || null,
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        procedure: true,
        incomes: { select: { id: true, amount: true, number: true } },
      },
    });
  }

  async updateAppointment(
    tenant: TenantContext,
    id: string,
    data: Record<string, unknown>,
  ) {
    const row = await this.prisma.dentalAppointment.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Cita no encontrada');
    const durationMin =
      typeof data.durationMin === 'number'
        ? data.durationMin
        : typeof data.durationMin === 'string'
          ? Number(data.durationMin)
          : undefined;
    const startsAt =
      typeof data.startsAt === 'string' ? new Date(data.startsAt) : undefined;
    let endsAt: Date | undefined;
    if (typeof data.endsAt === 'string') endsAt = new Date(data.endsAt);
    else if (startsAt && durationMin) {
      endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
    }
    return this.prisma.dentalAppointment.update({
      where: { id },
      data: {
        ...(typeof data.status === 'string' ? { status: data.status } : {}),
        ...(typeof data.kind === 'string' ? { kind: data.kind } : {}),
        ...(typeof data.notes === 'string' ? { notes: data.notes } : {}),
        ...(typeof data.patientId === 'string'
          ? { patientId: data.patientId || null }
          : {}),
        ...(typeof data.procedureId === 'string'
          ? { procedureId: data.procedureId || null }
          : {}),
        ...(typeof data.procedureName === 'string'
          ? { procedureName: data.procedureName }
          : {}),
        ...(data.estimatedCost != null
          ? { estimatedCost: new Prisma.Decimal(Number(data.estimatedCost)) }
          : {}),
        ...(data.chargedAmount != null
          ? { chargedAmount: new Prisma.Decimal(Number(data.chargedAmount)) }
          : {}),
        ...(durationMin != null ? { durationMin } : {}),
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {}),
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        procedure: true,
        incomes: { select: { id: true, amount: true, number: true } },
      },
    });
  }

  /** Cobra una cita: crea ingreso ligado y marca chargedAmount. */
  async chargeAppointment(
    tenant: TenantContext,
    appointmentId: string,
    data: {
      amount?: number;
      paymentMethod?: string;
      incomeDate?: string;
      notes?: string;
    },
  ) {
    const appt = await this.prisma.dentalAppointment.findFirst({
      where: { id: appointmentId, companyId: tenant.companyId },
    });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    const amount = Number(
      data.amount ?? appt.estimatedCost ?? appt.chargedAmount ?? 0,
    );
    if (!amount || amount <= 0) {
      throw new BadRequestException('Monto de cobro inválido');
    }
    const income = await this.createIncome(tenant, {
      patientId: appt.patientId ?? undefined,
      siteId: appt.siteId ?? undefined,
      appointmentId,
      incomeDate: data.incomeDate || new Date().toISOString().slice(0, 10),
      amount,
      paymentMethod: data.paymentMethod || 'Efectivo',
      notes:
        data.notes ||
        `Cobro cita ${appt.procedureName || appt.kind || appointmentId}`,
    });
    await this.prisma.dentalAppointment.update({
      where: { id: appointmentId },
      data: {
        chargedAmount: new Prisma.Decimal(amount),
        status: appt.status === 'confirmada' ? 'atendida' : appt.status,
      },
    });
    return income;
  }

  listProcedures(tenant: TenantContext) {
    return this.prisma.dentalProcedure.findMany({
      where: { companyId: tenant.companyId, active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async ensureDefaultProcedures(tenant: TenantContext) {
    const count = await this.prisma.dentalProcedure.count({
      where: { companyId: tenant.companyId },
    });
    if (count > 0) return this.listProcedures(tenant);
    const defaults = [
      { name: 'Valoración odontológica', category: 'consulta', unitPrice: 60000, durationMin: 30 },
      { name: 'Consulta general', category: 'consulta', unitPrice: 80000, durationMin: 40 },
      { name: 'Limpieza dental', category: 'prevencion', unitPrice: 120000, durationMin: 45 },
      { name: 'Resina simple', category: 'operatoria', unitPrice: 140000, durationMin: 60 },
      { name: 'Extracción simple', category: 'cirugia', unitPrice: 150000, durationMin: 45 },
      { name: 'Radiografía periapical', category: 'diagnostico', unitPrice: 35000, durationMin: 15 },
    ];
    for (const p of defaults) {
      await this.prisma.dentalProcedure.create({
        data: {
          companyId: tenant.companyId,
          name: p.name,
          category: p.category,
          unitPrice: new Prisma.Decimal(p.unitPrice),
          durationMin: p.durationMin,
          active: true,
        },
      });
    }
    return this.listProcedures(tenant);
  }

  createProcedure(
    tenant: TenantContext,
    data: {
      name: string;
      category?: string;
      unitPrice: number;
      durationMin?: number;
    },
  ) {
    if (!data.name?.trim() || data.unitPrice == null) {
      throw new BadRequestException('Nombre y precio son obligatorios');
    }
    return this.prisma.dentalProcedure.create({
      data: {
        companyId: tenant.companyId,
        name: data.name.trim(),
        category: data.category || 'general',
        unitPrice: new Prisma.Decimal(data.unitPrice),
        durationMin: data.durationMin ?? 30,
        active: true,
      },
    });
  }

  listBudgets(tenant: TenantContext, patientId?: string) {
    return this.prisma.dentalBudget.findMany({
      where: {
        companyId: tenant.companyId,
        ...(patientId ? { patientId } : {}),
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        appointment: { select: { id: true, startsAt: true, procedureName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createBudget(
    tenant: TenantContext,
    data: {
      patientId: string;
      appointmentId?: string;
      title: string;
      lines: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        teeth?: string;
      }>;
      notes?: string;
      status?: string;
    },
  ) {
    if (!data.patientId || !data.title?.trim() || !data.lines?.length) {
      throw new BadRequestException('Paciente, título y líneas son obligatorios');
    }
    const normalized = data.lines.map((l) => ({
      name: l.name,
      quantity: Number(l.quantity) || 1,
      unitPrice: Number(l.unitPrice) || 0,
      teeth: l.teeth || '',
      subtotal: (Number(l.quantity) || 1) * (Number(l.unitPrice) || 0),
    }));
    const subtotal = normalized.reduce((s, l) => s + l.subtotal, 0);
    return this.prisma.dentalBudget.create({
      data: {
        companyId: tenant.companyId,
        patientId: data.patientId,
        appointmentId: data.appointmentId || null,
        title: data.title.trim(),
        status: data.status || 'Pendiente',
        lines: normalized,
        subtotal: new Prisma.Decimal(subtotal),
        total: new Prisma.Decimal(subtotal),
        notes: data.notes || null,
      },
      include: { patient: { select: { id: true, fullName: true } } },
    });
  }

  async approveBudget(tenant: TenantContext, id: string) {
    const row = await this.prisma.dentalBudget.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Presupuesto no encontrado');
    return this.prisma.dentalBudget.update({
      where: { id },
      data: { status: 'Aprobado' },
    });
  }

  listFinancings(tenant: TenantContext) {
    return this.prisma.dentalFinancing.findMany({
      where: { companyId: tenant.companyId },
      include: {
        patient: { select: { id: true, fullName: true } },
        budget: { select: { id: true, title: true, total: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createFinancing(
    tenant: TenantContext,
    data: {
      patientId?: string;
      budgetId?: string;
      amount: number;
      initialPayment?: number;
      installments?: number;
      status?: string;
      notes?: string;
    },
  ) {
    if (data.amount == null) throw new BadRequestException('Monto requerido');
    const initial = Number(data.initialPayment ?? 0);
    const installments = Number(data.installments ?? 0);
    const remaining = Math.max(0, Number(data.amount) - initial);
    const installmentValue =
      installments > 0 ? Math.round(remaining / installments) : 0;
    return this.prisma.dentalFinancing.create({
      data: {
        companyId: tenant.companyId,
        patientId: data.patientId || null,
        budgetId: data.budgetId || null,
        amount: new Prisma.Decimal(data.amount),
        initialPayment: new Prisma.Decimal(initial),
        installments,
        installmentValue: new Prisma.Decimal(installmentValue),
        status: data.status || 'en_tramite',
        notes: data.notes || null,
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        budget: { select: { id: true, title: true, total: true } },
      },
    });
  }

  async updateFinancingStatus(
    tenant: TenantContext,
    id: string,
    status: string,
  ) {
    const row = await this.prisma.dentalFinancing.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Financiamiento no encontrado');
    return this.prisma.dentalFinancing.update({
      where: { id },
      data: { status },
    });
  }

  async costsSummary(tenant: TenantContext) {
    const [incomes, expenses, appts, financings, budgets] = await Promise.all([
      this.prisma.dentalIncome.findMany({
        where: { companyId: tenant.companyId },
        select: { amount: true },
      }),
      this.prisma.dentalExpense.findMany({
        where: { companyId: tenant.companyId },
        select: { amount: true },
      }),
      this.prisma.dentalAppointment.findMany({
        where: { companyId: tenant.companyId },
        select: { estimatedCost: true, chargedAmount: true, status: true },
      }),
      this.listFinancings(tenant),
      this.listBudgets(tenant),
    ]);
    const sum = (rows: { amount: Prisma.Decimal | null }[]) =>
      rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const incomeTotal = sum(incomes);
    const expenseTotal = sum(expenses);
    const estimatedPipeline = appts.reduce(
      (s, a) => s + Number(a.estimatedCost ?? 0),
      0,
    );
    const chargedTotal = appts.reduce(
      (s, a) => s + Number(a.chargedAmount ?? 0),
      0,
    );
    return {
      incomeTotal,
      expenseTotal,
      net: incomeTotal - expenseTotal,
      estimatedPipeline,
      chargedTotal,
      pendingBudgets: budgets.filter((b) => b.status === 'Pendiente').length,
      financingsByStatus: {
        en_tramite: financings.filter((f) => f.status === 'en_tramite').length,
        pendiente_desembolso: financings.filter(
          (f) => f.status === 'pendiente_desembolso',
        ).length,
        desembolsado: financings.filter((f) => f.status === 'desembolsado')
          .length,
      },
      financingAmounts: {
        en_tramite: financings
          .filter((f) => f.status === 'en_tramite')
          .reduce((s, f) => s + Number(f.amount), 0),
        pendiente_desembolso: financings
          .filter((f) => f.status === 'pendiente_desembolso')
          .reduce((s, f) => s + Number(f.amount), 0),
        desembolsado: financings
          .filter((f) => f.status === 'desembolsado')
          .reduce((s, f) => s + Number(f.amount), 0),
      },
    };
  }

  listIncomes(tenant: TenantContext, q?: string) {
    return this.prisma.dentalIncome.findMany({
      where: {
        companyId: tenant.companyId,
        ...(q?.trim()
          ? {
              OR: [
                {
                  patient: {
                    fullName: { contains: q.trim(), mode: 'insensitive' },
                  },
                },
                { notes: { contains: q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ incomeDate: 'desc' }, { number: 'desc' }],
    });
  }

  async createIncome(
    tenant: TenantContext,
    data: {
      patientId?: string;
      siteId?: string;
      appointmentId?: string;
      incomeDate: string;
      amount: number;
      paymentMethod?: string;
      status?: string;
      notes?: string;
    },
  ) {
    if (!data.incomeDate || data.amount == null) {
      throw new BadRequestException('Fecha y valor son obligatorios');
    }
    const last = await this.prisma.dentalIncome.findFirst({
      where: { companyId: tenant.companyId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return this.prisma.dentalIncome.create({
      data: {
        companyId: tenant.companyId,
        patientId: data.patientId || null,
        siteId: data.siteId || null,
        appointmentId: data.appointmentId || null,
        number: (last?.number ?? 0) + 1,
        incomeDate: new Date(data.incomeDate),
        amount: new Prisma.Decimal(data.amount),
        paymentMethod: data.paymentMethod || null,
        status: data.status || 'Creado',
        notes: data.notes || null,
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        site: { select: { id: true, name: true } },
        appointment: {
          select: { id: true, procedureName: true, startsAt: true },
        },
      },
    });
  }

  async deleteIncome(tenant: TenantContext, id: string) {
    const row = await this.prisma.dentalIncome.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Ingreso no encontrado');
    await this.prisma.dentalIncome.delete({ where: { id } });
    return { ok: true };
  }

  listExpenses(tenant: TenantContext, q?: string) {
    return this.prisma.dentalExpense.findMany({
      where: {
        companyId: tenant.companyId,
        ...(q?.trim()
          ? {
              OR: [
                { concept: { contains: q.trim(), mode: 'insensitive' } },
                { provider: { contains: q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { site: { select: { id: true, name: true } } },
      orderBy: { expenseDate: 'desc' },
    });
  }

  createExpense(
    tenant: TenantContext,
    data: {
      expenseDate: string;
      concept: string;
      amount: number;
      provider?: string;
      expenseType?: string;
      siteId?: string;
      status?: string;
      notes?: string;
    },
  ) {
    if (!data.concept?.trim() || data.amount == null || !data.expenseDate) {
      throw new BadRequestException('Concepto, fecha y valor son obligatorios');
    }
    return this.prisma.dentalExpense.create({
      data: {
        companyId: tenant.companyId,
        expenseDate: new Date(data.expenseDate),
        concept: data.concept.trim(),
        amount: new Prisma.Decimal(data.amount),
        provider: data.provider || null,
        expenseType: data.expenseType || null,
        siteId: data.siteId || null,
        status: data.status || 'Registrado',
        notes: data.notes || null,
      },
      include: { site: { select: { id: true, name: true } } },
    });
  }

  listSterilizations(tenant: TenantContext) {
    return this.prisma.dentalSterilization.findMany({
      where: { companyId: tenant.companyId },
      include: { site: { select: { id: true, name: true } } },
      orderBy: { loadDate: 'desc' },
    });
  }

  createSterilization(
    tenant: TenantContext,
    data: {
      loadDate: string;
      equipment?: string;
      cycle?: string;
      result?: string;
      notes?: string;
      siteId?: string;
    },
  ) {
    return this.prisma.dentalSterilization.create({
      data: {
        companyId: tenant.companyId,
        loadDate: new Date(data.loadDate || Date.now()),
        equipment: data.equipment || null,
        cycle: data.cycle || null,
        result: data.result || 'OK',
        notes: data.notes || null,
        siteId: data.siteId || null,
      },
    });
  }

  listWastes(tenant: TenantContext, q?: string) {
    return this.prisma.dentalWaste.findMany({
      where: {
        companyId: tenant.companyId,
        ...(q?.trim()
          ? {
              OR: [
                { wasteType: { contains: q.trim(), mode: 'insensitive' } },
                { classification: { contains: q.trim(), mode: 'insensitive' } },
                { bagColor: { contains: q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { site: { select: { id: true, name: true } } },
      orderBy: { wasteDate: 'desc' },
    });
  }

  createWaste(
    tenant: TenantContext,
    data: {
      wasteDate: string;
      wasteType: string;
      classification?: string;
      bagColor?: string;
      weightKg?: number;
      notes?: string;
      siteId?: string;
    },
  ) {
    if (!data.wasteType?.trim() || !data.wasteDate) {
      throw new BadRequestException('Tipo y fecha son obligatorios');
    }
    return this.prisma.dentalWaste.create({
      data: {
        companyId: tenant.companyId,
        wasteDate: new Date(data.wasteDate),
        wasteType: data.wasteType.trim(),
        classification: data.classification || null,
        bagColor: data.bagColor || null,
        weightKg:
          data.weightKg != null ? new Prisma.Decimal(data.weightKg) : null,
        notes: data.notes || null,
        siteId: data.siteId || null,
      },
    });
  }

  listTempLogs(
    tenant: TenantContext,
    opts: { year?: number; month?: number; siteId?: string },
  ) {
    const year = opts.year ?? new Date().getFullYear();
    const month = opts.month ?? new Date().getMonth() + 1;
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);
    return this.prisma.dentalTempHumidityLog.findMany({
      where: {
        companyId: tenant.companyId,
        logDate: { gte: from, lt: to },
        ...(opts.siteId ? { siteId: opts.siteId } : {}),
      },
      include: { site: { select: { id: true, name: true } } },
      orderBy: { logDate: 'asc' },
    });
  }

  createTempLog(
    tenant: TenantContext,
    data: {
      logDate: string;
      deviceName?: string;
      temperatureC?: number;
      humidityPct?: number;
      observations?: string;
      siteId?: string;
    },
  ) {
    if (!data.logDate) throw new BadRequestException('Fecha requerida');
    return this.prisma.dentalTempHumidityLog.create({
      data: {
        companyId: tenant.companyId,
        logDate: new Date(data.logDate),
        deviceName: data.deviceName || null,
        temperatureC:
          data.temperatureC != null
            ? new Prisma.Decimal(data.temperatureC)
            : null,
        humidityPct:
          data.humidityPct != null
            ? new Prisma.Decimal(data.humidityPct)
            : null,
        observations: data.observations || null,
        siteId: data.siteId || null,
      },
    });
  }
}
