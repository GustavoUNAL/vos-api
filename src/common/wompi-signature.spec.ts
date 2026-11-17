import { wompiChecksum, wompiSignatureIsValid } from './wompi-signature';

describe('firma de Wompi', () => {
  const secret = 'events-secret-de-prueba';
  const data = {
    transaction: {
      id: 'tx-1',
      status: 'APPROVED',
      amount_in_cents: 1500000,
    },
  };
  const properties = [
    'transaction.id',
    'transaction.status',
    'transaction.amount_in_cents',
  ];

  it('acepta el checksum de las propiedades documentadas y rechaza uno alterado', () => {
    const checksum = wompiChecksum({
      data,
      properties,
      timestamp: 1700000000,
      secret,
    });
    const body = {
      event: 'transaction.updated',
      timestamp: 1700000000,
      signature: { properties, checksum },
      data,
    };
    expect(wompiSignatureIsValid(body, secret)).toBe(true);
    expect(
      wompiSignatureIsValid(
        { ...body, signature: { properties, checksum: `${checksum}aa` } },
        secret,
      ),
    ).toBe(false);
    expect(wompiSignatureIsValid(body, 'otro-secreto-distinto')).toBe(false);
    expect(wompiSignatureIsValid(body, '')).toBe(false);
  });
});
