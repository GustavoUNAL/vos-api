import { Prisma } from '@prisma/client';
import { movementStatsFromGroups, weightedUnitCost } from './stock-ledger';

describe('weightedUnitCost', () => {
  it('promedia el saldo anterior con la compra nueva', () => {
    const cost = weightedUnitCost(
      new Prisma.Decimal(10),
      new Prisma.Decimal(100),
      new Prisma.Decimal(10),
      new Prisma.Decimal(200),
    );
    expect(cost.toFixed(2)).toBe('150.00');
  });
});

describe('movementStatsFromGroups', () => {
  it('trata ventas y mermas como salidas', () => {
    const stats = movementStatsFromGroups([
      { type: 'PURCHASE', quantity: new Prisma.Decimal(8) },
      { type: 'SALE', quantity: new Prisma.Decimal(-3) },
      { type: 'WASTE', quantity: new Prisma.Decimal(-1) },
    ]);
    expect(stats.received).toBe(8);
    expect(stats.consumedViaSales).toBe(3);
    expect(stats.waste).toBe(1);
    expect(stats.consumedTotal).toBe(4);
  });
});
