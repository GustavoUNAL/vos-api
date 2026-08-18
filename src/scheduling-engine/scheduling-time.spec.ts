import {
  hhmmInTimeZone,
  resolveTimeZone,
  wallToUtc,
  weekdayFromYmd,
  ymdInTimeZone,
} from './scheduling-time';

describe('scheduling-time', () => {
  it('convierte 10:00 America/Bogota a 15:00 UTC', () => {
    const d = wallToUtc('2026-08-16', '10:00', 'America/Bogota');
    expect(d.toISOString()).toBe('2026-08-16T15:00:00.000Z');
  });

  it('no asume Colombia: 10:00 America/New_York en verano es 14:00 UTC', () => {
    const d = wallToUtc('2026-08-16', '10:00', 'America/New_York');
    expect(d.toISOString()).toBe('2026-08-16T14:00:00.000Z');
  });

  it('ymd/hhmm round-trip en America/Bogota', () => {
    const d = wallToUtc('2026-08-16', '08:40', 'America/Bogota');
    expect(ymdInTimeZone(d, 'America/Bogota')).toBe('2026-08-16');
    expect(hhmmInTimeZone(d, 'America/Bogota')).toBe('08:40');
  });

  it('weekdayFromYmd: 2026-08-16 es domingo (0)', () => {
    expect(weekdayFromYmd('2026-08-16', 'America/Bogota')).toBe(0);
  });

  it('timezone inválida cae a UTC', () => {
    expect(resolveTimeZone('Not/AZone')).toBe('UTC');
    const d = wallToUtc('2026-08-16', '10:00', 'Not/AZone');
    expect(d.toISOString()).toBe('2026-08-16T10:00:00.000Z');
  });
});
