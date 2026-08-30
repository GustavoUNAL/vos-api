/**
 * Crea o actualiza jl9766151@gmail.com solo en Arándano Café Bar (owner).
 * Uso: npm run db:create-jl-arandano-user
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const COMPANY_ID = 'seed-arandano-cafe-bar';
const EMAIL = 'jl9766151@gmail.com';
const NAME = process.env.SEED_JL_ARANDANO_NAME ?? 'JL';

function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12)}!`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const password = process.env.SEED_JL_ARANDANO_PASSWORD?.trim() || randomPassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({
      where: { id: COMPANY_ID },
    });
    if (!company) {
      throw new Error(
        `Empresa ${COMPANY_ID} no encontrada. Ejecuta npm run db:seed-platform primero.`,
      );
    }

    const ownerRole = await prisma.role.findFirst({
      where: { companyId: company.id, slug: 'owner' },
    });
    if (!ownerRole) {
      throw new Error(`Rol owner no encontrado en ${company.name}`);
    }

    const now = new Date();
    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      create: {
        email: EMAIL,
        passwordHash,
        name: NAME,
        active: true,
        isPlatformAdmin: false,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
      },
      update: {
        passwordHash,
        name: NAME,
        active: true,
        isPlatformAdmin: false,
      },
    });

    const otherMemberships = await prisma.companyMember.findMany({
      where: { userId: user.id, companyId: { not: company.id } },
      select: { id: true },
    });
    if (otherMemberships.length > 0) {
      await prisma.companyMemberRole.deleteMany({
        where: {
          companyMemberId: { in: otherMemberships.map((m) => m.id) },
        },
      });
      await prisma.companyMember.deleteMany({
        where: { id: { in: otherMemberships.map((m) => m.id) } },
      });
    }

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
          password,
          name: NAME,
          role: ownerRole.slug,
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
