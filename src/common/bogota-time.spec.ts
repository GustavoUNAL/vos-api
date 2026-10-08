import { bogotaDateKey, utcDateKey } from './bogota-time';

describe('utcDateKey', () => {
  it('conserva el día de una columna DATE y no el día anterior en Bogotá', () => {
    const stored = new Date('2026-10-06T00:00:00.000Z');
    expect(utcDateKey(stored)).toBe('2026-10-06');
    expect(bogotaDateKey(stored)).toBe('2026-10-05');
  });
});
