export type OccupiedRange = { startAt: Date; endAt: Date };

export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function rangeConflictsWith(
  startAt: Date,
  endAt: Date,
  occupied: OccupiedRange[],
): OccupiedRange | undefined {
  return occupied.find((o) =>
    rangesOverlap(startAt, endAt, o.startAt, o.endAt),
  );
}

/** Active appointments occupy the resource; cancelled / no-show free the slot. */
export const ACTIVE_APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
] as const;

export type ActiveAppointmentStatus =
  (typeof ACTIVE_APPOINTMENT_STATUSES)[number];
