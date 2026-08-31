/**
 * Crea a Jessica (piso): inventario + solo sus turnos en Arándano Café Bar.
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
const CREW_PERMISSIONS = [
  'inventory.view',
  'inventory.create',
  'inventory.update',
  'staff.view',
  'staff.create',
  'staff.update',
] as const;
const MANAGE_PERM = 'staff.manage';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const email = (process.env.SEED_JESSICA_EMAIL ?? 'jessica@arandano.com')
    .trim()
    .toLowerCase();
  const password = process.env.SEED_JESSICA_PASSWORD ?? 'Jessica@Arandano2026!';
  const name = process.env.SEED_JESSICA_NAME ?? 'Jessica';
  const passwordHash = await bcrypt.hash(password, 10);

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
        name: 'Piso',
        description: 'Inventario y solo los turnos propios',
        isSystem: true,
      },
      update: {
        name: 'Piso',
        description: 'Inventario y solo los turnos propios',
      },
    });

    const crewPerms = await prisma.permission.findMany({
      where: { slug: { in: [...CREW_PERMISSIONS] } },
    });
    if (crewPerms.length !== CREW_PERMISSIONS.length) {
      throw new Error(
        'Faltan permisos de inventario/personal. Ejecuta las migraciones de plataforma.',
      );
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: crewRole.id } });
    for (const permission of crewPerms) {
      await prisma.rolePermission.create({
        data: { roleId: crewRole.id, permissionId: permission.id },
      });
    }

    const now = new Date();
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
        passwordHash,
        name,
        active: true,
        isPlatformAdmin: false,
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
          name: { equals: name, mode: 'insensitive' },
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
            name: existingStaff.name.trim() ? existingStaff.name : name,
            active: true,
          },
        })
      : await prisma.staffMember.create({
          data: {
            companyId: company.id,
            userId: user.id,
            name,
            email,
            active: true,
            defaultHourlyRate: 0,
          },
        });

    console.log(
      JSON.stringify(
        {
          ok: true,
          email,
          password,
          name,
          role: crewRole.slug,
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
