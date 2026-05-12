import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PurchaseLotsService } from './purchase-lots.service';

describe('PurchaseLotsService — validación totalValue vs comprobante', () => {
  it('rechaza PATCH de totalValue que no coincide con la suma de líneas (costo histórico)', async () => {
    const prisma = {
      purchaseLot: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'lot1', code: 'L-1' })
          .mockResolvedValueOnce({
            id: 'lot1',
            code: 'L-1',
            supplier: 'Acme',
            purchaseDate: new Date('2026-01-15T12:00:00.000Z'),
            name: 'Acme 15/01/26',
            traceModifiedAt: null,
          }),
        update: jest.fn(),
      },
      purchaseLotLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            purchaseLotCode: 'L-1',
            inventoryItemId: 'inv1',
            quantityPurchased: new Prisma.Decimal(1),
            purchaseUnitCostCOP: new Prisma.Decimal('500.00'),
            lineTotalCOP: new Prisma.Decimal('500.00'),
            category: null,
          },
        ]),
      },
      inventory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv1',
            quantity: new Prisma.Decimal(1),
            deletedAt: null,
            unitCost: new Prisma.Decimal('500.00'),
            category: { name: 'INSUMOS' },
          },
        ]),
      },
    };
    const service = new PurchaseLotsService(prisma as any);
    await expect(
      service.update('lot1', { totalValue: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.purchaseLot.update).not.toHaveBeenCalled();
  });
});
