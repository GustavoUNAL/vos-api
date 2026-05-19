import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool, type PoolConfig } from 'pg';

function poolConfig(connectionString: string): PoolConfig {
  let host = '';
  let hasSslMode = false;
  try {
    const u = new URL(connectionString.replace(/^postgresql:/, 'postgres:'));
    host = u.hostname;
    hasSslMode = u.searchParams.has('sslmode');
  } catch {
    /* ignore */
  }
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '::1';
  /** Railway/Heroku: SSL en URL (`sslmode`) o explícito en el pool. */
  const needsSslObject = !isLocal && !hasSslMode;

  return {
    connectionString,
    max: 5,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 60_000,
    keepAlive: true,
    ...(needsSslObject ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export type ScriptDb = {
  prisma: PrismaClient;
  pool: Pool;
};

export async function createScriptDb(): Promise<ScriptDb> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(poolConfig(url));

  try {
    await pool.query('SELECT 1');
  } catch (e) {
    await pool.end().catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `No se pudo conectar a Postgres: ${msg}\n` +
        '• Local: npm run db:local:up y DATABASE_URL en .env (puerto 5433)\n' +
        '• Remoto: revisa que Railway esté activo (npm run db:tcp-check)',
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
