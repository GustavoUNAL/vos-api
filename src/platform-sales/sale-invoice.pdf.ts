import * as fs from 'node:fs';
import * as path from 'node:path';
import PDFDocument from 'pdfkit';
import type { Company, Sale, SaleLine, User } from '@prisma/client';
import { resolveInvoiceContact } from './invoice-branding';

type SaleWithLines = Sale & {
  lines: SaleLine[];
  company: Pick<Company, 'name'> &
    Partial<Pick<Company, 'address' | 'phone' | 'email'>>;
  user?: Pick<User, 'name' | 'email'> | null;
};

const BRAND = {
  purple: '#6B1F4E',
  purpleSoft: '#E8D5E4',
  purpleLine: '#C9A8BE',
  ink: '#1F1F28',
  muted: '#6B6570',
  paper: '#FFFFFF',
};

function resolveBrandingAsset(file: string): string | null {
  const roots = [
    path.join(process.cwd(), 'assets', 'branding'),
    path.join(__dirname, '..', '..', '..', 'assets', 'branding'),
    path.join(__dirname, '..', '..', 'assets', 'branding'),
  ];
  for (const root of roots) {
    const full = path.join(root, file);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

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

function customerLabel(sale: SaleWithLines): string {
  return (
    sale.customerPhone?.trim() ||
    sale.mesa?.trim() ||
    sale.notes?.trim() ||
    'Cliente'
  );
}

function drawBotanicalWatermark(
  doc: InstanceType<typeof PDFDocument>,
  pageWidth: number,
  pageHeight: number,
): void {
  const botanical = resolveBrandingAsset('invoice-botanical.png');
  if (!botanical) return;

  const wmWidth = pageWidth * 0.52;
  const wmHeight = pageHeight * 0.72;
  const x = -pageWidth * 0.04;
  const y = pageHeight * 0.12;

  doc.save();
  doc.opacity(0.14);
  doc.image(botanical, x, y, {
    width: wmWidth,
    height: wmHeight,
  });
  doc.opacity(1);
  doc.restore();
}

function drawHeader(
  doc: InstanceType<typeof PDFDocument>,
  sale: SaleWithLines,
  left: number,
  width: number,
  yStart: number,
): number {
  let y = yStart;
  const contact = resolveInvoiceContact(sale.company);

  doc.font('Helvetica-Bold').fontSize(22).fillColor(BRAND.purple);
  doc.text(contact.name, left, y, { width, align: 'center' });
  y += 26;

  const contactLines = [contact.address, contact.email, contact.phone];

  if (contactLines.length) {
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted);
    for (const line of contactLines) {
      doc.text(line, left, y, { width, align: 'center' });
      y += 13;
    }
  }

  doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted);
  doc.text('Comprobante de venta', left, y, { width, align: 'center' });
  y += 22;

  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(BRAND.purpleLine).lineWidth(0.8).stroke();
  y += 18;

  doc.font('Helvetica-Bold').fontSize(18).fillColor(BRAND.purple);
  doc.text(`Nº ${saleNumber(sale)}`, left, y);
  y += 24;

  const metaLeft: [string, string][] = [
    ['Fecha', formatDate(sale.saleDate)],
    ['Cliente', customerLabel(sale)],
    ['Medio de pago', sale.paymentMethod?.trim() || '—'],
  ];

  for (const [label, value] of metaLeft) {
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted);
    doc.text(`${label}`, left, y, { width: 90 });
    doc.font('Helvetica').fontSize(10).fillColor(BRAND.ink);
    doc.text(value, left + 92, y, { width: width - 92 });
    y += 16;
  }

  return y + 8;
}

function drawLinesTable(
  doc: InstanceType<typeof PDFDocument>,
  sale: SaleWithLines,
  left: number,
  width: number,
  yStart: number,
): number {
  let y = yStart;
  const colDesc = left;
  const colQty = left + width * 0.58;
  const colUnit = left + width * 0.72;
  const colTotal = left + width * 0.84;

  doc.roundedRect(left, y, width, 18, 6).fill(BRAND.purpleSoft);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.purple);
  doc.text('Producto', colDesc + 8, y + 5);
  doc.text('Cant.', colQty, y + 5, { width: 36, align: 'right' });
  doc.text('Precio', colUnit, y + 5, { width: 52, align: 'right' });
  doc.text('Total', colTotal, y + 5, { width: 58, align: 'right' });
  y += 24;

  for (const line of sale.lines) {
    const qty = Number(line.quantity);
    const unit = Number(line.unitPrice);
    const total = qty * unit;

    doc.font('Helvetica').fontSize(9).fillColor(BRAND.ink);
    doc.text(line.productName, colDesc, y, { width: width * 0.54 });
    doc.text(String(qty), colQty, y, { width: 36, align: 'right' });
    doc.text(formatCOP(unit), colUnit, y, { width: 52, align: 'right' });
    doc.text(formatCOP(total), colTotal, y, { width: 58, align: 'right' });
    y += 18;

    doc.moveTo(left, y - 4).lineTo(left + width, y - 4).strokeColor(BRAND.purpleLine).lineWidth(0.4).stroke();
  }

  y += 10;
  const saleTotal = Number(sale.total);
  const totalBoxW = 190;
  const totalBoxH = 34;
  const totalBoxX = left + width - totalBoxW;

  doc.roundedRect(totalBoxX, y, totalBoxW, totalBoxH, 8).fill(BRAND.purple);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');
  doc.text('Total', totalBoxX + 14, y + 8);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF');
  doc.text(formatCOP(saleTotal), totalBoxX + 14, y + 18, {
    width: totalBoxW - 28,
    align: 'right',
  });
  y += totalBoxH + 18;

  doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted);
  doc.text(
    'Gracias por su visita. Conserve este comprobante.',
    left,
    y,
    { width, align: 'center' },
  );

  return y + 24;
}

export function buildSaleInvoicePdf(sale: SaleWithLines): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = 56;
    const width = pageWidth - left * 2;

    doc.rect(0, 0, pageWidth, pageHeight).fill(BRAND.paper);
    drawBotanicalWatermark(doc, pageWidth, pageHeight);

    let y = 48;
    y = drawHeader(doc, sale, left, width, y);
    drawLinesTable(doc, sale, left, width, y);

    doc.end();
  });
}

/** @deprecated Usar buildSaleInvoicePdf */
export function buildSaleInvoiceClientPdf(sale: SaleWithLines): Promise<Buffer> {
  return buildSaleInvoicePdf(sale);
}

/** @deprecated Usar buildSaleInvoicePdf */
export function buildSaleInvoiceBusinessPdf(
  sale: SaleWithLines,
): Promise<Buffer> {
  return buildSaleInvoicePdf(sale);
}

export function formatSaleReceiptText(sale: SaleWithLines): string {
  const contact = resolveInvoiceContact(sale.company);
  const lines = sale.lines
    .map((ln) => {
      const qty = Number(ln.quantity);
      const total = qty * Number(ln.unitPrice);
      return `• ${ln.productName} x${qty} — ${formatCOP(total)}`;
    })
    .join('\n');

  return [
    `*${contact.name}*`,
    contact.address,
    contact.email,
    contact.phone,
    `Comprobante Nº *${saleNumber(sale)}*`,
    `Fecha: ${formatDate(sale.saleDate)}`,
    customerLabel(sale) !== 'Cliente' ? `Cliente: ${customerLabel(sale)}` : null,
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
