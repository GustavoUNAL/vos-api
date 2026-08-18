import { minutesToHhmm, wallToUtc } from './scheduling-time';
import { rangeConflictsWith, type OccupiedRange } from './scheduling-conflict';

export type DayHours = { startMin: number; endMin: number };

export type BuildSlotsInput = {
  ymd: string;
  timeZone: string;
  durationMin: number;
  slotIntervalMin: number;
  bufferMin: number;
  hours: DayHours[];
  occupied: OccupiedRange[];
  now?: Date;
};

/**
 * Reusable availability calculator: working hours − duration − occupied − buffers.
 * Returns wall-clock HH:MM strings in the organization timezone.
 */
export function getAvailableSlots(opts: BuildSlotsInput): string[] {
  const {
    ymd,
    timeZone,
    durationMin,
    slotIntervalMin,
    bufferMin,
    hours,
    occupied,
    now = new Date(),
  } = opts;
  const step = Math.max(5, slotIntervalMin);
  const paddedOccupied = occupied.map((o) => ({
    startAt: o.startAt,
    endAt: new Date(o.endAt.getTime() + bufferMin * 60_000),
  }));
  const slots: string[] = [];
  for (const block of hours) {
    if (block.endMin <= block.startMin) continue;
    for (
      let start = block.startMin;
      start + durationMin <= block.endMin;
      start += step
    ) {
      const hhmm = minutesToHhmm(start);
      const startAt = wallToUtc(ymd, hhmm, timeZone);
      const endAt = new Date(
        startAt.getTime() + (durationMin + bufferMin) * 60_000,
      );
      if (startAt.getTime() <= now.getTime()) continue;
      if (rangeConflictsWith(startAt, endAt, paddedOccupied)) continue;
      slots.push(hhmm);
    }
  }
  return slots;
}

/** @deprecated alias — keep call sites readable as either name. */
export const buildSlots = getAvailableSlots;
