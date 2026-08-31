/**
 * Jessica Cisneros (operadora): todos los módulos de Arándano Café Bar; solo sus turnos.
 * Cuenta: jl9766151@gmail.com — no resetea la contraseña salvo SEED_JESSICA_PASSWORD.
 * Uso: npm run db:create-jessica-user
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const COMPANY_ID = 'seed-arandano-cafe-bar';
const CREW_SLUG = 'crew';
const HOURLY_RATE = 6250;
const CREW_PERMISSIONS = [
  'products.view',
  'products.create',
  'products.update',
  'inventory.view',
  'inventory.create',
  'inventory.update',
  'sales.view',
  'sales.create',
  'sales.update',
  'purchases.view',
  'purchases.create',
  'purchases.update',
  'staff.view',
  'staff.create',
  'staff.update',
  'tasks.view',
  'tasks.create',
  'tasks.update',
  'finance.view',
] as const;
const MANAGE_PERM = 'staff.manage';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const email = (process.env.SEED_JESSICA_EMAIL ?? 'jl9766151@gmail.com')
    .trim()
    .toLowerCase();
  const passwordOverride = process.env.SEED_JESSICA_PASSWORD?.trim();
  const name = process.env.SEED_JESSICA_NAME ?? 'Jessica Cisneros';

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({
      where: { id: COMPANY_ID },
    });
    if (!company) {
      throw new Error(`Empresa ${COMPANY_ID} no encontrada.`);
    }

    const managePerm = await prisma.permission.upsert({
      where: { slug: MANAGE_PERM },
      create: {
        slug: MANAGE_PERM,
        moduleSlug: 'staff',
        name: 'Ver turnos de todo el equipo',
      },
      update: { name: 'Ver turnos de todo el equipo' },
    });

    for (const slug of ['owner', 'manager']) {
      const role = await prisma.role.findFirst({
        where: { companyId: company.id, slug },
      });
      if (!role) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: managePerm.id,
          },
        },
        create: { roleId: role.id, permissionId: managePerm.id },
        update: {},
      });
    }

    const crewRole = await prisma.role.upsert({
      where: { companyId_slug: { companyId: company.id, slug: CREW_SLUG } },
      create: {
        companyId: company.id,
        slug: CREW_SLUG,
        name: 'Operadora',
        description: 'Operación diaria de todos los módulos; solo sus turnos',
        isSystem: true,
      },
      update: {
        name: 'Operadora',
        description: 'Operación diaria de todos los módulos; solo sus turnos',
      },
    });

    const crewPerms = await prisma.permission.findMany({
      where: { slug: { in: [...CREW_PERMISSIONS] } },
    });
    if (crewPerms.length !== CREW_PERMISSIONS.length) {
      throw new Error(
        'Faltan permisos de módulos. Ejecuta las migraciones de plataforma.',
      );
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: crewRole.id } });
    for (const permission of crewPerms) {
      await prisma.rolePermission.create({
        data: { roleId: crewRole.id, permissionId: permission.id },
      });
    }

    const now = new Date();
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
      if (!passwordOverride) {
        throw new Error(
          `No existe ${email}. Definí SEED_JESSICA_PASSWORD para crearla.`,
        );
      }
    }

    const passwordHash = passwordOverride
      ? await bcrypt.hash(passwordOverride, 10)
      : existingUser!.passwordHash;

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name,
        active: true,
        isPlatformAdmin: false,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
      },
      update: {
        name,
        active: true,
        isPlatformAdmin: false,
        ...(passwordOverride ? { passwordHash } : {}),
      },
    });

    const membership = await prisma.companyMember.upsert({
      where: {
        companyId_userId: { companyId: company.id, userId: user.id },
      },
      create: {
        companyId: company.id,
        userId: user.id,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });

    await prisma.companyMemberRole.deleteMany({
      where: { companyMemberId: membership.id },
    });
    await prisma.companyMemberRole.create({
      data: { companyMemberId: membership.id, roleId: crewRole.id },
    });

    const leftoverEmail = 'jessica@arandano.com';
    const leftover = await prisma.user.findUnique({
      where: { email: leftoverEmail },
    });
    if (leftover && leftover.id !== user.id) {
      await prisma.staffMember.updateMany({
        where: { companyId: company.id, userId: leftover.id },
        data: { userId: null },
      });
      await prisma.user.update({
        where: { id: leftover.id },
        data: { active: false },
      });
      await prisma.companyMember.updateMany({
        where: { userId: leftover.id, companyId: company.id },
        data: { status: 'SUSPENDED' },
      });
    }

    const existingStaff =
      (await prisma.staffMember.findFirst({
        where: { companyId: company.id, userId: user.id },
      })) ||
      (await prisma.staffMember.findFirst({
        where: {
          companyId: company.id,
          email: { equals: email, mode: 'insensitive' },
        },
      })) ||
      (await prisma.staffMember.findFirst({
        where: {
          companyId: company.id,
          name: { contains: 'Jessica', mode: 'insensitive' },
        },
      }));

    const staffMember = existingStaff
      ? await prisma.staffMember.update({
          where: { id: existingStaff.id },
          data: {
            userId: user.id,
            email,
            name,
            active: true,
            defaultHourlyRate: HOURLY_RATE,
          },
        })
      : await prisma.staffMember.create({
          data: {
            companyId: company.id,
            userId: user.id,
            name,
            email,
            active: true,
            defaultHourlyRate: HOURLY_RATE,
          },
        });

    await prisma.staffShift.updateMany({
      where: {
        companyId: company.id,
        staffMemberId: staffMember.id,
      },
      data: { hourlyRateCOP: HOURLY_RATE },
    });

    const ownShifts = await prisma.staffShift.findMany({
      where: { companyId: company.id, staffMemberId: staffMember.id },
      select: { id: true, hoursWorked: true },
    });
    for (const shift of ownShifts) {
      const hours = Number(shift.hoursWorked ?? 0);
      if (!Number.isFinite(hours)) continue;
      await prisma.staffShift.update({
        where: { id: shift.id },
        data: { totalPayCOP: Math.round(hours * HOURLY_RATE) },
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          email,
          name,
          role: crewRole.slug,
          roleName: crewRole.name,
          passwordUpdated: Boolean(passwordOverride),
          hourlyRateCOP: HOURLY_RATE,
          staffMemberId: staffMember.id,
          company: { id: company.id, name: company.name },
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
