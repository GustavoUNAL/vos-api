/**
 * Helpers de seed / compatibilidad.
 * El motor usa IANA timezone; este wrapper solo aplica a scripts de demo.
 */
export { getAvailableSlots as buildSlots } from '../scheduling-engine/scheduling-availability';
export { rangesOverlap } from '../scheduling-engine/scheduling-conflict';
export {
  minutesToHhmm,
  weekdayFromYmd,
} from '../scheduling-engine/scheduling-time';

import {
  wallToUtc as wallToUtcTz,
  ymdInTimeZone,
} from '../scheduling-engine/scheduling-time';

export const BOOKING_TZ_OFFSET = '-05:00';

export function wallToUtc(
  ymd: string,
  hhmm: string,
  timeZone = 'America/Bogota',
): Date {
  return wallToUtcTz(ymd, hhmm, timeZone);
}

export function ymdInOffset(date: Date): string {
  return ymdInTimeZone(date, 'America/Bogota');
}
