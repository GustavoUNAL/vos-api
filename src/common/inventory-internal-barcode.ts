import { randomInt } from 'node:crypto';

/**
 * Dígito de control EAN-13 para los primeros 12 dígitos (índice 0 = más a la izquierda).
 * Peso 3,1,3,1… desde el dígito más a la derecha del bloque de 12.
 */
export function ean13CheckDigitForFirst12(d12: string): number {
  if (d12.length !== 12 || !/^\d{12}$/.test(d12)) {
    throw new Error('EAN-13: se requieren exactamente 12 dígitos');
  }
  let sum = 0;
  for (let i = 11; i >= 0; i--) {
    const digit = parseInt(d12[i]!, 10);
    const r = 11 - i;
    sum += r % 2 === 0 ? digit * 3 : digit;
  }
  const m = sum % 10;
  return m === 0 ? 0 : 10 - m;
}

/**
 * EAN-13 numérico para etiquetas internas (prefijo 200 = uso interno).
 * Escaneable con lector estándar de códigos de barras.
 */
export function generateInternalInventoryEan13(): string {
  let d12 = '200';
  for (let i = 0; i < 9; i++) {
    d12 += String(randomInt(0, 10));
  }
  return `${d12}${ean13CheckDigitForFirst12(d12)}`;
}
