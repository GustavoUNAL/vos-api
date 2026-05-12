const PLACE_MAX = 8;

export type PurchaseLotShortNameOptions = {
  /**
   * `purchase_lots.code` / `inventory.lot` (único). Los últimos caracteres se
   * añaden al nombre para distinguir varias compras el mismo día al mismo lugar.
   */
  lotCode?: string | null;
};

/** Calendario (día, mes, año) en zona Bogotá — compras locales. */
export function purchaseCalendarPartsBogota(purchaseDate: Date): {
  day: number;
  month: number;
  year: number;
} {
  const d =
    purchaseDate instanceof Date && !Number.isNaN(purchaseDate.getTime())
      ? purchaseDate
      : new Date();
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(d);
  const n = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { day: n('day'), month: n('month'), year: n('year') };
}

function shortenPlace(raw: string | null | undefined): string {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Compra';
  if (s.length <= PLACE_MAX) return s;
  return `${s.slice(0, PLACE_MAX - 1)}…`;
}

function suffixFromLotCode(lotCode: string | null | undefined): string {
  const c = lotCode?.trim();
  if (!c) return '';
  const tail = c.slice(-4);
  if (!tail) return '';
  return `·${tail}`;
}

/**
 * Título corto para panel: proveedor abreviado + fecha compacta (ddmmaa) +
 * opcionalmente los últimos 4 caracteres del código de lote (desambiguación).
 * Detalle largo → `notes` / comentario en API.
 */
export function formatPurchaseLotShortName(
  supplier: string | null | undefined,
  purchaseDate: Date,
  options?: PurchaseLotShortNameOptions,
): string {
  const { day, month, year } = purchaseCalendarPartsBogota(purchaseDate);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const yy = String(year % 100).padStart(2, '0');
  const place = shortenPlace(supplier);
  const compact = `${dd}${mm}${yy}`;
  return `${place} ${compact}${suffixFromLotCode(options?.lotCode)}`;
}

/** Fragmento `purchaseLot` listo para JSON (movimientos, recetas, etc.). */
export function mapPurchaseLotNestedForApi(pl: {
  id: string;
  code: string;
  supplier: string | null;
  purchaseDate: Date;
  traceModifiedAt?: Date | null;
}): {
  id: string;
  code: string;
  name: string;
  displayName: string;
  purchaseDate: string;
  supplier: string | null;
  traceModifiedAt: string | null;
} {
  const supplier = pl.supplier?.trim() || null;
  const displayName = formatPurchaseLotShortName(supplier, pl.purchaseDate, {
    lotCode: pl.code,
  });
  return {
    id: pl.id,
    code: pl.code,
    name: displayName,
    displayName,
    purchaseDate: pl.purchaseDate.toISOString(),
    supplier,
    traceModifiedAt: pl.traceModifiedAt?.toISOString() ?? null,
  };
}
