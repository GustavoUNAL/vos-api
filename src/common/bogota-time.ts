export const BOGOTA_TZ = 'America/Bogota';

/** Fecha calendario YYYY-MM-DD en zona Colombia. */
export function bogotaDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ }).format(d);
}

/** Hora y minuto actuales en Bogotá. */
export function bogotaClock(now = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BOGOTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

/** true si el día ya pasó la hora de cierre automático (23:59 Bogotá). */
export function isPastAutoCloseTime(dateKey: string, now = new Date()): boolean {
  const todayKey = bogotaDateKey(now);
  if (dateKey < todayKey) return true;
  if (dateKey > todayKey) return false;
  const { hour, minute } = bogotaClock(now);
  return hour > 23 || (hour === 23 && minute >= 59);
}

/** Inicio y fin del día en Bogotá (dateKey = YYYY-MM-DD). */
export function bogotaDayBounds(dateKey: string): { from: Date; to: Date } {
  return {
    from: new Date(`${dateKey}T00:00:00-05:00`),
    to: new Date(`${dateKey}T23:59:59.999-05:00`),
  };
}

/**
 * Interpreta fechas de formularios (YYYY-MM-DD o ISO) como día calendario Bogotá.
 * Evita el off-by-one de `new Date('YYYY-MM-DD')` (UTC midnight → día anterior en CO).
 */
export function parseBogotaDateInput(raw: string): Date {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return bogotaDayBounds(s).from;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Fecha inválida: ${raw}`);
  }
  return d;
}

/** Rango [from, to) del mes calendario en Bogotá. */
export function bogotaMonthBounds(
  year: number,
  month: number,
): { from: Date; to: Date } {
  const from = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00-05:00`,
  );
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const to = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00-05:00`,
  );
  return { from, to };
}
