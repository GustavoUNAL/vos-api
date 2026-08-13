/**
 * Crea módulo dental + permisos y lo habilita en Lexandra.
 * Uso: npm run db:ensure-dental
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const COMPANY_ID = 'seed-lexandra-odontologia';
const MODULES = ['inventory', 'finance', 'dental'] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const dental = await prisma.module.upsert({
      where: { slug: 'dental' },
      create: {
        slug: 'dental',
        name: 'Clínica dental',
        description: 'Pacientes, agenda, bioseguridad y operación clínica',
        sortOrder: 15,
      },
      update: {
        name: 'Clínica dental',
        description: 'Pacientes, agenda, bioseguridad y operación clínica',
        sortOrder: 15,
      },
    });

    const perms = [
      { slug: 'dental.view', name: 'Ver clínica dental' },
      { slug: 'dental.create', name: 'Crear registros clínicos' },
      { slug: 'dental.update', name: 'Editar registros clínicos' },
      { slug: 'dental.delete', name: 'Eliminar registros clínicos' },
    ];
    for (const p of perms) {
      await prisma.permission.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, moduleSlug: 'dental', name: p.name },
        update: { name: p.name, moduleSlug: 'dental' },
      });
    }

    const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
    if (!company) {
      throw new Error(`Empresa ${COMPANY_ID} no existe. Corre db:create-lexandra-user primero.`);
    }

    const mods = await prisma.module.findMany({
      where: { slug: { in: [...MODULES] } },
    });

    const allCm = await prisma.companyModule.findMany({
      where: { companyId: company.id },
      include: { module: { select: { slug: true } } },
    });
    for (const cm of allCm) {
      const keep = MODULES.includes(cm.module.slug as (typeof MODULES)[number]);
      await prisma.companyModule.update({
        where: { id: cm.id },
        data: { isEnabled: keep },
      });
    }
    for (const mod of mods) {
      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: { companyId: company.id, moduleId: mod.id },
        },
        create: { companyId: company.id, moduleId: mod.id, isEnabled: true },
        update: { isEnabled: true },
      });
    }

    const ownerRole = await prisma.role.findUnique({
      where: { companyId_slug: { companyId: company.id, slug: 'owner' } },
    });
    if (ownerRole) {
      const permissions = await prisma.permission.findMany({
        where: { moduleSlug: { in: [...MODULES] } },
      });
      await prisma.rolePermission.deleteMany({ where: { roleId: ownerRole.id } });
      for (const permission of permissions) {
        await prisma.rolePermission.create({
          data: { roleId: ownerRole.id, permissionId: permission.id },
        });
      }
    }

    const site = await prisma.dentalSite.upsert({
      where: { id: 'seed-lexandra-site-chucunes' },
      create: {
        id: 'seed-lexandra-site-chucunes',
        companyId: company.id,
        name: 'Chucunes — Dra. Alexandra Bastidas Caipe',
        address: 'Consultorio Odontológico',
        active: true,
      },
      update: {
        name: 'Chucunes — Dra. Alexandra Bastidas Caipe',
        active: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          module: dental.slug,
          companyId: company.id,
          modules: [...MODULES],
          site: { id: site.id, name: site.name },
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
