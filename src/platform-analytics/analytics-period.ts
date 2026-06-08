export type AnalyticsGranularity = 'day' | 'week' | 'month';

export function parseDateRange(dateFrom?: string, dateTo?: string): {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
} {
  const now = new Date();
  const defaultFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const defaultTo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );

  let from = defaultFrom;
  let to = defaultTo;

  if (dateFrom?.trim()) {
    const d = new Date(`${dateFrom.trim()}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) from = d;
  }
  if (dateTo?.trim()) {
    const d = new Date(`${dateTo.trim()}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) to = d;
  }

  if (from.getTime() > to.getTime()) {
    const swap = from;
    from = to;
    to = swap;
  }

  return {
    from,
    to,
    fromKey: from.toISOString().slice(0, 10),
    toKey: to.toISOString().slice(0, 10),
  };
}

export function periodKey(date: Date, granularity: AnalyticsGranularity): string {
  if (granularity === 'month') {
    return date.toISOString().slice(0, 7);
  }
  if (granularity === 'week') {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dow = d.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function periodLabel(key: string, granularity: AnalyticsGranularity): string {
  if (granularity === 'month') {
    const [y, m] = key.split('-');
    const dt = new Date(Number(y), Number(m) - 1, 1);
    return new Intl.DateTimeFormat('es-CO', {
      month: 'long',
      year: 'numeric',
    }).format(dt);
  }
  if (granularity === 'week') {
    const start = new Date(`${key}T12:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const fmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
    return `Sem. ${fmt.format(start)} – ${fmt.format(end)}`;
  }
  const dt = new Date(`${key}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(dt);
}

type Bucket = {
  count: number;
  totalCOP: number;
  profitCOP?: number;
  hours?: number;
};

export function mergeIntoBuckets(
  buckets: Map<string, Bucket>,
  key: string,
  patch: Partial<Bucket>,
): void {
  const prev = buckets.get(key) ?? { count: 0, totalCOP: 0 };
  buckets.set(key, {
    count: prev.count + (patch.count ?? 0),
    totalCOP: prev.totalCOP + (patch.totalCOP ?? 0),
    profitCOP: (prev.profitCOP ?? 0) + (patch.profitCOP ?? 0),
    hours: (prev.hours ?? 0) + (patch.hours ?? 0),
  });
}

export function bucketsToSeries(
  buckets: Map<string, Bucket>,
  granularity: AnalyticsGranularity,
) {
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, agg]) => ({
      period,
      label: periodLabel(period, granularity),
      count: agg.count,
      totalCOP: Math.round(agg.totalCOP),
      profitCOP:
        agg.profitCOP != null ? Math.round(agg.profitCOP) : undefined,
      hours:
        agg.hours != null
          ? Math.round(agg.hours * 100) / 100
          : undefined,
    }));
}
