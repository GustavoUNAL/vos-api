/**
 * Crea o actualiza David Herrera (rol operaciones) en Arándano Café Bar.
 * Uso: npm run db:create-david-user
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const COMPANY_ID = 'seed-arandano-cafe-bar';
const MANAGER_PERMISSION_SLUGS = [
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
  'tasks.delete',
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const email = (process.env.SEED_DAVID_EMAIL ?? 'david@arandano.com')
    .trim()
    .toLowerCase();
  const password = process.env.SEED_DAVID_PASSWORD ?? 'David@Arandano2026!';
  const name = process.env.SEED_DAVID_NAME ?? 'David Herrera';
  const passwordHash = await bcrypt.hash(password, 10);

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
    if (!company) {
      throw new Error(
        `Empresa ${COMPANY_ID} no encontrada. Ejecuta npm run db:seed-platform primero.`,
      );
    }

    await prisma.module.upsert({
      where: { slug: 'tasks' },
      create: {
        slug: 'tasks',
        name: 'Tareas',
        description: 'Actividades diarias del equipo',
        sortOrder: 36,
      },
      update: { name: 'Tareas', sortOrder: 36, isActive: true },
    });

    const taskPerms = [
      { slug: 'tasks.view', name: 'Ver tareas' },
      { slug: 'tasks.create', name: 'Crear tareas' },
      { slug: 'tasks.update', name: 'Editar tareas' },
      { slug: 'tasks.delete', name: 'Eliminar tareas' },
    ];
    for (const p of taskPerms) {
      await prisma.permission.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, moduleSlug: 'tasks', name: p.name },
        update: { name: p.name },
      });
    }

    await prisma.permission.upsert({
      where: { slug: 'sales.delete' },
      create: {
        slug: 'sales.delete',
        moduleSlug: 'sales',
        name: 'Eliminar ventas',
      },
      update: { name: 'Eliminar ventas' },
    });

    const tasksModule = await prisma.module.findUniqueOrThrow({
      where: { slug: 'tasks' },
    });
    await prisma.companyModule.upsert({
      where: {
        companyId_moduleId: {
          companyId: company.id,
          moduleId: tasksModule.id,
        },
      },
      create: { companyId: company.id, moduleId: tasksModule.id, isEnabled: true },
      update: { isEnabled: true },
    });

    const ownerRole = await prisma.role.findFirst({
      where: { companyId: company.id, slug: 'owner' },
    });
    const salesDelete = await prisma.permission.findUnique({
      where: { slug: 'sales.delete' },
    });
    if (ownerRole && salesDelete) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: ownerRole.id,
            permissionId: salesDelete.id,
          },
        },
        create: {
          roleId: ownerRole.id,
          permissionId: salesDelete.id,
        },
        update: {},
      });
    }

    const managerRole = await prisma.role.upsert({
      where: {
        companyId_slug: { companyId: company.id, slug: 'manager' },
      },
      create: {
        companyId: company.id,
        slug: 'manager',
        name: 'Operaciones',
        description: 'Operación diaria sin análisis financiero ni borrar ventas',
        isSystem: true,
      },
      update: {
        name: 'Operaciones',
        description: 'Operación diaria sin análisis financiero ni borrar ventas',
      },
    });

    const managerPerms = await prisma.permission.findMany({
      where: { slug: { in: [...MANAGER_PERMISSION_SLUGS] } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: managerRole.id } });
    for (const permission of managerPerms) {
      await prisma.rolePermission.create({
        data: { roleId: managerRole.id, permissionId: permission.id },
      });
    }

    const davidUser = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name,
        active: true,
        isPlatformAdmin: false,
      },
      update: { passwordHash, name, active: true, isPlatformAdmin: false },
    });

    const membership = await prisma.companyMember.upsert({
      where: {
        companyId_userId: { companyId: company.id, userId: davidUser.id },
      },
      create: {
        companyId: company.id,
        userId: davidUser.id,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });

    await prisma.companyMemberRole.deleteMany({
      where: { companyMemberId: membership.id },
    });
    await prisma.companyMemberRole.create({
      data: { companyMemberId: membership.id, roleId: managerRole.id },
    });

    console.log('Usuario David OK:', {
      email,
      password,
      name,
      role: managerRole.slug,
      company: company.name,
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
