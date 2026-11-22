/**
 * Valida que Main (vida personal) tenga módulos base y businessType personal.
 * Uso: npx ts-node --transpile-only scripts/ensure-main-ready.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const MAIN_ID = 'seed-main';
const CORE = ['booking', 'tasks', 'projects', 'finance'] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const company = await prisma.company.findUnique({ where: { id: MAIN_ID } });
    if (!company) throw new Error(`Empresa ${MAIN_ID} no encontrada`);

    await prisma.company.update({
      where: { id: MAIN_ID },
      data: { businessType: 'personal' },
    });

    for (const slug of CORE) {
      const mod = await prisma.module.upsert({
        where: { slug },
        create: {
          slug,
          name: slug[0]!.toUpperCase() + slug.slice(1),
          description: `Módulo ${slug}`,
          sortOrder: 10,
        },
        update: {},
      });
      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: { companyId: MAIN_ID, moduleId: mod.id },
        },
        create: { companyId: MAIN_ID, moduleId: mod.id, isEnabled: true },
        update: { isEnabled: true },
      });
    }

    const enabled = await prisma.companyModule.findMany({
      where: { companyId: MAIN_ID, isEnabled: true },
      include: { module: true },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          company: company.name,
          businessType: 'personal',
          modules: enabled.map((m) => m.module.slug).sort(),
          personalEndpoints: [
            '/personal/overview',
            '/personal/money',
            '/personal/ideas',
            '/personal/wellness',
            '/personal/aura',
            '/journal',
            '/tasks',
            '/personal/calendar',
          ],
          coreReady: CORE.every((slug) =>
            enabled.some((m) => m.module.slug === slug && m.isEnabled),
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
