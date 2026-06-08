import PDFDocument from 'pdfkit';
import type { Company, Sale, SaleLine, User } from '@prisma/client';

export type SaleInvoiceCopy = 'client' | 'business';

type SaleWithLines = Sale & {
  lines: SaleLine[];
  company: Pick<Company, 'name'>;
  user?: Pick<User, 'name' | 'email'> | null;
};

const BRAND = {
  berry: '#8b2942',
  berryDark: '#6b1f33',
  ink: '#1a1a2e',
  muted: '#666666',
  line: '#dddddd',
};

function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(iso);
}

function saleNumber(sale: SaleWithLines): string {
  return sale.code ?? sale.id.slice(0, 8).toUpperCase();
}

function drawArandanoLogo(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
): number {
  const berryX = x + 14;
  const berryY = y + 14;
  doc.circle(berryX, berryY, 13).fill(BRAND.berry);
  doc.circle(berryX - 4, berryY - 5, 4).fill('#ffffff33');
  doc.circle(berryX + 5, berryY + 4, 2.5).fill(BRAND.berryDark);

  const textX = x + 34;
  doc.font('Helvetica-Bold').fontSize(17).fillColor(BRAND.berry);
  doc.text('Arándano', textX, y + 2);
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted);
  doc.text('Café Bar · Pasto', textX, y + 22);
  return y + 40;
}

function drawSaleMeta(
  doc: InstanceType<typeof PDFDocument>,
  sale: SaleWithLines,
  left: number,
  width: number,
  yStart: number,
  extra?: { showInternal?: boolean },
): number {
  let y = yStart;
  const saleNo = saleNumber(sale);

  doc.font('Helvetica-Bold').fontSize(20).fillColor(BRAND.ink);
  doc.text(`Nº ${saleNo}`, left, y);
  y += 28;

  if (extra?.showInternal) {
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted);
    doc.text(`ID interno: ${sale.id}`, left, y);
    y += 14;
  }

  const rows: [string, string][] = [
    ['Fecha', formatDate(sale.saleDate)],
    ['Cliente / comanda', sale.mesa?.trim() || '—'],
    ['Medio de pago', sale.paymentMethod?.trim() || '—'],
  ];

  if (extra?.showInternal) {
    rows.push(['Origen', sale.source]);
    rows.push(['Registrado por', sale.user?.name ?? '—']);
    if (sale.customerPhone?.trim()) {
      rows.push(['Celular cliente', sale.customerPhone.trim()]);
    }
  }

  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted);
    doc.text(`${label}:`, left, y, { width: 120 });
    doc.font('Helvetica').fontSize(10).fillColor('#111111');
    doc.text(value, left + 118, y, { width: width - 118 });
    y += 16;
  }

  return y + 6;
}

