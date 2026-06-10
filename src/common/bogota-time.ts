export const BOGOTA_TZ = 'America/Bogota';

/** Fecha calendario YYYY-MM-DD en zona Colombia. */
export function bogotaDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ }).format(d);
}

/** Inicio y fin del día en Bogotá (dateKey = YYYY-MM-DD). */
export function bogotaDayBounds(dateKey: string): { from: Date; to: Date } {
  return {
    from: new Date(`${dateKey}T00:00:00-05:00`),
    to: new Date(`${dateKey}T23:59:59.999-05:00`),
  };
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
