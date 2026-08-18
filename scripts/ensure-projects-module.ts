/**
 * Activa el módulo Proyectos en El electricista y carga el historial inicial.
 * Uso: npm run db:ensure-projects
 */
import 'dotenv/config';
import { Prisma, ProjectStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const ELECTRICISTA_ID = 'seed-el-electricista';

const PROJECT_PERMISSIONS = [
  { slug: 'projects.view', name: 'Ver proyectos' },
  { slug: 'projects.create', name: 'Crear proyectos' },
  { slug: 'projects.update', name: 'Editar proyectos' },
  { slug: 'projects.delete', name: 'Eliminar proyectos' },
] as const;

const DEMO_PROJECTS = [
  {
    id: 'seed-elec-proj-pilar-ducha',
    name: 'Instalación de ducha',
    address: 'Calle 12D #6-18, Barrio El Pilar',
    description: 'Instalación de ducha.',
    chargedAmount: 50_000,
    status: ProjectStatus.COMPLETED,
    notes: 'Cobrado $50.000',
  },
  {
    id: 'seed-elec-proj-tabalrec-fv',
    name: 'Sistema fotovoltaico 28 kW',
    address: 'Edificio Tabalrec',
    description: 'Sistema fotovoltaico de 28 kW.',
    chargedAmount: 19_000_000,
    status: ProjectStatus.IN_PROGRESS,
    notes: 'Se cobró $19.000.000 y aún está en ejecución.',
  },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const projectsModule = await prisma.module.upsert({
      where: { slug: 'projects' },
      create: {
        slug: 'projects',
        name: 'Proyectos',
        description: 'Historial de obras y servicios',
        sortOrder: 50,
      },
      update: {
        name: 'Proyectos',
        description: 'Historial de obras y servicios',
      },
    });

    for (const perm of PROJECT_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { slug: perm.slug },
        create: {
          slug: perm.slug,
          moduleSlug: 'projects',
          name: perm.name,
        },
        update: { moduleSlug: 'projects', name: perm.name },
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: ELECTRICISTA_ID },
      include: { roles: { where: { slug: { in: ['owner', 'manager'] } } } },
    });
    if (!company) {
      throw new Error(
        `Empresa ${ELECTRICISTA_ID} no existe. Corre npm run db:create-gustavo-user primero.`,
      );
    }

    await prisma.companyModule.upsert({
      where: {
        companyId_moduleId: {
          companyId: company.id,
          moduleId: projectsModule.id,
        },
      },
      create: {
        companyId: company.id,
        moduleId: projectsModule.id,
        isEnabled: true,
      },
      update: { isEnabled: true },
    });

    const perms = await prisma.permission.findMany({
      where: { slug: { in: PROJECT_PERMISSIONS.map((p) => p.slug) } },
    });
    for (const role of company.roles) {
      for (const perm of perms) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: perm.id },
          },
          create: { roleId: role.id, permissionId: perm.id },
          update: {},
        });
      }
    }

    for (const project of DEMO_PROJECTS) {
      await prisma.serviceProject.upsert({
        where: { id: project.id },
        create: {
          id: project.id,
          companyId: company.id,
          name: project.name,
          address: project.address,
          description: project.description,
          chargedAmount: new Prisma.Decimal(project.chargedAmount),
          status: project.status,
          notes: project.notes,
        },
        update: {
          name: project.name,
          address: project.address,
          description: project.description,
          chargedAmount: new Prisma.Decimal(project.chargedAmount),
          status: project.status,
          notes: project.notes,
        },
      });
    }

    console.log(
      `Proyectos OK en ${company.name}: ${DEMO_PROJECTS.length} obras en el historial.`,
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
