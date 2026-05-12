import {
  ean13CheckDigitForFirst12,
  generateInternalInventoryEan13,
} from './inventory-internal-barcode';

describe('inventory-internal-barcode', () => {
  it('dígito de control EAN-13 (ejemplo GS1)', () => {
    expect(ean13CheckDigitForFirst12('590123412345')).toBe(7);
  });

  it('generateInternalInventoryEan13 produce 13 dígitos válidos', () => {
    const code = generateInternalInventoryEan13();
    expect(code).toMatch(/^200\d{10}$/);
    const base = code.slice(0, 12);
    expect(code[12]).toBe(String(ean13CheckDigitForFirst12(base)));
  });
});
