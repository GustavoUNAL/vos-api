/**
 * Cliente Lexandra Bastidas Odontología — módulos: inventario + finanzas.
 * Uso: npm run db:create-lexandra-user
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const COMPANY_ID = 'seed-lexandra-odontologia';
const COMPANY_NAME = 'Alexandra Bastidas Odontología';
const MODULES = ['inventory', 'finance', 'dental'] as const;

const EMAIL = (
  process.env.SEED_LEXANDRA_EMAIL ?? 'lexandrabastidasodontologa@gmail.com'
)
  .trim()
  .toLowerCase();
const PASSWORD = process.env.SEED_LEXANDRA_PASSWORD ?? 'Lexandra2026!';
const NAME = process.env.SEED_LEXANDRA_NAME ?? 'Alexandra Bastidas';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.upsert({
      where: { id: COMPANY_ID },
      create: {
        id: COMPANY_ID,
        name: COMPANY_NAME,
        email: EMAIL,
        shopSlug: 'lexandra-odontologia',
        status: 'ACTIVE',
      },
      update: {
        name: COMPANY_NAME,
        email: EMAIL,
        shopSlug: 'lexandra-odontologia',
        status: 'ACTIVE',
      },
    });

    const modules = await prisma.module.findMany({
      where: { slug: { in: [...MODULES] } },
    });
    if (modules.length !== MODULES.length) {
      // Asegura catálogo dental si falta
      await prisma.module.upsert({
        where: { slug: 'dental' },
        create: {
          slug: 'dental',
          name: 'Clínica dental',
          description: 'Pacientes, agenda y bioseguridad',
          sortOrder: 15,
        },
        update: {},
      });
      for (const p of [
        { slug: 'dental.view', name: 'Ver clínica dental' },
        { slug: 'dental.create', name: 'Crear registros clínicos' },
        { slug: 'dental.update', name: 'Editar registros clínicos' },
        { slug: 'dental.delete', name: 'Eliminar registros clínicos' },
      ]) {
        await prisma.permission.upsert({
          where: { slug: p.slug },
          create: { slug: p.slug, moduleSlug: 'dental', name: p.name },
          update: { name: p.name },
        });
      }
    }
    const modulesReady = await prisma.module.findMany({
      where: { slug: { in: [...MODULES] } },
    });
    if (modulesReady.length !== MODULES.length) {
      throw new Error(
        'Faltan módulos inventory/finance/dental. Ejecuta npm run db:seed-platform.',
      );
    }

    // Solo estos módulos habilitados (desactiva el resto si existían).
    const allCompanyMods = await prisma.companyModule.findMany({
      where: { companyId: company.id },
      include: { module: { select: { slug: true } } },
    });
    for (const cm of allCompanyMods) {
      const keep = MODULES.includes(
        cm.module.slug as (typeof MODULES)[number],
      );
      await prisma.companyModule.update({
        where: { id: cm.id },
        data: { isEnabled: keep },
      });
    }
    for (const mod of modulesReady) {
      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: { companyId: company.id, moduleId: mod.id },
        },
        create: {
          companyId: company.id,
          moduleId: mod.id,
          isEnabled: true,
        },
        update: { isEnabled: true },
      });
    }

    const ownerRole = await prisma.role.upsert({
      where: { companyId_slug: { companyId: company.id, slug: 'owner' } },
      create: {
        companyId: company.id,
        slug: 'owner',
        name: 'Propietario',
        description: 'Acceso a inventario y finanzas',
        isSystem: true,
      },
      update: {},
    });

    const permissions = await prisma.permission.findMany({
      where: { moduleSlug: { in: [...MODULES] } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: ownerRole.id } });
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: { roleId: ownerRole.id, permissionId: permission.id },
      });
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      create: {
        email: EMAIL,
        passwordHash,
        name: NAME,
        active: true,
        isPlatformAdmin: false,
      },
      update: {
        passwordHash,
        name: NAME,
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
      data: { companyMemberId: membership.id, roleId: ownerRole.id },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          email: EMAIL,
          password: PASSWORD,
          name: NAME,
          company: { id: company.id, name: company.name },
          modules: [...MODULES],
          permissions: permissions.map((p) => p.slug),
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
