/**
 * Crea o actualiza owners multi-empresa:
 * - Gustavo (SEED_GUSTAVO_*)
 * - Owner Arándano (SEED_ARANDANO_* / owner@arandano.com)
 * con acceso a Arándano Café Bar, El electricista y Main.
 * Uso: npm run db:create-gustavo-user
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { assertOperationalPassword } from '../src/common/security-policy';

const ARANDANO_ID = 'seed-arandano-cafe-bar';
const ELECTRICISTA_ID = 'seed-el-electricista';
const MAIN_ID = 'seed-main';

const PERSONAL_MODULES = ['booking', 'tasks', 'projects', 'finance'] as const;

const ENERGY_MODULES = [
  'projects',
  'tasks',
  'booking',
  'products',
  'inventory',
  'purchases',
  'sales',
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
    businessType: 'personal' | 'energy';
    modules: readonly string[];
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
      businessType: data.businessType,
    },
    update: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      status: 'ACTIVE',
      businessType: data.businessType,
    },
  });

  const catalog = await prisma.module.findMany();
  const wanted = new Set(data.modules);
  for (const mod of catalog) {
    const enabled = wanted.has(mod.slug);
    await prisma.companyModule.upsert({
      where: {
        companyId_moduleId: { companyId: company.id, moduleId: mod.id },
      },
      create: { companyId: company.id, moduleId: mod.id, isEnabled: enabled },
      update: { isEnabled: enabled },
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
      moduleSlug: { in: [...data.modules] },
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

  const email = (process.env.SEED_GUSTAVO_EMAIL ?? '').trim().toLowerCase();
  if (!email) throw new Error('SEED_GUSTAVO_EMAIL es obligatorio.');
  const password = assertOperationalPassword(
    'SEED_GUSTAVO_PASSWORD',
    process.env.SEED_GUSTAVO_PASSWORD,
  );
  const name = process.env.SEED_GUSTAVO_NAME ?? 'Gustavo Arteaga';

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
      businessType: 'energy',
      modules: ENERGY_MODULES,
    });

    const main = await provisionServiceCompany(prisma, {
      id: MAIN_ID,
      name: 'Main',
      email: 'gustavoarteaga0508@gmail.com',
      businessType: 'personal',
      modules: PERSONAL_MODULES,
    });

    const companyIds = [arandano.id, electricista.id, main.id];

    async function ensureOwnerUser(opts: {
      email: string;
      password: string;
      name: string;
      platformAdmin?: boolean;
    }) {
      const isAdmin = Boolean(opts.platformAdmin);
      const hash = await bcrypt.hash(opts.password, 10);
      const user = await prisma.user.upsert({
        where: { email: opts.email },
        create: {
          email: opts.email,
          passwordHash: hash,
          name: opts.name,
          active: true,
          isPlatformAdmin: isAdmin,
        },
        update: {
          passwordHash: hash,
          name: opts.name,
          active: true,
          isPlatformAdmin: isAdmin,
        },
      });
      const memberships = await Promise.all(
        companyIds.map((companyId) =>
          ensureOwnerMembership(prisma, companyId, user.id),
        ),
      );
      return {
        email: opts.email,
        name: opts.name,
        companies: memberships.map((m) => m.companyId),
      };
    }

    const gustavo = await ensureOwnerUser({
      email,
      password,
      name,
      platformAdmin: process.env.SEED_GUSTAVO_PLATFORM_ADMIN === 'true',
    });

    const arandanoOwnerEmail = (
      process.env.SEED_ARANDANO_EMAIL ?? 'owner@arandano.com'
    )
      .trim()
      .toLowerCase();
    const arandanoOwnerPassword = assertOperationalPassword(
      'SEED_ARANDANO_PASSWORD',
      process.env.SEED_ARANDANO_PASSWORD,
    );
    const arandanoOwnerName =
      process.env.SEED_ARANDANO_NAME ?? 'Propietario Arándano';

    const arandanoOwner = await ensureOwnerUser({
      email: arandanoOwnerEmail,
      password: arandanoOwnerPassword,
      name: arandanoOwnerName,
    });

    console.log('Usuario Gustavo OK:', gustavo);
    console.log('Usuario owner@arandano OK:', arandanoOwner);
    console.log('Empresas:', {
      arandano: arandano.name,
      electricista: electricista.name,
      main: main.name,
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
