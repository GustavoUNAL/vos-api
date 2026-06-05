import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../../src/common/pg-pool-config';

export type ScriptDb = {
  prisma: PrismaClient;
  pool: Pool;
};

export async function createScriptDb(): Promise<ScriptDb> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));

  try {
    await pool.query('SELECT 1');
  } catch (e) {
    await pool.end().catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `No se pudo conectar a Postgres: ${msg}\n` +
        '• Local: npm run db:local:up y DATABASE_URL en .env (puerto 5433)\n' +
        '• Remoto (Neon/Railway): revisa DATABASE_URL y npm run db:tcp-check',
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  await prisma.$connect();
  return { prisma, pool };
}

export async function closeScriptDb({ prisma, pool }: ScriptDb): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}

const RETRYABLE = /connection closed|connection terminated|econnreset|etimedout|p1001|p1017/i;

function enrichPrismaError(e: unknown): Error {
  const code =
    typeof e === 'object' && e !== null && 'code' in e
      ? String((e as { code: unknown }).code)
      : '';
  const msg = e instanceof Error ? e.message : String(e);
  if (code === 'P2021' || /does not exist in the current database/i.test(msg)) {
    return new Error(
      'El esquema de la base de datos no está aplicado (faltan tablas).\n' +
        'Ejecuta primero: npm run db:local:up && npm run db:migrate\n' +
        'O en un solo paso: npm run db:import-legacy-sheet-sales:local',
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

export async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        typeof e === 'object' && e !== null && 'code' in e
          ? String((e as { code: unknown }).code)
          : '';
      if (code === 'P2021') {
        throw enrichPrismaError(e);
      }
      if (!RETRYABLE.test(`${code} ${msg}`) || i === attempts - 1) {
        throw enrichPrismaError(e);
      }
      const wait = 500 * (i + 1);
      console.warn(`[${label}] reintento ${i + 2}/${attempts} en ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}
