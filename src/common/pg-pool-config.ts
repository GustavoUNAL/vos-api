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

  return {
    connectionString,
    max: 10,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 60_000,
    keepAlive: true,
    ...(needsSslObject ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}
