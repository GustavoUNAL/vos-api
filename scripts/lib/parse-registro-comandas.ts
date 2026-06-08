import * as fs from 'node:fs';

export type ParsedLine = {
  qty: number;
  label: string;
  unitPrice: number;
  lineTotal: number;
};

export type ParsedComanda = {
  date: string;
  customer: string;
  kind: 'sale' | 'purchase';
  paymentMethod: string | null;
  total: number;
  lines: ParsedLine[];
  city?: string;
};

export type DailyClosure = {
  date: string;
  comandas: number | null;
  salesCOP: number | null;
  purchasesCOP: number | null;
  schedule: string | null;
};

export type ParsedRegistro = {
  comandas: ParsedComanda[];
  closures: DailyClosure[];
};

function parseMoney(raw: string): number | null {
  const s = raw.replace(/[^\d]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIsoDate(d: string, m: string, y: string): string {
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function isStruck(line: string): boolean {
  return /\[tachado\]/i.test(line) || /^\s*\(/.test(line);
}

function parseLineItem(line: string): ParsedLine | null {
  if (isStruck(line)) return null;
  const m = line.match(
    /^\s*(\d+)\s+x\s+(.+?)\s+\$?\s*([\d.,]+)(?:\s+\$?\s*([\d.,]+))?/i,
  );
  if (!m) return null;
  const qty = Number(m[1]);
  const label = m[2]!.trim();
  const unitPrice = parseMoney(m[3]!);
  const lineTotal = m[4] ? parseMoney(m[4]) : unitPrice != null ? unitPrice * qty : null;
  if (!Number.isFinite(qty) || unitPrice == null || lineTotal == null) return null;
  if (label.toLowerCase().includes('descuento') && lineTotal < 0) {
    return { qty: 1, label, unitPrice: lineTotal, lineTotal };
  }
  return { qty, label, unitPrice, lineTotal };
}

function normalizePayment(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/nequi|negui/i.test(s)) return 'Nequi';
  if (/efectivo|cash/i.test(s)) return 'Efectivo';
  if (/pagado/i.test(s)) return 'Efectivo';
  if (/firma/i.test(s)) return 'Efectivo';
  return s.replace(/^pagado\s+/i, '').trim() || 'Efectivo';
}

export function parseRegistroText(text: string): ParsedRegistro {
  const lines = text.split(/\r?\n/);
  const comandas: ParsedComanda[] = [];
  const closures: DailyClosure[] = [];

  let currentDate: string | null = null;
  let currentCustomer: string | null = null;
  let currentCity: string | undefined;
  let currentPayment: string | null = null;
  let currentKind: 'sale' | 'purchase' = 'sale';
  let currentLines: ParsedLine[] = [];
  let closureDraft: Partial<DailyClosure> | null = null;

  const flushComanda = (totalRaw?: string) => {
    if (!currentDate || !currentCustomer) return;
    let total = totalRaw ? parseMoney(totalRaw) : null;
    if (total == null && currentLines.length > 0) {
      total = currentLines.reduce((s, l) => s + l.lineTotal, 0);
    }
    if (total == null || total <= 0) {
      if (currentKind === 'purchase' && total != null && total > 0) {
        /* ok */
      } else {
        resetComanda();
        return;
      }
    }
    comandas.push({
      date: currentDate,
      customer: currentCustomer,
      kind: currentKind,
      paymentMethod: currentKind === 'sale' ? currentPayment : null,
      total: total!,
      lines:
        currentLines.length > 0
          ? currentLines
          : [
              {
                qty: 1,
                label: currentKind === 'purchase' ? 'Compra registrada' : 'Consumo',
                unitPrice: total!,
                lineTotal: total!,
              },
            ],
      city: currentCity,
    });
    resetComanda();
  };

  const resetComanda = () => {
    currentCustomer = null;
    currentCity = undefined;
    currentPayment = null;
    currentKind = 'sale';
    currentLines = [];
  };

  const flushClosure = () => {
    if (!closureDraft?.date) return;
    closures.push({
      date: closureDraft.date,
      comandas: closureDraft.comandas ?? null,
      salesCOP: closureDraft.salesCOP ?? null,
      purchasesCOP: closureDraft.purchasesCOP ?? null,
      schedule: closureDraft.schedule ?? null,
    });
    closureDraft = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    const cierre = line.match(/^---\[\s*(\d{2})\/(\d{2})\/(\d{2})\s*\]---/);
    if (cierre) {
      flushComanda();
      flushClosure();
      closureDraft = { date: toIsoDate(cierre[1]!, cierre[2]!, cierre[3]!) };
      continue;
    }

    if (closureDraft) {
      const leavesClosure =
        /^SECCI[OÓ]N\s+2:/i.test(line) ||
        /^FECHA:\s*(\d{2})\/(\d{2})\/(\d{2})/i.test(line) ||
        /^COMANDA:/i.test(line);
      if (!leavesClosure) {
        const com = line.match(/Comandas\s*:\s*(\d+)/i);
        if (com) closureDraft.comandas = Number(com[1]);
        const ventas = line.match(/Total\s+(?:ventas|vendido)\s*:\s*\$?\s*([\d.,]+)/i);
        if (ventas) closureDraft.salesCOP = parseMoney(ventas[1]!);
        const compras = line.match(
          /Total\s+compras?(?:do)?\s*:\s*\$?\s*([\d.,]+)/i,
        );
        if (compras) closureDraft.purchasesCOP = parseMoney(compras[1]!);
        const sched = line.match(/Operaci[oó]n\s+David:\s*(.+)/i);
        if (sched) closureDraft.schedule = sched[1]!.trim();
        if (line.startsWith('---[')) flushClosure();
        continue;
      }
      flushClosure();
    }

    const fecha = line.match(/^FECHA:\s*(\d{2})\/(\d{2})\/(\d{2})/i);
    if (fecha) {
      flushComanda();
      currentDate = toIsoDate(fecha[1]!, fecha[2]!, fecha[3]!);
      continue;
    }

    const dia = line.match(/D[IÍ]A\s+(\d{1,2})\s*\/\s*MES\s+(\d{1,2})/i);
    if (dia && currentDate == null) {
      const [, d, m] = dia;
      currentDate = toIsoDate(d!, m!, '26');
    }

    const comanda = line.match(/^COMANDA:\s*(.+)/i);
    if (comanda) {
      flushComanda();
      currentCustomer = comanda[1]!.trim();
      if (/^\(sin nombre\)/i.test(currentCustomer)) currentCustomer = 'Sin nombre';
      continue;
    }

    if (/^Ciudad:\s*Pasto/i.test(line)) currentCity = 'Pasto';

    if (/Tipo:\s*COMPRA/i.test(line)) currentKind = 'purchase';

    const pago = line.match(/Pago:\s*(.+)/i);
    if (pago) currentPayment = normalizePayment(pago[1]!);

    const item = parseLineItem(line);
    if (item && currentCustomer) currentLines.push(item);

    const total = line.match(/^TOTAL:\s*~?\$?\s*([\d.,]+)/i);
    if (total && currentCustomer) {
      flushComanda(total[1]!);
      continue;
    }

    const totalSlash = line.match(/^TOTAL:\s*.*\$?\s*([\d.,]+)\s*\/\s*\$?\s*([\d.,]+)/i);
    if (totalSlash && currentCustomer) {
      flushComanda(totalSlash[2]!);
    }
  }

  flushComanda();
  flushClosure();

  return { comandas, closures };
}

export function loadRegistroFromFile(filePath: string): ParsedRegistro {
  const text = fs.readFileSync(filePath, 'utf8');
  return parseRegistroText(text);
}
