import { formatHumanCode } from './human-code';

describe('human-code', () => {
  it('formatea códigos con padding', () => {
    expect(formatHumanCode('C', 1)).toBe('C001');
    expect(formatHumanCode('V', 26)).toBe('V026');
    expect(formatHumanCode('D', 61)).toBe('D061');
  });
});
