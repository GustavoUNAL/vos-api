import {
  formatPurchaseLotShortName,
  mapPurchaseLotNestedForApi,
  purchaseCalendarPartsBogota,
} from './purchase-lot-display-name';

describe('purchase-lot-display-name', () => {
  it('arma nombre: lugar + ddmmaa', () => {
    expect(
      formatPurchaseLotShortName('Makro', new Date('2026-05-08T17:00:00.000Z')),
    ).toBe('Makro 080526');
  });

  it('sin proveedor usa “Compra”', () => {
    expect(
      formatPurchaseLotShortName(null, new Date('2026-01-03T12:00:00.000Z')),
    ).toBe('Compra 030126');
  });

  it('añade sufijo desde código de lote (últimos 4)', () => {
    expect(
      formatPurchaseLotShortName('Makro', new Date('2026-05-08T17:00:00.000Z'), {
        lotCode: 'clxyzabcdefghijk2m9p',
      }),
    ).toBe('Makro 080526·2m9p');
  });

  it('trunca lugar largo', () => {
    const long = 'Distribuidora Internacional del Sur';
    const out = formatPurchaseLotShortName(
      long,
      new Date('2026-12-01T12:00:00.000Z'),
    );
    expect(out).toContain('…');
    expect(out).toContain('011226');
    expect(out.length).toBeLessThan(22);
  });

  it('mapPurchaseLotNestedForApi unifica name y displayName', () => {
    const out = mapPurchaseLotNestedForApi({
      id: 'lot1',
      code: 'clabcdefghijklmnop',
      supplier: 'Makro',
      purchaseDate: new Date('2026-05-08T17:00:00.000Z'),
      traceModifiedAt: new Date('2026-05-09T12:00:00.000Z'),
    });
    expect(out.displayName).toBe('Makro 080526·mnop');
    expect(out.name).toBe(out.displayName);
    expect(out.purchaseDate).toMatch(/^2026-05-08/);
    expect(out.traceModifiedAt).toMatch(/^2026-05-09/);
  });

  it('purchaseCalendarPartsBogota', () => {
    const p = purchaseCalendarPartsBogota(new Date('2026-05-08T07:00:00.000Z'));
    expect(p.month).toBe(5);
    expect(p.day).toBe(8);
    expect(p.year).toBe(2026);
  });
});
