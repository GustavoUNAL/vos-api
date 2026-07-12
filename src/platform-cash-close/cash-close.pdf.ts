import PDFDocument from 'pdfkit';

type CashClosePdfInput = {
  date: string;
  companyName: string;
  summary: {
    saleCount: number;
    salesTotalCOP: number;
    purchaseCount: number;
    purchasesTotalCOP: number;
    netCOP: number;
    laborTotalCOP: number;
    shiftCount: number;
    expectedCashCOP?: number;
  };
  paymentsByMethod: { method: string; totalCOP: number }[];
  sales: {
    code: string | null;
    customer: string;
    paymentMethod: string;
    total: number;
  }[];
  purchases: { code: string; name: string; total: number }[];
  shifts: {
    staffName: string;
    hoursWorked: number | null;
    totalPayCOP: number | null;
  }[];
  record: {
    status: string;
    openingFloatCOP: number | null;
    countedCashCOP: number | null;
    varianceCOP: number | null;
    notes: string | null;
    closedAt: string | null;
  } | null;
};

const BRAND = {
  purple: '#6B1F4E',
  purpleLine: '#C9A8BE',
  ink: '#1F1F28',
  muted: '#6B6570',
  paper: '#FFFFFF',
  green: '#2f6f49',
};

function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatLongDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

function drawRow(
  doc: InstanceType<typeof PDFDocument>,
  left: number,
  width: number,
  y: number,
  label: string,
  value: string,
  bold = false,
): number {
  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(10)
    .fillColor(BRAND.ink);
  doc.text(label, left, y, { width: width * 0.55 });
  doc.text(value, left + width * 0.45, y, {
    width: width * 0.55,
    align: 'right',
  });
  return y + 16;
}

export function buildCashClosePdf(data: CashClosePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 48;
    const width = doc.page.width - 96;
    let y = 48;

    doc.font('Helvetica-Bold').fontSize(20).fillColor(BRAND.purple);
    doc.text(data.companyName, left, y, { width });
    y += 26;

    doc.font('Helvetica').fontSize(11).fillColor(BRAND.muted);
    doc.text('Cierre de caja diario', left, y);
    y += 16;
    doc.text(formatLongDate(data.date), left, y);
    y += 22;

    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .strokeColor(BRAND.purpleLine)
      .lineWidth(0.8)
      .stroke();
    y += 18;

    const status =
      data.record?.status === 'CLOSED' ? 'Cerrado' : 'Abierto / borrador';
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.ink);
    doc.text('Resumen del día', left, y);
    y += 20;

    y = drawRow(doc, left, width, y, 'Estado', status);
    y = drawRow(
      doc,
      left,
      width,
      y,
      'Ventas',
      `${formatCOP(data.summary.salesTotalCOP)} (${data.summary.saleCount} comandas)`,
    );
    y = drawRow(
      doc,
      left,
      width,
      y,
      'Compras',
      `${formatCOP(data.summary.purchasesTotalCOP)} (${data.summary.purchaseCount} lotes)`,
    );
    y = drawRow(
      doc,
      left,
      width,
      y,
      'Nómina',
      `${formatCOP(data.summary.laborTotalCOP)} (${data.summary.shiftCount} turnos)`,
    );
    y = drawRow(
      doc,
      left,
      width,
      y,
      'Neto del día',
      formatCOP(data.summary.netCOP),
      true,
    );
    y += 6;

    if (data.record) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.ink);
      doc.text('Arqueo de caja', left, y);
      y += 20;
      y = drawRow(
        doc,
        left,
        width,
        y,
        'Efectivo esperado',
        formatCOP(data.summary.expectedCashCOP ?? 0),
      );
      if (data.record.openingFloatCOP != null) {
        y = drawRow(
          doc,
          left,
          width,
          y,
          'Fondo inicial',
          formatCOP(data.record.openingFloatCOP),
        );
      }
      if (data.record.countedCashCOP != null) {
        y = drawRow(
          doc,
          left,
          width,
          y,
          'Efectivo contado',
          formatCOP(data.record.countedCashCOP),
        );
      }
      if (data.record.varianceCOP != null) {
        y = drawRow(
          doc,
          left,
          width,
          y,
          'Diferencia',
          formatCOP(data.record.varianceCOP),
        );
      }
      if (data.record.notes?.trim()) {
        y += 4;
        doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted);
        doc.text(`Notas: ${data.record.notes.trim()}`, left, y, { width });
        y += doc.heightOfString(data.record.notes.trim(), { width }) + 8;
      }
      y += 4;
    }

    if (data.paymentsByMethod.length) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.ink);
      doc.text('Cobros por método', left, y);
      y += 18;
      for (const p of data.paymentsByMethod) {
        y = drawRow(doc, left, width, y, p.method, formatCOP(p.totalCOP));
      }
      y += 4;
    }

    if (data.sales.length) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.ink);
      doc.text('Comandas', left, y);
      y += 18;
      for (const sale of data.sales.slice(0, 18)) {
        const label = `${sale.code ?? '—'} · ${sale.customer}`;
        y = drawRow(doc, left, width, y, label, formatCOP(sale.total));
        if (y > doc.page.height - 80) {
          doc.addPage();
          y = 48;
        }
      }
      if (data.sales.length > 18) {
        doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted);
        doc.text(`… y ${data.sales.length - 18} comandas más`, left, y);
        y += 14;
      }
    }

    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted);
    doc.text(
      `Generado ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`,
      left,
      doc.page.height - 56,
      { width, align: 'center' },
    );

    doc.end();
  });
}
