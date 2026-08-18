/**
 * Scheduling Engine — time helpers.
 * Always take an IANA timezone. Never assume Colombia or UTC in callers.
 */

export const FALLBACK_TIMEZONE = 'UTC';

type TzParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function tzParts(date: Date, timeZone: string): TzParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function resolveTimeZone(timeZone?: string | null): string {
  const tz = timeZone?.trim();
  if (!tz) return FALLBACK_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Calendar date YYYY-MM-DD in the given IANA timezone. */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  const p = tzParts(date, resolveTimeZone(timeZone));
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Clock HH:MM in the given IANA timezone. */
export function hhmmInTimeZone(date: Date, timeZone: string): string {
  const p = tzParts(date, resolveTimeZone(timeZone));
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC Instant.
 * Iteratively corrects the offset so DST-aware zones work without extra deps.
 */
export function wallToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const tz = resolveTimeZone(timeZone);
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = wanted;
  for (let i = 0; i < 4; i++) {
    const p = tzParts(new Date(utc), tz);
    const asIf = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    utc += wanted - asIf;
  }
  return new Date(utc);
}

export function minutesToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** JS weekday: 0 = Sunday … 6 = Saturday, using noon to avoid DST edges. */
export function weekdayFromYmd(ymd: string, timeZone: string): number {
  return wallToUtc(ymd, '12:00', timeZone).getUTCDay();
}

export function dayBounds(
  ymd: string,
  timeZone: string,
): { start: Date; end: Date } {
  return {
    start: wallToUtc(ymd, '00:00', timeZone),
    end: wallToUtc(ymd, '23:59', timeZone),
  };
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
