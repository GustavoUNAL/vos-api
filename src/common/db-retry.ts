/** Errores transitorios de red / pool Neon (conexiones idle cortadas). */
export function isTransientDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timed out|timeout|ECONNRESET|ECONNREFUSED|Connection terminated|Connection ended|can't reach|P1001|P1008|P1017|57P01|53300/i.test(
    msg,
  );
}

/** Reintenta una vez tras errores de conexión/timeout. */
export async function withDbRetry<T>(
  run: () => Promise<T>,
  opts?: { retries?: number; delayMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 1;
  const delayMs = opts?.delayMs ?? 350;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run();
    } catch (err) {
      last = err;
      if (attempt >= retries || !isTransientDbError(err)) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw last;
}
