/**
 * Crea o actualiza Sonia Herrera como owner (admin) solo en Arándano Café Bar.
 * Uso: npm run db:create-sonia-user
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const COMPANY_ID = 'seed-arandano-cafe-bar';
const EMAIL = (process.env.SEED_SONIA_EMAIL ?? 'sonia@arandano.com')
  .trim()
  .toLowerCase();
const PASSWORD = process.env.SEED_SONIA_PASSWORD ?? 'Sonia@Arandano2026!';
const NAME = process.env.SEED_SONIA_NAME ?? 'Sonia Herrera';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({
      where: { id: COMPANY_ID },
    });
    if (!company) {
      throw new Error(`Empresa ${COMPANY_ID} no encontrada.`);
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
