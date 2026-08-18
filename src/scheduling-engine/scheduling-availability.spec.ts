import { getAvailableSlots } from './scheduling-availability';
import { wallToUtc } from './scheduling-time';

const TZ = 'America/Bogota';

function occupied(ymd: string, start: string, end: string) {
  return { startAt: wallToUtc(ymd, start, TZ), endAt: wallToUtc(ymd, end, TZ) };
}

describe('getAvailableSlots', () => {
  const ymd = '2026-08-17'; // lunes
  const hours = [{ startMin: 8 * 60, endMin: 18 * 60 }];
  const now = wallToUtc('2026-08-16', '12:00', TZ);

  it('devuelve slots de 40 min respetando citas 09:00-09:40 y 11:00-11:40', () => {
    const slots = getAvailableSlots({
      ymd,
      timeZone: TZ,
      durationMin: 40,
      slotIntervalMin: 20,
      bufferMin: 0,
      hours,
      occupied: [
        occupied(ymd, '09:00', '09:40'),
        occupied(ymd, '11:00', '11:40'),
      ],
      now,
    });
    expect(slots).toContain('08:00');
    expect(slots).toContain('08:20');
    expect(slots).not.toContain('09:00');
    expect(slots).not.toContain('08:40'); // 08:40-09:20 choca con 09:00-09:40
    expect(slots).toContain('09:40');
    expect(slots).not.toContain('11:00');
    expect(slots).not.toContain('10:40'); // 10:40-11:20 choca con 11:00
    expect(slots).toContain('11:40');
  });

  it('no ofrece 10:20 si ya hay 10:00-10:40', () => {
    const slots = getAvailableSlots({
      ymd,
      timeZone: TZ,
      durationMin: 40,
      slotIntervalMin: 20,
      bufferMin: 0,
      hours,
      occupied: [occupied(ymd, '10:00', '10:40')],
      now,
    });
    expect(slots).not.toContain('10:00');
    expect(slots).not.toContain('10:20');
    expect(slots).toContain('10:40');
  });

  it('respeta buffer posterior a la cita', () => {
    const slots = getAvailableSlots({
      ymd,
      timeZone: TZ,
      durationMin: 40,
      slotIntervalMin: 20,
      bufferMin: 20,
      hours,
      occupied: [occupied(ymd, '10:00', '10:40')],
      now,
    });
    expect(slots).not.toContain('10:40');
    expect(slots).toContain('11:00');
  });

  it('no genera slots fuera del horario ni en el pasado', () => {
    const slots = getAvailableSlots({
      ymd: '2026-08-16',
      timeZone: TZ,
      durationMin: 40,
      slotIntervalMin: 60,
      bufferMin: 0,
      hours,
      occupied: [],
      now: wallToUtc('2026-08-16', '10:00', TZ),
    });
    expect(slots.every((s) => s >= '10:00')).toBe(true);
    expect(slots.some((s) => s >= '18:00')).toBe(false);
  });
});
