import { Prisma } from '@prisma/client';
import {
  assertPatchTotalValueCoherentWithLines,
  lineTotalForPurchaseAggregationCOP,
  lineTotalFromPurchaseParts,
  PurchaseLotTotalCoherenceError,
  roundMoneyCOP,
  sumLineTotalsCOP,
} from './purchase-lot-line-math';

describe('purchase-lot-line-math', () => {
  describe('roundMoneyCOP', () => {
    it('redondea half-up a entero COP', () => {
      expect(roundMoneyCOP('10.4').toFixed(0)).toBe('10');
      expect(roundMoneyCOP('10.5').toFixed(0)).toBe('11');
      expect(roundMoneyCOP(new Prisma.Decimal('10.5')).toFixed(0)).toBe('11');
    });

    it('no devuelve negativos', () => {
      expect(roundMoneyCOP('-3').toFixed(0)).toBe('0');
    });
  });

  describe('lineTotalFromPurchaseParts', () => {
    it('prefiere line_total explícito positivo (redondeado)', () => {
      const t = lineTotalFromPurchaseParts({
        quantityPurchased: 3,
        purchaseUnitCostCOP: 100,
        lineTotalCOP: '299.7',
      });
      expect(t.toFixed(0)).toBe('300');
    });

    it('si no hay total explícito, usa qty × unit redondeado', () => {
      const t = lineTotalFromPurchaseParts({
        quantityPurchased: 2,
        purchaseUnitCostCOP: '49.55',
        lineTotalCOP: 0,
      });
      expect(t.toFixed(0)).toBe('99');
    });
  });

  describe('sumLineTotalsCOP', () => {
    it('suma líneas según la misma convención', () => {
      const s = sumLineTotalsCOP([
        {
          quantityPurchased: 1,
          purchaseUnitCostCOP: 100,
          lineTotalCOP: 0,
        },
        {
          quantityPurchased: 1,
          purchaseUnitCostCOP: 200,
          lineTotalCOP: 0,
        },
      ]);
      expect(s.toFixed(0)).toBe('300');
    });

    it('usa costo inventario cuando comprobante y unit van en cero', () => {
      const one = lineTotalForPurchaseAggregationCOP({
        quantityPurchased: 2,
        purchaseUnitCostCOP: 0,
        lineTotalCOP: 0,
        inventoryUnitCostCOP: 50,
      });
      expect(one.toFixed(0)).toBe('100');
      const s = sumLineTotalsCOP([
        {
          quantityPurchased: 2,
          purchaseUnitCostCOP: 0,
          lineTotalCOP: 0,
          inventoryUnitCostCOP: 50,
        },
      ]);
      expect(s.toFixed(0)).toBe('100');
    });
  });

  describe('assertPatchTotalValueCoherentWithLines', () => {
    it('no lanza sin líneas', () => {
      expect(() =>
        assertPatchTotalValueCoherentWithLines(999, []),
      ).not.toThrow();
    });

    it('lanza si totalValue no cuadra', () => {
      expect(() =>
        assertPatchTotalValueCoherentWithLines(1, [
          {
            quantityPurchased: 1,
            purchaseUnitCostCOP: 500,
            lineTotalCOP: 500,
          },
        ]),
      ).toThrow(PurchaseLotTotalCoherenceError);
    });

    it('acepta desvío dentro de 1 COP', () => {
      expect(() =>
        assertPatchTotalValueCoherentWithLines(301, [
          {
            quantityPurchased: 1,
            purchaseUnitCostCOP: 100,
            lineTotalCOP: 0,
          },
          {
            quantityPurchased: 1,
            purchaseUnitCostCOP: 200,
            lineTotalCOP: 0,
          },
        ]),
      ).not.toThrow();
    });
  });
});
