import { Prisma } from '@prisma/client';
import { computeTotals, copInt, lineAmountCOP } from './pos-totals';

describe('pos-totals', () => {
  it('calcula subtotal de línea en COP enteros', () => {
    expect(
      lineAmountCOP(new Prisma.Decimal('2'), new Prisma.Decimal('12000')).toFixed(0),
    ).toBe('24000');
  });

  it('agrega impuesto 8% y total', () => {
    const { subtotalCOP, taxCOP, totalCOP } = computeTotals(
      [{ quantity: new Prisma.Decimal('2'), unitPrice: new Prisma.Decimal('12000') }],
      0.08,
    );
    expect(subtotalCOP.toFixed(0)).toBe('24000');
    expect(taxCOP.toFixed(0)).toBe('1920');
    expect(totalCOP.toFixed(0)).toBe('25920');
  });

  it('redondea COP sin decimales', () => {
    expect(copInt('12.6').toFixed(0)).toBe('13');
  });
});
