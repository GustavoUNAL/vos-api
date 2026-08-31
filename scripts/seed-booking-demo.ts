/**
 * Demo VOS AI Booking — empresa genérica de servicios + usuario Ricky.
 * Uso: npm run db:seed-booking-demo
 * Credenciales: SEED_RICKY_EMAIL / SEED_RICKY_PASSWORD (defaults de entorno de demo).
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { wallToUtc, ymdInOffset } from '../src/platform-booking/booking-time';

const COMPANY_ID = 'seed-booking-barberia-demo';
/** Agenda + operación diaria de una barbería (cobro, stock, equipo). */
const MODULES = [
  'booking',
  'products',
  'sales',
  'inventory',
  'purchases',
  'staff',
  'tasks',
  'finance',
] as const;
const BOOKING_PERMS = [
  { slug: 'booking.view', name: 'Ver reservas' },
  { slug: 'booking.create', name: 'Crear reservas' },
  { slug: 'booking.update', name: 'Editar reservas' },
  { slug: 'booking.delete', name: 'Eliminar reservas' },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const email = (process.env.SEED_RICKY_EMAIL ?? 'ricky@barberia.com').trim().toLowerCase();
  const password = process.env.SEED_RICKY_PASSWORD ?? 'Ricky2026!';
  const name = process.env.SEED_RICKY_NAME ?? 'Ricky';

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const bookingModule = await prisma.module.upsert({
      where: { slug: 'booking' },
      create: {
        slug: 'booking',
        name: 'Agenda de citas',
        description: 'Motor de citas y reservas reutilizable',
        sortOrder: 18,
      },
      update: {
        name: 'Agenda de citas',
        description: 'Motor de citas y reservas reutilizable',
      },
    });
    for (const p of BOOKING_PERMS) {
      await prisma.permission.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, moduleSlug: 'booking', name: p.name },
        update: { name: p.name, moduleSlug: 'booking' },
      });
    }

    const company = await prisma.company.upsert({
      where: { id: COMPANY_ID },
      create: {
        id: COMPANY_ID,
        name: 'Barbería Demo',
        email,
        phone: '3100000001',
        address: 'Pasto, Colombia',
        status: 'ACTIVE',
      },
      update: { name: 'Barbería Demo', email, status: 'ACTIVE' },
    });

    const wantedModules = await prisma.module.findMany({
      where: { slug: { in: [...MODULES] } },
    });
    const allMods = await prisma.companyModule.findMany({
      where: { companyId: company.id },
      include: { module: true },
    });
    const wanted = new Set<string>(MODULES);
    for (const cm of allMods) {
      await prisma.companyModule.update({
        where: { id: cm.id },
        data: { isEnabled: wanted.has(cm.module.slug) },
      });
    }
    for (const mod of wantedModules) {
      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: { companyId: company.id, moduleId: mod.id },
        },
        create: { companyId: company.id, moduleId: mod.id, isEnabled: true },
        update: { isEnabled: true },
      });
    }

    const ownerRole = await prisma.role.upsert({
      where: { companyId_slug: { companyId: company.id, slug: 'owner' } },
      create: {
        companyId: company.id,
        slug: 'owner',
        name: 'Propietario',
        isSystem: true,
      },
      update: { name: 'Propietario' },
    });
    const adminRole = await prisma.role.upsert({
      where: { companyId_slug: { companyId: company.id, slug: 'admin' } },
      create: {
        companyId: company.id,
        slug: 'admin',
        name: 'Administrador',
        isSystem: true,
      },
      update: { name: 'Administrador' },
    });
    const staffRole = await prisma.role.upsert({
      where: { companyId_slug: { companyId: company.id, slug: 'staff' } },
      create: {
        companyId: company.id,
        slug: 'staff',
        name: 'Equipo',
        isSystem: true,
      },
      update: { name: 'Equipo' },
    });
    const perms = await prisma.permission.findMany({
      where: { moduleSlug: { in: [...MODULES] } },
    });
    for (const role of [ownerRole, adminRole]) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const permission of perms) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
      }
    }
    const staffPerms = perms.filter((p) =>
      ['booking.view', 'booking.create'].includes(p.slug),
    );
    await prisma.rolePermission.deleteMany({ where: { roleId: staffRole.id } });
    for (const permission of staffPerms) {
      await prisma.rolePermission.create({
        data: { roleId: staffRole.id, permissionId: permission.id },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, name, active: true, isPlatformAdmin: false },
      update: { name, active: true },
    });
    const membership = await prisma.companyMember.upsert({
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
      create: { companyId: company.id, userId: user.id, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await prisma.companyMemberRole.deleteMany({ where: { companyMemberId: membership.id } });
    await prisma.companyMemberRole.create({
      data: { companyMemberId: membership.id, roleId: ownerRole.id },
    });

    await prisma.bookingSettings.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        publicSlug: 'barberia-ricky',
        timezone: 'America/Bogota',
        welcomeMessage: 'Ricky Barbero',
        noticeMessage:
          'Su turno quedó confirmado. Escríbanos por WhatsApp si necesita cambiar algo.',
        whatsappPhone: '',
        publicEnabled: true,
        slotIntervalMin: 60,
      },
      update: {
        publicSlug: 'barberia-ricky',
        timezone: 'America/Bogota',
        publicEnabled: true,
        welcomeMessage: 'Ricky Barbero',
        noticeMessage:
          'Su turno quedó confirmado. Escríbanos por WhatsApp si necesita cambiar algo.',
        slotIntervalMin: 60,
      },
    });

    const corte = await prisma.bookingService.upsert({
      where: { id: 'seed-booking-svc-corte' },
      create: {
        id: 'seed-booking-svc-corte',
        companyId: company.id,
        name: 'Corte',
        description: 'Corte clásico',
        durationMin: 60,
        price: new Prisma.Decimal(25000),
        currency: 'COP',
        sortOrder: 1,
      },
      update: { name: 'Corte', durationMin: 60, price: new Prisma.Decimal(25000), active: true },
    });
    const barba = await prisma.bookingService.upsert({
      where: { id: 'seed-booking-svc-barba' },
      create: {
        id: 'seed-booking-svc-barba',
        companyId: company.id,
        name: 'Barba',
        description: 'Perfilado de barba',
        durationMin: 20,
        price: new Prisma.Decimal(15000),
        sortOrder: 2,
      },
      update: { name: 'Barba', durationMin: 20, price: new Prisma.Decimal(15000), active: true },
    });
    const combo = await prisma.bookingService.upsert({
      where: { id: 'seed-booking-svc-combo' },
      create: {
        id: 'seed-booking-svc-combo',
        companyId: company.id,
        name: 'Corte + barba',
        description: 'Servicio completo',
        durationMin: 60,
        price: new Prisma.Decimal(35000),
        sortOrder: 3,
      },
      update: { name: 'Corte + barba', durationMin: 60, price: new Prisma.Decimal(35000), active: true },
    });

    const staffRows = [
      { id: 'seed-booking-staff-ricky', name: 'Ricky', active: true },
      { id: 'seed-booking-staff-carlos', name: 'Carlos', active: false },
      { id: 'seed-booking-staff-andres', name: 'Andrés', active: false },
    ];
    for (const s of staffRows) {
      await prisma.bookingStaff.upsert({
        where: { id: s.id },
        create: { id: s.id, companyId: company.id, name: s.name, active: s.active },
        update: { name: s.name, active: s.active },
      });
      await prisma.bookingStaffService.deleteMany({ where: { staffId: s.id } });
      await prisma.bookingStaffService.createMany({
        data: [corte.id, barba.id, combo.id].map((serviceId) => ({
          staffId: s.id,
          serviceId,
        })),
      });
    }

    await prisma.bookingWorkingHour.deleteMany({ where: { companyId: company.id } });
    const hours = [];
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      hours.push({
        companyId: company.id,
        staffId: null,
        weekday,
        startMin: 8 * 60,
        endMin: 19 * 60,
      });
    }
    await prisma.bookingWorkingHour.createMany({ data: hours });

    const juan = await prisma.bookingCustomer.upsert({
      where: { companyId_phone: { companyId: company.id, phone: '3101111111' } },
      create: { companyId: company.id, name: 'Juan Pérez', phone: '3101111111' },
      update: { name: 'Juan Pérez' },
    });
    const maria = await prisma.bookingCustomer.upsert({
      where: { companyId_phone: { companyId: company.id, phone: '3102222222' } },
      create: { companyId: company.id, name: 'María López', phone: '3102222222' },
      update: { name: 'María López' },
    });
    const pedro = await prisma.bookingCustomer.upsert({
      where: { companyId_phone: { companyId: company.id, phone: '3103333333' } },
      create: { companyId: company.id, name: 'Pedro Gómez', phone: '3103333333' },
      update: { name: 'Pedro Gómez' },
    });

    const today = ymdInOffset(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = ymdInOffset(tomorrowDate);

    await prisma.bookingAppointment.deleteMany({
      where: { id: { startsWith: 'seed-booking-appt-' } },
    });

    const demos = [
      {
        id: 'seed-booking-appt-1',
        customerId: juan.id,
        serviceId: corte.id,
        staffId: 'seed-booking-staff-ricky',
        date: today,
        time: '10:00',
        status: 'CONFIRMED' as const,
      },
      {
        id: 'seed-booking-appt-2',
        customerId: maria.id,
        serviceId: combo.id,
        staffId: 'seed-booking-staff-carlos',
        date: today,
        time: '11:00',
        status: 'COMPLETED' as const,
      },
      {
        id: 'seed-booking-appt-3',
        customerId: pedro.id,
        serviceId: barba.id,
        staffId: 'seed-booking-staff-andres',
        date: tomorrow,
        time: '09:00',
        status: 'CONFIRMED' as const,
      },
    ];
    for (const d of demos) {
      const startAt = wallToUtc(d.date, d.time);
      const duration =
        d.serviceId === combo.id ? 60 : d.serviceId === corte.id ? 40 : 20;
      await prisma.bookingAppointment.upsert({
        where: { id: d.id },
        create: {
          id: d.id,
          companyId: company.id,
          customerId: d.customerId,
          serviceId: d.serviceId,
          staffId: d.staffId,
          startAt,
          endAt: new Date(startAt.getTime() + duration * 60_000),
          status: d.status,
          source: 'ADMIN',
        },
        update: {
          startAt,
          endAt: new Date(startAt.getTime() + duration * 60_000),
          status: d.status,
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          email,
          company: company.name,
          publicUrl: '/agenda/barberia-ricky',
          modules: [...MODULES],
          hint: 'Credenciales: SEED_RICKY_EMAIL / SEED_RICKY_PASSWORD',
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
