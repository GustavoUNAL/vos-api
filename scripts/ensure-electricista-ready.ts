/**
 * Valida y completa lo necesario para El electricista:
 * módulos projects/tasks/booking/finance (+ opcionales energy), permisos y companyModules.
 * Uso: npx ts-node --transpile-only scripts/ensure-electricista-ready.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const ELECTRICISTA_ID = 'seed-el-electricista';

const CORE = [
  { slug: 'projects', name: 'Proyectos', description: 'Obras y servicios' },
  { slug: 'tasks', name: 'Tareas', description: 'Pendientes del equipo' },
  { slug: 'booking', name: 'Agenda', description: 'Citas y visitas' },
  { slug: 'finance', name: 'Finanzas', description: 'Números del negocio' },
  { slug: 'staff', name: 'Personal', description: 'Equipo' },
] as const;

const PERMS: Record<string, string[]> = {
  projects: ['view', 'create', 'update', 'delete'],
  tasks: ['view', 'create', 'update', 'delete'],
  booking: ['view', 'create', 'update', 'delete'],
  finance: ['view'],
  staff: ['view', 'create', 'update', 'delete'],
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({
      where: { id: ELECTRICISTA_ID },
      include: {
        roles: true,
        companyModules: { include: { module: true } },
      },
    });
    if (!company) {
      throw new Error(`Empresa ${ELECTRICISTA_ID} no encontrada`);
    }

    await prisma.company.update({
      where: { id: ELECTRICISTA_ID },
      data: {
        businessType: company.businessType === 'personal' ? 'energy' : company.businessType ?? 'energy',
      },
    });

    const moduleIds: string[] = [];
    for (const mod of CORE) {
      const row = await prisma.module.upsert({
        where: { slug: mod.slug },
        create: {
          slug: mod.slug,
          name: mod.name,
          description: mod.description,
          sortOrder: 40,
        },
        update: { name: mod.name, description: mod.description },
      });
      moduleIds.push(row.id);

      for (const action of PERMS[mod.slug] ?? ['view']) {
        const slug = `${mod.slug}.${action}`;
        await prisma.permission.upsert({
          where: { slug },
          create: {
            slug,
            moduleSlug: mod.slug,
            name: `${mod.name}: ${action}`,
          },
          update: { moduleSlug: mod.slug },
        });
      }

      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: { companyId: ELECTRICISTA_ID, moduleId: row.id },
        },
        create: {
          companyId: ELECTRICISTA_ID,
          moduleId: row.id,
          isEnabled: true,
        },
        update: { isEnabled: true },
      });
    }

    const ownerRoles = company.roles.filter((r) =>
      ['owner', 'manager'].includes(r.slug),
    );
    const allPerms = await prisma.permission.findMany({
      where: {
        moduleSlug: { in: CORE.map((m) => m.slug) },
      },
    });
    for (const role of ownerRoles) {
      for (const perm of allPerms) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: perm.id },
          },
          create: { roleId: role.id, permissionId: perm.id },
          update: {},
        });
      }
    }

    const enabled = await prisma.companyModule.findMany({
      where: { companyId: ELECTRICISTA_ID, isEnabled: true },
      include: { module: true },
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          company: company.name,
          businessType: 'energy',
          modules: enabled.map((m) => m.module.slug).sort(),
          coreReady: CORE.every((c) =>
            enabled.some((m) => m.module.slug === c.slug && m.isEnabled),
          ),
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
