import type { PoolConfig } from 'pg';

/** Pool de `pg` con SSL para hosts remotos (Neon, Railway, etc.). */
export function pgPoolConfig(connectionString: string): PoolConfig {
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
  const needsSslObject = !isLocal && !hasSslMode;
  const isNeon = host.includes('neon.tech');

  return {
    connectionString,
    // Neon pooler: pocos clientes del app; el pooler escala del otro lado.
    max: isNeon ? 5 : 10,
    min: 0,
    connectionTimeoutMillis: 15_000,
    // Reciclar idle antes de que Neon/AWS corte el socket (evita "Operation has timed out").
    idleTimeoutMillis: isNeon ? 8_000 : 60_000,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    // Limitar queries colgadas en conexiones zombi.
    statement_timeout: isNeon ? 20_000 : undefined,
    query_timeout: isNeon ? 20_000 : undefined,
    ...(needsSslObject ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}
