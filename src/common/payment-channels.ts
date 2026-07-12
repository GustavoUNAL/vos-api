/** Clasifica montos de venta por canal de cobro (Colombia). */

function parseCopToken(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

export type PaymentChannels = {
  cashCOP: number;
  nequiCOP: number;
  otherCOP: number;
};

/**
 * Parte un paymentMethod libre (Efectivo, Nequi, mixtos tipo "Efectivo 20.000 · Nequi …")
 * en canales: caja (efectivo), Nequi y otros.
 */
export function splitPaymentChannels(
  method: string,
  saleTotal: number,
): PaymentChannels {
  const trimmed = (method ?? '').trim();
  if (!trimmed || !Number.isFinite(saleTotal) || saleTotal <= 0) {
    return { cashCOP: 0, nequiCOP: 0, otherCOP: 0 };
  }

  const lower = trimmed.toLowerCase();

  // Mixtos con montos explícitos
  const cashMatch = trimmed.match(/efectivo[^0-9]*([\d.,]+)/i);
  const nequiMatch = trimmed.match(/nequi[^0-9]*([\d.,]+)/i);
  if (cashMatch || nequiMatch) {
    const cashCOP = cashMatch?.[1] ? parseCopToken(cashMatch[1]) : 0;
    const nequiCOP = nequiMatch?.[1] ? parseCopToken(nequiMatch[1]) : 0;
    const allocated = cashCOP + nequiCOP;
    const otherCOP = Math.max(0, Math.round(saleTotal) - allocated);
    return { cashCOP, nequiCOP, otherCOP };
  }

  if (
    lower === 'efectivo' ||
    lower === 'cash' ||
    lower === 'caja' ||
    (lower.includes('efectivo') && !lower.includes('nequi'))
  ) {
    return { cashCOP: Math.round(saleTotal), nequiCOP: 0, otherCOP: 0 };
  }

  if (lower === 'nequi' || lower.includes('nequi')) {
    return { cashCOP: 0, nequiCOP: Math.round(saleTotal), otherCOP: 0 };
  }

  return { cashCOP: 0, nequiCOP: 0, otherCOP: Math.round(saleTotal) };
}

export function cashAmountFromPaymentMethod(
  method: string,
  saleTotal: number,
): number {
  return splitPaymentChannels(method, saleTotal).cashCOP;
}
