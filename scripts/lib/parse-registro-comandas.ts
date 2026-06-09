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
  const yy = y.length === 2 ? y : y.slice(-2);
  const year = yy.length === 2 ? `20${yy}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function yearFromContext(currentDate: string | null): string {
  return currentDate?.slice(0, 4) ?? '2026';
}

function isStruck(line: string): boolean {
  return /\[tachado\]/i.test(line) || /\(\s*\$/.test(line);
}

function cleanLabel(label: string): string {
  return label
    .replace(/\s*\[.*$/g, '')
    .replace(/\s*\([^)]*$/g, '')
    .trim();
}

function parseLineItem(line: string): ParsedLine | null {
  if (isStruck(line)) return null;
  const trimmed = line.trim();

  const negMatch = trimmed.match(
    /^(?:--\s*)?(?:descuento|falta de ripio)\s+-?\$?\s*([\d.,]+)/i,
  );
  if (negMatch) {
    const amt = parseMoney(negMatch[1]!);
    if (amt != null) {
      const v = -amt;
      return { qty: 1, label: 'Descuento', unitPrice: v, lineTotal: v };
    }
  }

  const propina = trimmed.match(/^PROPINA\s+\$?\s*([\d.,]+)(?:\s+\$?\s*([\d.,]+))?/i);
  if (propina) {
    const amt = parseMoney(propina[2] ?? propina[1]!);
    if (amt != null) {
      return { qty: 1, label: 'Propina', unitPrice: amt, lineTotal: amt };
    }
  }

  const m = trimmed.match(
    /^\s*(\d+)\s+x\s+(.+?)\s+\$?\s*([\d.,]+)(?:\s*(?:c\/u|each)\s*)?(?:\$?\s*([\d.,]+))?/i,
  );
  if (!m) return null;

  const qty = Number(m[1]);
  const label = cleanLabel(m[2]!);
  const p1 = parseMoney(m[3]!);
  const p2 = m[4] ? parseMoney(m[4]) : null;
  if (!Number.isFinite(qty) || qty <= 0 || p1 == null || !label) return null;

  let unitPrice: number;
  let lineTotal: number;

  if (p2 != null) {
    unitPrice = p1;
    lineTotal = p2;
    if (qty > 1 && p2 === p1) {
      lineTotal = p1 * qty;
    }
  } else if (qty === 1) {
    unitPrice = p1;
    lineTotal = p1;
  } else {
    const asUnitTotal = p1 * qty;
    const asLineUnit = p1 / qty;
    if (Number.isInteger(asLineUnit) && asLineUnit >= 500) {
      unitPrice = asLineUnit;
      lineTotal = p1;
    } else {
      unitPrice = p1;
      lineTotal = asUnitTotal;
    }
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

function isSkippableCustomer(name: string): boolean {
  return (
    /^\(múltiples/i.test(name) ||
    /ver cierre de cuaderno/i.test(name)
  );
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
  let currentSubtotal: number | null = null;
  let closureDraft: Partial<DailyClosure> | null = null;

  const resetComanda = () => {
    currentCustomer = null;
    currentCity = undefined;
    currentPayment = null;
    currentKind = 'sale';
    currentLines = [];
    currentSubtotal = null;
  };

  const flushComanda = (totalRaw?: string) => {
    if (!currentDate || !currentCustomer) return;
    if (isSkippableCustomer(currentCustomer) && currentLines.length === 0) {
      resetComanda();
      return;
    }

    let total = totalRaw ? parseMoney(totalRaw) : null;
    const linesSum = currentLines.reduce((s, l) => s + l.lineTotal, 0);

    if (total == null && currentSubtotal != null) {
      total = currentSubtotal;
    }

    if (total == null && currentLines.length > 0) {
      total = linesSum;
    }

    if (total == null || total <= 0) {
      if (currentKind === 'purchase' && total != null && total > 0) {
        /* ok */
      } else {
        resetComanda();
        return;
      }
    }

    const detailLines =
      currentLines.length > 0
        ? currentLines
        : [
            {
              qty: 1,
              label:
                currentKind === 'purchase' ? 'Compra registrada' : 'Consumo',
              unitPrice: total!,
              lineTotal: total!,
            },
          ];

    comandas.push({
      date: currentDate,
      customer: currentCustomer,
      kind: currentKind,
      paymentMethod: currentKind === 'sale' ? currentPayment : null,
      total: total!,
      lines: detailLines,
      city: currentCity,
    });
    resetComanda();
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

  const applyInlineDate = (d: string, m: string, y: string) => {
    currentDate = toIsoDate(d, m, y);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

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
        const ventas = line.match(
          /Total\s+(?:ventas|vendido)\s*:\s*\$?\s*([\d.,]+)/i,
        );
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

    const fecha = line.match(/^FECHA:\s*(\d{2})\/(\d{2})\/(\d{2})/);
    if (fecha) {
      flushComanda();
      applyInlineDate(fecha[1]!, fecha[2]!, fecha[3]!);
      continue;
    }

    const innerFecha = line.match(
      /^Fecha:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
    );
    if (innerFecha && currentCustomer) {
      applyInlineDate(
        innerFecha[1]!,
        innerFecha[2]!,
        innerFecha[3]!.length <= 2
          ? innerFecha[3]!
          : innerFecha[3]!.slice(-2),
      );
      continue;
    }

    const diaMes = line.match(/D[IÍ]A\s+(\d{1,2})\s*\/\s*MES\s+(\d{1,2})/i);
    if (diaMes) {
      const y = yearFromContext(currentDate).slice(-2);
      applyInlineDate(diaMes[1]!, diaMes[2]!, y);
      continue;
    }

    const comanda = line.match(/^COMANDA:\s*(.+)/i);
    if (comanda) {
      flushComanda();
      currentCustomer = comanda[1]!.trim();
      if (/^\(sin nombre\)/i.test(currentCustomer)) {
        currentCustomer = 'Sin nombre';
      }
      continue;
    }

    if (/^Ciudad:\s*Pasto/i.test(line)) currentCity = 'Pasto';

    if (/Tipo:\s*COMPRA/i.test(line)) currentKind = 'purchase';

    const pagoInline = line.match(/Pago:\s*(.+)/i);
    if (pagoInline) currentPayment = normalizePayment(pagoInline[1]!);

    const item = parseLineItem(line);
    if (item && currentCustomer && !isSkippableCustomer(currentCustomer)) {
      currentLines.push(item);
    }

    const dashPrice = line.match(/^-\s*\$?\s*([\d.,]+)/);
    if (
      dashPrice &&
      currentCustomer &&
      !isSkippableCustomer(currentCustomer) &&
      !item
    ) {
      const amt = parseMoney(dashPrice[1]!);
      if (amt != null) {
        currentLines.push({
          qty: 1,
          label: 'Ítem',
          unitPrice: amt,
          lineTotal: amt,
        });
      }
    }

    const subtotal = line.match(/^Subtotal(?:\s+\w+)?\s+\$?\s*([\d.,]+)/i);
    if (subtotal) {
      const amt = parseMoney(subtotal[1]!);
      if (amt != null) currentSubtotal = amt;
    }

    if (
      /^TOTAL:\s*\(ilegible\)/i.test(line) ||
      /^Total:\s*\(ilegible\)/i.test(line)
    ) {
      if (currentCustomer) flushComanda();
      continue;
    }

    const total = line.match(/^TOTAL:\s*~?\$?\s*([\d.,]+)/i);
    if (total && currentCustomer) {
      flushComanda(total[1]!);
      continue;
    }

    const totalSlash = line.match(
      /^TOTAL:\s*.*\$?\s*([\d.,]+)\s*\/\s*\$?\s*([\d.,]+)/i,
    );
    if (totalSlash && currentCustomer) {
      flushComanda(totalSlash[2]!);
      continue;
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
