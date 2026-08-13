/**
 * Datos de simulación Lexandra Odontología — cubre pacientes, agenda, ingresos,
 * presupuestos, financiamiento, gastos, bioseguridad e inventario.
 * Uso: npm run db:seed-dental-demo
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const COMPANY_ID = 'seed-lexandra-odontologia';
const SITE_ID = 'seed-lexandra-site-chucunes';

type PatientSeed = {
  documentNumber: string;
  fullName: string;
  gender: string;
  phone: string;
  email: string;
  city: string;
  occupation: string;
  notes: string;
  treatment?: string;
};

const PATIENTS: PatientSeed[] = [
  {
    documentNumber: '1144097955',
    fullName: 'Gustavo Adolfo Arteaga Estacio',
    gender: 'Masculino',
    phone: '3140000000',
    email: 'gustavoarteaga0508@gmail.com',
    city: 'Pasto',
    occupation: 'Desarrollador',
    notes: 'Paciente nuevo. Motivo: valoración odontológica.',
    treatment: 'Valoración odontológica',
  },
  {
    documentNumber: '1085123456',
    fullName: 'María Fernanda López Ruiz',
    gender: 'Femenino',
    phone: '3151112233',
    email: 'maria.lopez@example.com',
    city: 'Pasto',
    occupation: 'Contadora',
    notes: 'Control de higiene y profilaxis.',
    treatment: 'Limpieza dental',
  },
  {
    documentNumber: '1085987654',
    fullName: 'Carlos Andrés Gómez Pérez',
    gender: 'Masculino',
    phone: '3004445566',
    email: 'carlos.gomez@example.com',
    city: 'Ipiales',
    occupation: 'Ingeniero',
    notes: 'Resina en molar superior.',
    treatment: 'Resina simple',
  },
  {
    documentNumber: '52789123',
    fullName: 'Ana Sofía Bastidas Mejía',
    gender: 'Femenino',
    phone: '3017778899',
    email: 'ana.bastidas@example.com',
    city: 'Pasto',
    occupation: 'Diseñadora',
    notes: 'Plan estético — blanqueamiento pendiente.',
    treatment: 'Consulta general',
  },
  {
    documentNumber: '1085456789',
    fullName: 'Julián David Rueda Castro',
    gender: 'Masculino',
    phone: '3162223344',
    email: 'julian.rueda@example.com',
    city: 'Túquerres',
    occupation: 'Comerciante',
    notes: 'Extracción programada.',
    treatment: 'Extracción simple',
  },
  {
    documentNumber: '1085333444',
    fullName: 'Valentina Ortega Hidalgo',
    gender: 'Femenino',
    phone: '3125556677',
    email: 'valentina.ortega@example.com',
    city: 'Pasto',
    occupation: 'Médica',
    notes: 'Dolor molar · posible endodoncia.',
    treatment: 'Consulta general',
  },
  {
    documentNumber: '1085666777',
    fullName: 'Sebastián Quintero Díaz',
    gender: 'Masculino',
    phone: '3188889900',
    email: 'sebastian.quintero@example.com',
    city: 'Pasto',
    occupation: 'Arquitecto',
    notes: 'Control post-limpieza.',
    treatment: 'Limpieza dental',
  },
  {
    documentNumber: '52998877',
    fullName: 'Camila Andrea Narváez',
    gender: 'Femenino',
    phone: '3001122334',
    email: 'camila.narvaez@example.com',
    city: 'Ipiales',
    occupation: 'Docente',
    notes: 'Brackets — control mensual.',
    treatment: 'Consulta general',
  },
  {
    documentNumber: '1085777888',
    fullName: 'Andrés Felipe Melo',
    gender: 'Masculino',
    phone: '3156677889',
    email: 'andres.melo@example.com',
    city: 'Pasto',
    occupation: 'Abogado',
    notes: 'Sensibilidad dentaria.',
    treatment: 'Radiografía periapical',
  },
  {
    documentNumber: '1085999000',
    fullName: 'Laura Catalina Pantoja',
    gender: 'Femenino',
    phone: '3174455667',
    email: 'laura.pantoja@example.com',
    city: 'Tumaco',
    occupation: 'Enfermera',
    notes: 'Primera vez en el consultorio.',
    treatment: 'Valoración odontológica',
  },
  {
    documentNumber: '1085111222',
    fullName: 'Diego Armando Ceballos',
    gender: 'Masculino',
    phone: '3193344556',
    email: 'diego.ceballos@example.com',
    city: 'Pasto',
    occupation: 'Chef',
    notes: 'Corona provisional.',
    treatment: 'Resina simple',
  },
  {
    documentNumber: '52887766',
    fullName: 'Isabella Rincón Vargas',
    gender: 'Femenino',
    phone: '3019988776',
    email: 'isabella.rincon@example.com',
    city: 'Pasto',
    occupation: 'Psicóloga',
    notes: 'Blanqueamiento en seguimiento.',
    treatment: 'Blanqueamiento dental',
  },
];

const PROCEDURES = [
  { name: 'Valoración odontológica', category: 'consulta', unitPrice: 60000, durationMin: 30 },
  { name: 'Consulta general', category: 'consulta', unitPrice: 80000, durationMin: 40 },
  { name: 'Limpieza dental', category: 'prevencion', unitPrice: 120000, durationMin: 45 },
  { name: 'Resina simple', category: 'operatoria', unitPrice: 140000, durationMin: 60 },
  { name: 'Extracción simple', category: 'cirugia', unitPrice: 150000, durationMin: 45 },
  { name: 'Radiografía periapical', category: 'diagnostico', unitPrice: 35000, durationMin: 15 },
  { name: 'Blanqueamiento dental', category: 'estetica', unitPrice: 450000, durationMin: 90 },
  { name: 'Endodoncia unirradicular', category: 'endodoncia', unitPrice: 380000, durationMin: 90 },
  { name: 'Sellantes', category: 'prevencion', unitPrice: 70000, durationMin: 30 },
];

function cotHours(daysFromToday: number, hourCot: number, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  d.setUTCHours(hourCot + 5, minute, 0, 0); // COT = UTC-5
  return d;
}

function dateOnly(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
    if (!company) throw new Error('Empresa Lexandra no existe — ejecuta db:create-lexandra-user');

    await prisma.dentalSite.upsert({
      where: { id: SITE_ID },
      create: {
        id: SITE_ID,
        companyId: COMPANY_ID,
        name: 'Chucunes — Dra. Alexandra Bastidas Caipe',
        address: 'Consultorio Odontológico · Chucunes',
        active: true,
      },
      update: {
        active: true,
        name: 'Chucunes — Dra. Alexandra Bastidas Caipe',
        address: 'Consultorio Odontológico · Chucunes',
      },
    });

    // —— Procedimientos ——
    for (const p of PROCEDURES) {
      const existing = await prisma.dentalProcedure.findFirst({
        where: { companyId: COMPANY_ID, name: p.name },
      });
      if (existing) {
        await prisma.dentalProcedure.update({
          where: { id: existing.id },
          data: {
            category: p.category,
            unitPrice: p.unitPrice,
            durationMin: p.durationMin,
            active: true,
          },
        });
      } else {
        await prisma.dentalProcedure.create({
          data: {
            companyId: COMPANY_ID,
            name: p.name,
            category: p.category,
            unitPrice: p.unitPrice,
            durationMin: p.durationMin,
            active: true,
          },
        });
      }
    }
    const procs = await prisma.dentalProcedure.findMany({ where: { companyId: COMPANY_ID } });
    const procByName = new Map(procs.map((p) => [p.name, p]));

    // —— Pacientes ——
    const patientByDoc = new Map<string, { id: string; fullName: string }>();
    for (const seed of PATIENTS) {
      const clinicalHistory = {
        anamnesis: [
          {
            date: new Date().toISOString().slice(0, 10),
            note: seed.notes,
          },
        ],
        odontogramas: [],
        presupuestos: [],
        tratamientos: seed.treatment
          ? [{ status: 'pendiente', name: seed.treatment }]
          : [],
        consentimientos: [],
        evoluciones: [],
        remisiones: [],
        formulas: [],
        periodontogramas: [],
        incapacidades: [],
      };
      const patient = await prisma.dentalPatient.upsert({
        where: {
          companyId_documentNumber: {
            companyId: COMPANY_ID,
            documentNumber: seed.documentNumber,
          },
        },
        create: {
          companyId: COMPANY_ID,
          siteId: SITE_ID,
          fullName: seed.fullName,
          documentType: 'cc',
          documentNumber: seed.documentNumber,
          gender: seed.gender,
          phone: seed.phone,
          email: seed.email,
          city: seed.city,
          country: 'Colombia',
          occupation: seed.occupation,
          address: `${seed.city}, Nariño`,
          notes: seed.notes,
          clinicalHistory,
          odontogram: {
            type: 'permanente',
            teeth: {},
            observations: ['Simulación — historia lista para edición'],
          },
        },
        update: {
          siteId: SITE_ID,
          fullName: seed.fullName,
          gender: seed.gender,
          phone: seed.phone,
          email: seed.email,
          city: seed.city,
          occupation: seed.occupation,
          notes: seed.notes,
          clinicalHistory,
        },
      });
      patientByDoc.set(seed.documentNumber, {
        id: patient.id,
        fullName: patient.fullName,
      });
    }

    // —— Citas (agenda) ——
    const apptPlan: Array<{
      doc: string;
      days: number;
      hour: number;
      minute?: number;
      procedure: string;
      status: string;
      kind: string;
      room: string;
      charge?: boolean;
    }> = [
      {
        doc: '1144097955',
        days: 0,
        hour: 10,
        procedure: 'Valoración odontológica',
        status: 'confirmada',
        kind: 'primera_vez',
        room: 'CONSULTORIO 1',
      },
      {
        doc: '1085123456',
        days: 0,
        hour: 11,
        minute: 30,
        procedure: 'Limpieza dental',
        status: 'confirmada',
        kind: 'tratamiento',
        room: 'CONSULTORIO 1',
      },
      {
        doc: '1085333444',
        days: 0,
        hour: 15,
        procedure: 'Consulta general',
        status: 'confirmada',
        kind: 'tratamiento',
        room: 'CONSULTORIO 2',
      },
      {
        doc: '1085987654',
        days: 1,
        hour: 9,
        procedure: 'Resina simple',
        status: 'confirmada',
        kind: 'tratamiento',
        room: 'CONSULTORIO 1',
      },
      {
        doc: '1085666777',
        days: 1,
        hour: 11,
        procedure: 'Limpieza dental',
        status: 'confirmada',
        kind: 'control',
        room: 'CONSULTORIO 1',
      },
      {
        doc: '52789123',
        days: 2,
        hour: 15,
        procedure: 'Consulta general',
        status: 'pendiente',
        kind: 'control',
        room: 'CONSULTORIO 2',
      },
      {
        doc: '52998877',
        days: 3,
        hour: 10,
        procedure: 'Consulta general',
        status: 'confirmada',
        kind: 'control',
        room: 'CONSULTORIO 1',
      },
      {
        doc: '1085999000',
        days: 3,
        hour: 16,
        procedure: 'Valoración odontológica',
        status: 'pendiente',
        kind: 'primera_vez',
        room: 'CONSULTORIO 2',
      },
      {
        doc: '52887766',
        days: 4,
        hour: 9,
        procedure: 'Blanqueamiento dental',
        status: 'confirmada',
        kind: 'tratamiento',
        room: 'CONSULTORIO 1',
      },
      {
        doc: '1085456789',
        days: -2,
        hour: 14,
        procedure: 'Extracción simple',
        status: 'completada',
        kind: 'tratamiento',
        room: 'CONSULTORIO 1',
        charge: true,
      },
      {
        doc: '1085123456',
        days: -5,
        hour: 10,
        procedure: 'Radiografía periapical',
        status: 'completada',
        kind: 'diagnostico',
        room: 'RX',
        charge: true,
      },
      {
        doc: '1085777888',
        days: -1,
        hour: 11,
        procedure: 'Radiografía periapical',
        status: 'completada',
        kind: 'diagnostico',
        room: 'RX',
        charge: true,
      },
      {
        doc: '1085111222',
        days: -3,
        hour: 16,
        procedure: 'Resina simple',
        status: 'completada',
        kind: 'tratamiento',
        room: 'CONSULTORIO 1',
        charge: true,
      },
      {
        doc: '1085333444',
        days: -7,
        hour: 9,
        procedure: 'Endodoncia unirradicular',
        status: 'completada',
        kind: 'tratamiento',
        room: 'CONSULTORIO 1',
        charge: true,
      },
    ];

    const appointments: Array<{ id: string; patientId: string; procedureName: string; cost: number }> =
      [];

    for (const a of apptPlan) {
      const patient = patientByDoc.get(a.doc);
      const proc = procByName.get(a.procedure);
      if (!patient || !proc) continue;
      const startsAt = cotHours(a.days, a.hour, a.minute ?? 0);
      const endsAt = new Date(startsAt.getTime() + proc.durationMin * 60_000);
      const marker = `sim:${a.doc}:${a.procedure}:${a.days}`;
      const existing = await prisma.dentalAppointment.findFirst({
        where: { companyId: COMPANY_ID, notes: { contains: marker } },
      });
      const data = {
        companyId: COMPANY_ID,
        patientId: patient.id,
        siteId: SITE_ID,
        startsAt,
        endsAt,
        kind: a.kind,
        status: a.status,
        room: a.room,
        notes: `${a.procedure} · ${marker}`,
        procedureId: proc.id,
        procedureName: proc.name,
        estimatedCost: proc.unitPrice,
        durationMin: proc.durationMin,
        chargedAmount: a.charge ? proc.unitPrice : null,
      };
      const row = existing
        ? await prisma.dentalAppointment.update({ where: { id: existing.id }, data })
        : await prisma.dentalAppointment.create({ data });
      appointments.push({
        id: row.id,
        patientId: patient.id,
        procedureName: proc.name,
        cost: Number(proc.unitPrice),
      });
    }

    // —— Presupuestos ——
    const gustavo = patientByDoc.get('1144097955')!;
    const maria = patientByDoc.get('1085123456')!;
    const ana = patientByDoc.get('52789123')!;
    const gustavoAppt = appointments.find((a) => a.patientId === gustavo.id);
    const anaAppt = appointments.find((a) => a.patientId === ana.id);

    async function ensureBudget(opts: {
      patientId: string;
      appointmentId?: string;
      title: string;
      status: string;
      lines: Array<{ name: string; quantity: number; unitPrice: number }>;
      notes: string;
    }) {
      const existing = await prisma.dentalBudget.findFirst({
        where: { companyId: COMPANY_ID, patientId: opts.patientId, title: opts.title },
      });
      const lines = opts.lines.map((l) => ({
        ...l,
        subtotal: l.quantity * l.unitPrice,
      }));
      const total = lines.reduce((s, l) => s + l.subtotal, 0);
      if (existing) {
        return prisma.dentalBudget.update({
          where: { id: existing.id },
          data: {
            appointmentId: opts.appointmentId,
            status: opts.status,
            lines,
            subtotal: total,
            total,
            notes: opts.notes,
          },
        });
      }
      return prisma.dentalBudget.create({
        data: {
          companyId: COMPANY_ID,
          patientId: opts.patientId,
          appointmentId: opts.appointmentId,
          title: opts.title,
          status: opts.status,
          lines,
          subtotal: total,
          total,
          notes: opts.notes,
        },
      });
    }

    const budgetGustavo = await ensureBudget({
      patientId: gustavo.id,
      appointmentId: gustavoAppt?.id,
      title: 'Presupuesto — Valoración y plan inicial',
      status: 'Pendiente',
      lines: [
        { name: 'Valoración odontológica', quantity: 1, unitPrice: 60000 },
        { name: 'Radiografía periapical', quantity: 2, unitPrice: 35000 },
      ],
      notes: 'Simulación — pendiente de aceptación',
    });

    const budgetAna = await ensureBudget({
      patientId: ana.id,
      appointmentId: anaAppt?.id,
      title: 'Presupuesto — Estética integral',
      status: 'Aprobado',
      lines: [
        { name: 'Consulta general', quantity: 1, unitPrice: 80000 },
        { name: 'Blanqueamiento dental', quantity: 1, unitPrice: 450000 },
        { name: 'Limpieza dental', quantity: 1, unitPrice: 120000 },
      ],
      notes: 'Simulación — plan estético aprobado',
    });

    // —— Financiamiento ——
    const finExisting = await prisma.dentalFinancing.findFirst({
      where: { companyId: COMPANY_ID, budgetId: budgetAna.id },
    });
    if (!finExisting) {
      await prisma.dentalFinancing.create({
        data: {
          companyId: COMPANY_ID,
          patientId: ana.id,
          budgetId: budgetAna.id,
          amount: budgetAna.total,
          initialPayment: 150000,
          installments: 4,
          installmentValue: Math.round((Number(budgetAna.total) - 150000) / 4),
          status: 'en_tramite',
          notes: 'Simulación — financiación blanqueamiento',
        },
      });
    }
    const finMaria = await prisma.dentalFinancing.findFirst({
      where: { companyId: COMPANY_ID, patientId: maria.id },
    });
    if (!finMaria) {
      await prisma.dentalFinancing.create({
        data: {
          companyId: COMPANY_ID,
          patientId: maria.id,
          amount: 360000,
          initialPayment: 60000,
          installments: 3,
          installmentValue: 100000,
          status: 'desembolsado',
          notes: 'Simulación — plan higiene anual',
        },
      });
    }

    const valentina = patientByDoc.get('1085333444')!;
    const isabella = patientByDoc.get('52887766')!;
    const diego = patientByDoc.get('1085111222')!;

    await ensureBudget({
      patientId: valentina.id,
      title: 'Presupuesto — Endodoncia y restauración',
      status: 'Pendiente',
      lines: [
        { name: 'Endodoncia unirradicular', quantity: 1, unitPrice: 380000 },
        { name: 'Resina simple', quantity: 1, unitPrice: 140000 },
      ],
      notes: 'Simulación — plan endodóntico',
    });

    await ensureBudget({
      patientId: isabella.id,
      title: 'Presupuesto — Blanqueamiento follow-up',
      status: 'Aprobado',
      lines: [{ name: 'Blanqueamiento dental', quantity: 1, unitPrice: 450000 }],
      notes: 'Simulación — seguimiento estético',
    });

    const finDiego = await prisma.dentalFinancing.findFirst({
      where: { companyId: COMPANY_ID, patientId: diego.id },
    });
    if (!finDiego) {
      await prisma.dentalFinancing.create({
        data: {
          companyId: COMPANY_ID,
          patientId: diego.id,
          amount: 420000,
          initialPayment: 100000,
          installments: 4,
          installmentValue: 80000,
          status: 'pendiente_desembolso',
          notes: 'Simulación — corona / restauración',
        },
      });
    }

    // —— Ingresos ——
    let lastIncome = await prisma.dentalIncome.findFirst({
      where: { companyId: COMPANY_ID },
      orderBy: { number: 'desc' },
    });
    let nextNumber = (lastIncome?.number ?? 0) + 1;

    async function ensureIncome(opts: {
      patientId: string;
      appointmentId?: string;
      amount: number;
      method: string;
      notes: string;
      daysAgo: number;
      status?: string;
    }) {
      const hit = await prisma.dentalIncome.findFirst({
        where: { companyId: COMPANY_ID, notes: opts.notes },
      });
      if (hit) return hit;
      const incomeDate = dateOnly(cotHours(-opts.daysAgo, 12));
      const row = await prisma.dentalIncome.create({
        data: {
          companyId: COMPANY_ID,
          patientId: opts.patientId,
          appointmentId: opts.appointmentId,
          siteId: SITE_ID,
          number: nextNumber++,
          incomeDate,
          amount: opts.amount,
          paymentMethod: opts.method,
          status: opts.status ?? 'Creado',
          notes: opts.notes,
        },
      });
      return row;
    }

    const julian = patientByDoc.get('1085456789')!;
    const julianAppt = appointments.find(
      (a) => a.patientId === julian.id && a.procedureName === 'Extracción simple',
    );
    const mariaRx = appointments.find(
      (a) => a.patientId === maria.id && a.procedureName === 'Radiografía periapical',
    );

    await ensureIncome({
      patientId: gustavo.id,
      appointmentId: gustavoAppt?.id,
      amount: 60000,
      method: 'Efectivo',
      notes: 'sim-income:abono-valoracion-gustavo',
      daysAgo: 0,
    });
    await ensureIncome({
      patientId: julian.id,
      appointmentId: julianAppt?.id,
      amount: 150000,
      method: 'Transferencia',
      notes: 'sim-income:extraccion-julian',
      daysAgo: 2,
      status: 'Pagado',
    });
    await ensureIncome({
      patientId: maria.id,
      appointmentId: mariaRx?.id,
      amount: 35000,
      method: 'Nequi',
      notes: 'sim-income:rx-maria',
      daysAgo: 5,
      status: 'Pagado',
    });
    await ensureIncome({
      patientId: ana.id,
      amount: 150000,
      method: 'Tarjeta',
      notes: 'sim-income:cuota-inicial-ana',
      daysAgo: 1,
      status: 'Pagado',
    });
    await ensureIncome({
      patientId: diego.id,
      amount: 140000,
      method: 'Transferencia',
      notes: 'sim-income:resina-diego',
      daysAgo: 3,
      status: 'Pagado',
    });
    await ensureIncome({
      patientId: valentina.id,
      amount: 200000,
      method: 'Efectivo',
      notes: 'sim-income:abono-endo-valentina',
      daysAgo: 7,
      status: 'Pagado',
    });
    await ensureIncome({
      patientId: patientByDoc.get('1085777888')!.id,
      amount: 35000,
      method: 'Nequi',
      notes: 'sim-income:rx-andres',
      daysAgo: 1,
      status: 'Pagado',
    });

    // —— Gastos ——
    const expenses = [
      {
        concept: 'Guantes de látex (caja x100)',
        provider: 'Dental Supply Nariño',
        expenseType: 'Insumos',
        amount: 85000,
        daysAgo: 3,
        notes: 'sim-expense:guantes',
      },
      {
        concept: 'Autoclave — mantenimiento',
        provider: 'TecnoDental SAS',
        expenseType: 'Mantenimiento',
        amount: 220000,
        daysAgo: 10,
        notes: 'sim-expense:autoclave',
      },
      {
        concept: 'Servicios públicos consultorio',
        provider: 'CEDENAR / Empopasto',
        expenseType: 'Servicios',
        amount: 185000,
        daysAgo: 7,
        notes: 'sim-expense:servicios',
      },
      {
        concept: 'Resinas composite A2',
        provider: '3M Oral Care',
        expenseType: 'Insumos',
        amount: 310000,
        daysAgo: 1,
        notes: 'sim-expense:resinas',
      },
      {
        concept: 'Anestesia lidocaína — reposición',
        provider: 'Dental Supply Nariño',
        expenseType: 'Insumos',
        amount: 145000,
        daysAgo: 4,
        notes: 'sim-expense:anestesia',
      },
      {
        concept: 'Publicidad local · Instagram ads',
        provider: 'Meta Ads',
        expenseType: 'Marketing',
        amount: 90000,
        daysAgo: 6,
        notes: 'sim-expense:ads',
      },
      {
        concept: 'Alquiler consultorio',
        provider: 'Inmobiliaria Chucunes',
        expenseType: 'Arriendo',
        amount: 1200000,
        daysAgo: 12,
        notes: 'sim-expense:arriendo',
      },
    ];
    for (const e of expenses) {
      const hit = await prisma.dentalExpense.findFirst({
        where: { companyId: COMPANY_ID, notes: e.notes },
      });
      if (hit) continue;
      await prisma.dentalExpense.create({
        data: {
          companyId: COMPANY_ID,
          siteId: SITE_ID,
          expenseDate: dateOnly(cotHours(-e.daysAgo, 12)),
          concept: e.concept,
          provider: e.provider,
          expenseType: e.expenseType,
          amount: e.amount,
          status: 'Registrado',
          notes: e.notes,
        },
      });
    }

    // —— Bioseguridad ——
    for (const daysAgo of [0, 1, 2, 3, 4]) {
      const logDate = dateOnly(cotHours(-daysAgo, 8));
      const key = `sim-temp:${logDate.toISOString().slice(0, 10)}`;
      const hit = await prisma.dentalTempHumidityLog.findFirst({
        where: { companyId: COMPANY_ID, observations: key },
      });
      if (!hit) {
        await prisma.dentalTempHumidityLog.create({
          data: {
            companyId: COMPANY_ID,
            siteId: SITE_ID,
            logDate,
            deviceName: 'Termohigrómetro sala esterilización',
            temperatureC: 21.5 + (daysAgo % 3) * 0.4,
            humidityPct: 48 + daysAgo,
            observations: key,
          },
        });
      }
    }

    for (const [i, cycle] of ['Prevacio 134°C', 'Flash 121°C', 'Prevacio 134°C'].entries()) {
      const notes = `sim-steril:${i}`;
      const hit = await prisma.dentalSterilization.findFirst({
        where: { companyId: COMPANY_ID, notes },
      });
      if (!hit) {
        await prisma.dentalSterilization.create({
          data: {
            companyId: COMPANY_ID,
            siteId: SITE_ID,
            loadDate: cotHours(-i, 7, 30),
            equipment: 'Autoclave Class B',
            cycle,
            result: i === 1 ? 'OK' : 'OK',
            notes,
          },
        });
      }
    }

    const wastes = [
      {
        wasteType: 'Cortopunzantes',
        classification: 'Riesgo biológico',
        bagColor: 'Roja',
        weightKg: 0.45,
        daysAgo: 1,
        notes: 'sim-waste:corto',
      },
      {
        wasteType: 'Residuos ordinarios',
        classification: 'No peligroso',
        bagColor: 'Negra',
        weightKg: 1.2,
        daysAgo: 0,
        notes: 'sim-waste:ordinario',
      },
      {
        wasteType: 'Material contaminado',
        classification: 'Riesgo biológico',
        bagColor: 'Roja',
        weightKg: 0.8,
        daysAgo: 2,
        notes: 'sim-waste:contaminado',
      },
    ];
    for (const w of wastes) {
      const hit = await prisma.dentalWaste.findFirst({
        where: { companyId: COMPANY_ID, notes: w.notes },
      });
      if (hit) continue;
      await prisma.dentalWaste.create({
        data: {
          companyId: COMPANY_ID,
          siteId: SITE_ID,
          wasteDate: dateOnly(cotHours(-w.daysAgo, 12)),
          wasteType: w.wasteType,
          classification: w.classification,
          bagColor: w.bagColor,
          weightKg: w.weightKg,
          notes: w.notes,
        },
      });
    }

    // —— Inventario (módulo compartido) ——
    const cat = await prisma.productCategory.upsert({
      where: {
        companyId_slug: { companyId: COMPANY_ID, slug: 'insumos-odontologicos' },
      },
      create: {
        companyId: COMPANY_ID,
        name: 'Insumos odontológicos',
        slug: 'insumos-odontologicos',
        sortOrder: 1,
        active: true,
      },
      update: { active: true, name: 'Insumos odontológicos' },
    });

    const invItems = [
      { name: 'Guantes nitrilo M', unit: 'caja', unitCost: 42000, quantity: 8, minStock: 3 },
      { name: 'Mascarillas quirúrgicas', unit: 'caja', unitCost: 28000, quantity: 12, minStock: 4 },
      { name: 'Anestesia lidocaína 2%', unit: 'caja', unitCost: 95000, quantity: 5, minStock: 2 },
      { name: 'Resina composite A2', unit: 'jeringa', unitCost: 78000, quantity: 6, minStock: 2 },
      { name: 'Fresas diamantadas surtidas', unit: 'set', unitCost: 120000, quantity: 3, minStock: 1 },
      { name: 'Alcohol antiséptico 70%', unit: 'lt', unitCost: 18000, quantity: 4, minStock: 2 },
      { name: 'Eyectores desechables', unit: 'bolsa', unitCost: 22000, quantity: 10, minStock: 3 },
      { name: 'Baberos desechables', unit: 'paquete', unitCost: 15000, quantity: 14, minStock: 4 },
      { name: 'Kit profilaxis', unit: 'kit', unitCost: 35000, quantity: 7, minStock: 2 },
      { name: 'Gel blanqueador', unit: 'jeringa', unitCost: 95000, quantity: 4, minStock: 1 },
    ];
    for (const item of invItems) {
      const existing = await prisma.inventoryItem.findFirst({
        where: { companyId: COMPANY_ID, name: item.name },
      });
      if (existing) {
        await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: {
            categoryId: cat.id,
            unit: item.unit,
            unitCost: item.unitCost,
            quantity: item.quantity,
            minStock: item.minStock,
            active: true,
            lotLabel: 'SIM-DENTAL',
          },
        });
      } else {
        await prisma.inventoryItem.create({
          data: {
            companyId: COMPANY_ID,
            categoryId: cat.id,
            name: item.name,
            unit: item.unit,
            unitCost: item.unitCost,
            quantity: item.quantity,
            minStock: item.minStock,
            active: true,
            lotLabel: 'SIM-DENTAL',
          },
        });
      }
    }

    const summary = {
      ok: true,
      companyId: COMPANY_ID,
      patients: await prisma.dentalPatient.count({ where: { companyId: COMPANY_ID } }),
      appointments: await prisma.dentalAppointment.count({ where: { companyId: COMPANY_ID } }),
      incomes: await prisma.dentalIncome.count({ where: { companyId: COMPANY_ID } }),
      budgets: await prisma.dentalBudget.count({ where: { companyId: COMPANY_ID } }),
      financings: await prisma.dentalFinancing.count({ where: { companyId: COMPANY_ID } }),
      expenses: await prisma.dentalExpense.count({ where: { companyId: COMPANY_ID } }),
      sterilizations: await prisma.dentalSterilization.count({
        where: { companyId: COMPANY_ID },
      }),
      wastes: await prisma.dentalWaste.count({ where: { companyId: COMPANY_ID } }),
      tempLogs: await prisma.dentalTempHumidityLog.count({ where: { companyId: COMPANY_ID } }),
      inventory: await prisma.inventoryItem.count({
        where: { companyId: COMPANY_ID, active: true },
      }),
      procedures: await prisma.dentalProcedure.count({ where: { companyId: COMPANY_ID } }),
      budgetGustavoId: budgetGustavo.id,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
