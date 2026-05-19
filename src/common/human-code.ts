import { Prisma } from '@prisma/client';

export type HumanCodePrefix = 'C' | 'V' | 'D';

type Db = {
  client: { findMany: (args: object) => Promise<{ code: string }[]> };
  sale: { findMany: (args: object) => Promise<{ code: string | null; id: string }[]> };
  saleLine: { findMany: (args: object) => Promise<{ code: string | null }[]> };
};

function maxNumericSuffix(codes: string[], prefix: HumanCodePrefix): number {
  let max = 0;
  for (const raw of codes) {
    if (!raw?.startsWith(prefix)) continue;
    const n = parseInt(raw.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export function formatHumanCode(prefix: HumanCodePrefix, n: number): string {
  return `${prefix}${String(n).padStart(3, '0')}`;
}

/** Siguiente código disponible (C026, V026, D061, …). */
export async function nextHumanCode(
  db: Db,
  kind: 'client' | 'sale' | 'saleLine',
  prefix: HumanCodePrefix,
): Promise<string> {
  let codes: string[] = [];

  if (kind === 'client') {
    const rows = await db.client.findMany({ select: { code: true } });
    codes = rows.map((r) => r.code);
  } else if (kind === 'sale') {
    const byCode = await db.sale.findMany({
      where: { code: { not: null } },
      select: { code: true, id: true },
    });
    const byId = await db.sale.findMany({
      where: { id: { startsWith: prefix } },
      select: { code: true, id: true },
    });
    codes = [
      ...byCode.map((r) => r.code!).filter(Boolean),
      ...byId.map((r) => r.id),
    ];
  } else {
    const rows = await db.saleLine.findMany({
      where: { code: { not: null } },
      select: { code: true },
    });
    codes = rows.map((r) => r.code!).filter(Boolean);
  }

  return formatHumanCode(prefix, maxNumericSuffix(codes, prefix) + 1);
}

export async function nextHumanCodeTx(
  tx: Prisma.TransactionClient,
  kind: 'client' | 'sale' | 'saleLine',
  prefix: HumanCodePrefix,
): Promise<string> {
  return nextHumanCode(tx, kind, prefix);
}
