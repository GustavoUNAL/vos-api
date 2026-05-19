import { Prisma } from '@prisma/client';

export const DEFAULT_POS_TAX_RATE = 0.08;

export type LineForTotal = {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
};

export function copInt(value: Prisma.Decimal | number | string): Prisma.Decimal {
  const d = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  return d.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

export function lineAmountCOP(quantity: Prisma.Decimal, unitPrice: Prisma.Decimal): Prisma.Decimal {
  return copInt(quantity.mul(unitPrice));
}

export function computeTotals(
  lines: LineForTotal[],
  taxRate: number | Prisma.Decimal,
): { subtotalCOP: Prisma.Decimal; taxCOP: Prisma.Decimal; totalCOP: Prisma.Decimal } {
  const rate =
    taxRate instanceof Prisma.Decimal ? taxRate : new Prisma.Decimal(taxRate);
  const subtotalCOP = copInt(
    lines.reduce((acc, l) => acc.add(lineAmountCOP(l.quantity, l.unitPrice)), new Prisma.Decimal(0)),
  );
  const taxCOP = copInt(subtotalCOP.mul(rate));
  const totalCOP = copInt(subtotalCOP.add(taxCOP));
  return { subtotalCOP, taxCOP, totalCOP };
}

export function toCopNumber(d: Prisma.Decimal): number {
  return Number(d.toFixed(0));
}

export function toQtyNumber(d: Prisma.Decimal): number {
  return Number(d.toString());
}

export function toTaxRateNumber(d: Prisma.Decimal): number {
  return Number(d.toString());
}
