import { rangesOverlap, rangeConflictsWith } from './scheduling-conflict';

describe('scheduling-conflict', () => {
  const t = (hhmm: string) => new Date(`2026-08-17T${hhmm}:00.000Z`);

  it('detecta solapamiento 10:00-10:40 vs 10:20-11:00', () => {
    expect(rangesOverlap(t('10:00'), t('10:40'), t('10:20'), t('11:00'))).toBe(
      true,
    );
  });

  it('permite citas consecutivas 10:00-10:40 y 10:40-11:20', () => {
    expect(rangesOverlap(t('10:00'), t('10:40'), t('10:40'), t('11:20'))).toBe(
      false,
    );
  });

  it('no reporta conflicto si el rango está libre', () => {
    expect(
      rangeConflictsWith(t('12:00'), t('12:40'), [
        { startAt: t('10:00'), endAt: t('10:40') },
        { startAt: t('11:00'), endAt: t('11:40') },
      ]),
    ).toBeUndefined();
  });
});