function drawLinesTable(
  doc: InstanceType<typeof PDFDocument>,
  sale: SaleWithLines,
  left: number,
  width: number,
  yStart: number,
  mode: SaleInvoiceCopy,
): number {
  let y = yStart;
  const isBusiness = mode === 'business';

  const colDesc = left;
  const colQty = left + width * (isBusiness ? 0.38 : 0.55);
  const colUnit = left + width * (isBusiness ? 0.48 : 0.68);
  const colTotal = left + width * (isBusiness ? 0.62 : 0.82);
  const colCost = left + width * 0.74;
  const colProfit = left + width * 0.86;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.muted);
  doc.text('Descripción', colDesc, y);
  doc.text('Cant.', colQty, y, { width: 36, align: 'right' });
  if (isBusiness) {
    doc.text('P. unit.', colUnit, y, { width: 52, align: 'right' });
    doc.text('Subtotal', colTotal, y, { width: 58, align: 'right' });
    doc.text('Costo', colCost, y, { width: 52, align: 'right' });
    doc.text('Util.', colProfit, y, { width: 52, align: 'right' });
  } else {
    doc.text('Precio', colUnit, y, { width: 60, align: 'right' });
    doc.text('Total', colTotal, y, { width: 70, align: 'right' });
  }
  y += 14;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(BRAND.line).stroke();
  y += 8;

  let totalCost = 0;
  let totalProfit = 0;

  for (const line of sale.lines) {
    const qty = Number(line.quantity);
    const unit = Number(line.unitPrice);
    const total = qty * unit;
    const costUnit = line.costAtSale != null ? Number(line.costAtSale) : null;
    const lineCost = costUnit != null ? costUnit * qty : null;
    const lineProfit =
      line.profit != null
        ? Number(line.profit)
        : lineCost != null
          ? total - lineCost
          : null;

    if (lineCost != null) totalCost += lineCost;
    if (lineProfit != null) totalProfit += lineProfit;

    doc.font('Helvetica').fontSize(9).fillColor('#222222');
    doc.text(line.productName, colDesc, y, { width: width * (isBusiness ? 0.35 : 0.5) });
    doc.text(String(qty), colQty, y, { width: 36, align: 'right' });

    if (isBusiness) {
      doc.text(formatCOP(unit), colUnit, y, { width: 52, align: 'right' });
      doc.text(formatCOP(total), colTotal, y, { width: 58, align: 'right' });
      doc.text(lineCost != null ? formatCOP(lineCost) : '—', colCost, y, {
        width: 52,
        align: 'right',
      });
      doc.text(lineProfit != null ? formatCOP(lineProfit) : '—', colProfit, y, {
        width: 52,
        align: 'right',
      });
    } else {
      doc.text(formatCOP(unit), colUnit, y, { width: 60, align: 'right' });
      doc.text(formatCOP(total), colTotal, y, { width: 70, align: 'right' });
    }
    y += 18;
  }

  y += 4;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#cccccc').stroke();
  y += 12;

  const saleTotal = Number(sale.total);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.ink);
  doc.text('Total a pagar', left, y);
  doc.text(formatCOP(saleTotal), colTotal, y, {
    width: isBusiness ? 58 : 70,
    align: 'right',
  });
  y += 22;

  if (isBusiness) {
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted);
    doc.text(`Costo total estimado: ${formatCOP(totalCost)}`, left, y);
    y += 14;
    doc.text(`Utilidad bruta estimada: ${formatCOP(totalProfit)}`, left, y);
    y += 14;
    const margin =
      saleTotal > 0 ? ((totalProfit / saleTotal) * 100).toFixed(1) : '0.0';
    doc.text(`Margen bruto: ${margin}%`, left, y);
    y += 16;
    doc.text(`Líneas: ${sale.lines.length}`, left, y);
    y += 14;
  }

  if (sale.notes?.trim()) {
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted);
    doc.text(`Notas: ${sale.notes.trim()}`, left, y, { width });
    y += 18;
  }

  doc.font('Helvetica').fontSize(7).fillColor('#999999');
  doc.text(
    mode === 'client'
      ? 'Comprobante para el cliente. Conserve este documento. Gracias por su visita.'
      : 'Copia interna del negocio. Incluye costos y utilidad estimada al momento de la venta.',
    left,
    y,
    { width },
  );

  return y + 20;
}

function buildPdf(
  sale: SaleWithLines,
  mode: SaleInvoiceCopy,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 48;
    const width = doc.page.width - left * 2;
    let y = 48;

    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted);
    doc.text(
      mode === 'client' ? 'COMPROBANTE CLIENTE' : 'COMPROBANTE NEGOCIO',
      left,
      y,
      { width, align: 'right' },
    );
    y += 12;

    y = drawArandanoLogo(doc, left, y);
    y += 4;

    doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND.ink);
    doc.text(
      mode === 'client' ? 'Factura de venta' : 'Detalle interno de venta',
      left,
      y,
    );
    y += 20;

    doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted);
    doc.text(sale.company.name, left, y);
    y += 16;

    y = drawSaleMeta(doc, sale, left, width, y, {
      showInternal: mode === 'business',
    });
    y = drawLinesTable(doc, sale, left, width, y, mode);

    doc.end();
  });
}

export function buildSaleInvoiceClientPdf(sale: SaleWithLines): Promise<Buffer> {
  return buildPdf(sale, 'client');
}

export function buildSaleInvoiceBusinessPdf(
  sale: SaleWithLines,
): Promise<Buffer> {
  return buildPdf(sale, 'business');
}

/** @deprecated Usar buildSaleInvoiceClientPdf */
export function buildSaleInvoicePdf(sale: SaleWithLines): Promise<Buffer> {
  return buildSaleInvoiceClientPdf(sale);
}

export function formatSaleReceiptText(sale: SaleWithLines): string {
  const lines = sale.lines
    .map((ln) => {
      const qty = Number(ln.quantity);
      const total = qty * Number(ln.unitPrice);
      return `• ${ln.productName} x${qty} — ${formatCOP(total)}`;
    })
    .join('\n');

  return [
    `*${sale.company.name}*`,
    `Factura Nº *${saleNumber(sale)}*`,
    `Fecha: ${formatDate(sale.saleDate)}`,
    sale.mesa?.trim() ? `Cliente: ${sale.mesa.trim()}` : null,
    '',
    lines,
    '',
    `*Total: ${formatCOP(Number(sale.total))}*`,
    sale.paymentMethod?.trim() ? `Pago: ${sale.paymentMethod.trim()}` : null,
    '',
    'Gracias por su visita.',
  ]
    .filter((line) => line != null)
    .join('\n');
}
