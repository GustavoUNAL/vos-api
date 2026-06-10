/**
 * Asegura permisos y módulo de tareas para empresas existentes (ej. Arándano).
 * Uso: npm run db:ensure-tasks
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const TASKS_PERMISSIONS = [
  'tasks.view',
  'tasks.create',
  'tasks.update',
  'tasks.delete',
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const tasksModule = await prisma.module.upsert({
      where: { slug: 'tasks' },
      create: {
        slug: 'tasks',
        name: 'Tareas',
        description: 'Actividades diarias del equipo',
        sortOrder: 36,
      },
      update: {
        name: 'Tareas',
        description: 'Actividades diarias del equipo',
      },
    });

    for (const slug of TASKS_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { slug },
        create: {
          slug,
          moduleSlug: 'tasks',
          name: slug,
        },
        update: { moduleSlug: 'tasks' },
      });
    }

    const companies = await prisma.company.findMany({
      where: { status: 'ACTIVE' },
      include: {
        roles: { where: { slug: { in: ['owner', 'manager'] } } },
      },
    });

    const taskPerms = await prisma.permission.findMany({
      where: { slug: { in: [...TASKS_PERMISSIONS] } },
    });

    for (const company of companies) {
      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: {
            companyId: company.id,
            moduleId: tasksModule.id,
          },
        },
        create: {
          companyId: company.id,
          moduleId: tasksModule.id,
          isEnabled: true,
        },
        update: { isEnabled: true },
      });

      for (const role of company.roles) {
        const slugs =
          role.slug === 'owner'
            ? TASKS_PERMISSIONS
            : (['tasks.view', 'tasks.create', 'tasks.update', 'tasks.delete'] as const);
        for (const perm of taskPerms.filter((p) =>
          slugs.includes(p.slug as (typeof TASKS_PERMISSIONS)[number]),
        )) {
          await prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: perm.id,
              },
            },
            create: { roleId: role.id, permissionId: perm.id },
            update: {},
          });
        }
      }
    }

    console.log(
      `Tasks module OK for ${companies.length} empresa(s): permisos owner/manager actualizados.`,
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
