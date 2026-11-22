/**
 * Asegura la empresa Main (vida personal) y el acceso de un usuario.
 * Uso:
 *   MAIN_USER_EMAIL=omar MAIN_USER_PASSWORD='…' \
 *   node scripts/with-env.mjs npx ts-node --transpile-only scripts/ensure-main-personal.ts
 */
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const MAIN_ID = 'seed-main';
const PERSONAL_MODULES = ['booking', 'tasks', 'projects', 'finance'] as const;

async function main() {
  const email = (process.env.MAIN_USER_EMAIL ?? 'omar').trim().toLowerCase();
  const password = process.env.MAIN_USER_PASSWORD ?? '';
  if (!password) throw new Error('MAIN_USER_PASSWORD es obligatorio');

  const pool = new Pool(pgPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.upsert({
      where: { id: MAIN_ID },
      create: {
        id: MAIN_ID,
        name: 'Main',
        status: 'ACTIVE',
        businessType: 'personal',
      },
      update: {
        name: 'Main',
        status: 'ACTIVE',
        businessType: 'personal',
      },
    });

    const catalog = await prisma.module.findMany();
    const wanted = new Set(PERSONAL_MODULES);
    for (const mod of catalog) {
      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: { companyId: company.id, moduleId: mod.id },
        },
        create: {
          companyId: company.id,
          moduleId: mod.id,
          isEnabled: wanted.has(mod.slug as (typeof PERSONAL_MODULES)[number]),
        },
        update: {
          isEnabled: wanted.has(mod.slug as (typeof PERSONAL_MODULES)[number]),
        },
      });
    }

    const ownerRole = await prisma.role.upsert({
      where: { companyId_slug: { companyId: company.id, slug: 'owner' } },
      create: {
        companyId: company.id,
        slug: 'owner',
        name: 'Propietario',
        description: 'Acceso total en Main',
        isSystem: true,
      },
      update: {},
    });

    const permissions = await prisma.permission.findMany({
      where: { moduleSlug: { in: [...PERSONAL_MODULES] } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: ownerRole.id } });
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: { roleId: ownerRole.id, permissionId: permission.id },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: email === 'omar' ? 'Omar' : email,
        passwordHash,
        active: true,
        isPlatformAdmin: true,
      },
      update: {
        passwordHash,
        active: true,
        isPlatformAdmin: true,
      },
    });

    const membership = await prisma.companyMember.upsert({
      where: {
        companyId_userId: { companyId: company.id, userId: user.id },
      },
      create: { companyId: company.id, userId: user.id, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await prisma.companyMemberRole.deleteMany({
      where: { companyMemberId: membership.id },
    });
    await prisma.companyMemberRole.create({
      data: { companyMemberId: membership.id, roleId: ownerRole.id },
    });

    console.log('Main personal OK', {
      companyId: company.id,
      modules: PERSONAL_MODULES,
      user: user.email,
      note: 'Diario/finanzas/calendario viven en Neon y no se borran con migrate deploy',
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
