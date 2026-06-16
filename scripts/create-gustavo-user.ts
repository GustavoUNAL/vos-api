/**
 * Crea o actualiza Gustavo con acceso owner a Arándano Café Bar y El electricista.
 * Uso: npm run db:create-gustavo-user
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const ARANDANO_ID = 'seed-arandano-cafe-bar';
const ELECTRICISTA_ID = 'seed-el-electricista';

const SERVICE_COMPANY_MODULES = [
  'products',
  'inventory',
  'sales',
  'purchases',
  'tasks',
  'staff',
  'finance',
] as const;

async function ensureOwnerMembership(
  prisma: PrismaClient,
  companyId: string,
  userId: string,
) {
  const ownerRole = await prisma.role.findFirst({
    where: { companyId, slug: 'owner' },
  });
  if (!ownerRole) {
    throw new Error(`Rol owner no encontrado en empresa ${companyId}`);
  }

  const membership = await prisma.companyMember.upsert({
    where: { companyId_userId: { companyId, userId } },
    create: { companyId, userId, status: 'ACTIVE' },
    update: { status: 'ACTIVE' },
  });

  await prisma.companyMemberRole.deleteMany({
    where: { companyMemberId: membership.id },
  });
  await prisma.companyMemberRole.create({
    data: { companyMemberId: membership.id, roleId: ownerRole.id },
  });

  return { companyId, role: ownerRole.slug };
}

async function provisionServiceCompany(
  prisma: PrismaClient,
  data: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  },
) {
  const company = await prisma.company.upsert({
    where: { id: data.id },
    create: {
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      status: 'ACTIVE',
    },
    update: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      status: 'ACTIVE',
    },
  });

  const modules = await prisma.module.findMany({
    where: { slug: { in: [...SERVICE_COMPANY_MODULES] } },
  });

  for (const mod of modules) {
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
      description: 'Acceso total dentro de la empresa',
      isSystem: true,
    },
    update: {},
  });

  const permissions = await prisma.permission.findMany({
    where: {
      moduleSlug: { in: [...SERVICE_COMPANY_MODULES] },
    },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: ownerRole.id } });
  for (const permission of permissions) {
    await prisma.rolePermission.create({
      data: { roleId: ownerRole.id, permissionId: permission.id },
    });
  }

  return company;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const email = (process.env.SEED_GUSTAVO_EMAIL ?? 'gustavoarteaga0508@gmail.com')
    .trim()
    .toLowerCase();
  const password = process.env.SEED_GUSTAVO_PASSWORD ?? 'Gustavo2026!';
  const name = process.env.SEED_GUSTAVO_NAME ?? 'Gustavo Arteaga';
  const passwordHash = await bcrypt.hash(password, 10);

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const arandano = await prisma.company.findUnique({ where: { id: ARANDANO_ID } });
    if (!arandano) {
      throw new Error(
        `Empresa ${ARANDANO_ID} no encontrada. Ejecuta npm run db:seed-platform primero.`,
      );
    }

    const electricista = await provisionServiceCompany(prisma, {
      id: ELECTRICISTA_ID,
      name: 'El electricista',
      email: 'gustavoarteaga0508@gmail.com',
    });

    const user = await prisma.user.upsert({
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

    const memberships = await Promise.all([
      ensureOwnerMembership(prisma, arandano.id, user.id),
      ensureOwnerMembership(prisma, electricista.id, user.id),
    ]);

    console.log('Usuario Gustavo OK:', {
      email,
      password,
      name,
      companies: memberships.map((m) => m.companyId),
    });
    console.log('Empresas:', {
      arandano: arandano.name,
      electricista: electricista.name,
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
