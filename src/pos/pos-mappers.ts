import {
  PosOrder,
  PosOrderLine,
  PosOrderStatus,
  PosTable,
  PosTableStatus,
  Prisma,
} from '@prisma/client';
import {
  computeTotals,
  toCopNumber,
  toQtyNumber,
  toTaxRateNumber,
} from './pos-totals';

export type PosTableJson = {
  id: string;
  number: number;
  name: string;
  status: 'free' | 'occupied' | 'reserved' | 'closing';
  openedAt: string | null;
  totalCOP: number;
  orderId: string | null;
  capacity: number | null;
  guestCount: number | null;
  section: string | null;
  notes: string | null;
};

export type OrderLineJson = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
};

export type PosOrderJson = {
  id: string;
  tableId: string;
  tableName: string;
  status: 'open' | 'closing' | 'closed' | 'paid';
  lines: OrderLineJson[];
  subtotalCOP: number;
  taxRate: number;
  taxCOP: number;
  totalCOP: number;
  openedAt: string;
  closedAt: string | null;
  paidAt: string | null;
};

type TableWithOrders = PosTable & {
  orders: (PosOrder & { lines: PosOrderLine[] })[];
};

type OrderWithRelations = PosOrder & {
  table: PosTable;
  lines: PosOrderLine[];
};

export function mapTableStatus(status: PosTableStatus): PosTableJson['status'] {
  return status.toLowerCase() as PosTableJson['status'];
}

export function mapOrderStatus(status: PosOrderStatus): PosOrderJson['status'] {
  return status.toLowerCase() as PosOrderJson['status'];
}

export function activeOrder<
  T extends { status: PosOrderStatus; deletedAt: Date | null },
>(orders: T[]): T | undefined {
  return orders.find(
    (o) =>
      !o.deletedAt &&
      (o.status === PosOrderStatus.OPEN || o.status === PosOrderStatus.CLOSING),
  );
}

export function deriveTableStatus(
  stored: PosTableStatus,
  order?: { status: PosOrderStatus } | null,
): PosTableJson['status'] {
  if (order?.status === PosOrderStatus.OPEN) return 'occupied';
  if (order?.status === PosOrderStatus.CLOSING) return 'closing';
  if (stored === PosTableStatus.RESERVED) return 'reserved';
  return 'free';
}

export function mapPosTable(table: TableWithOrders): PosTableJson {
  const order = activeOrder(table.orders);
  const status = deriveTableStatus(table.status, order);
  const lines = order?.lines.filter((l) => !l.deletedAt) ?? [];
  const totals = order
    ? computeTotals(lines, order.taxRate)
  : { subtotalCOP: new Prisma.Decimal(0), taxCOP: new Prisma.Decimal(0), totalCOP: new Prisma.Decimal(0) };

  return {
    id: table.id,
    number: table.number,
    name: table.name,
    status,
    openedAt: order ? order.openedAt.toISOString() : null,
    totalCOP: toCopNumber(order ? order.totalCOP : totals.totalCOP),
    orderId: order?.id ?? null,
    capacity: table.capacity,
    guestCount: table.guestCount,
    section: table.section,
    notes: table.notes,
  };
}

export function mapOrderLine(line: PosOrderLine): OrderLineJson {
  return {
    id: line.id,
    productId: line.productId,
    productName: line.productName,
    quantity: toQtyNumber(line.quantity),
    unitPrice: toCopNumber(line.unitPrice),
    notes: line.notes,
  };
}

export function mapPosOrder(order: OrderWithRelations): PosOrderJson {
  const lines = order.lines.filter((l) => !l.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: order.id,
    tableId: order.tableId,
    tableName: order.table.name,
    status: mapOrderStatus(order.status),
    lines: lines.map(mapOrderLine),
    subtotalCOP: toCopNumber(order.subtotalCOP),
    taxRate: toTaxRateNumber(order.taxRate),
    taxCOP: toCopNumber(order.taxCOP),
    totalCOP: toCopNumber(order.totalCOP),
    openedAt: order.openedAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
  };
}
