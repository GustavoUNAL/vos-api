import { summarizeUsage, TRIAL_LIMITS } from './usage.service';

describe('summarizeUsage', () => {
  const base = {
    storageUsedBytes: 0,
    storageLimitBytes: TRIAL_LIMITS.storageBytes,
    products: 0,
    sales: 0,
    purchases: 0,
    inventory: 0,
    appointments: 0,
  };

  it('deja Pro sin tope ni oferta', () => {
    const usage = summarizeUsage({
      ...base,
      plan: 'PRO',
      products: 999,
      storageUsedBytes: TRIAL_LIMITS.storageBytes * 4,
    });
    expect(usage.overLimit).toBe(false);
    expect(usage.offerPro).toBe(false);
    expect(usage.percent).toBe(0);
  });

  it('avisa Pro al 70% del cupo de prueba', () => {
    const usage = summarizeUsage({
      ...base,
      plan: 'TRIAL',
      products: 28,
    });
    expect(usage.offerPro).toBe(true);
    expect(usage.overLimit).toBe(false);
    expect(usage.percent).toBe(70);
  });

  it('deja Empresa sin tope', () => {
    const usage = summarizeUsage({
      ...base,
      plan: 'BUSINESS',
      products: 999,
      storageUsedBytes: TRIAL_LIMITS.storageBytes * 4,
    });
    expect(usage.overLimit).toBe(false);
    expect(usage.offerPro).toBe(false);
    expect(usage.percent).toBe(0);
  });
});
