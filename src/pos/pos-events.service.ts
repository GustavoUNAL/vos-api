import { Injectable } from '@nestjs/common';
import { PosOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PosGateway } from './pos.gateway';
import { mapPosOrder, mapPosTable, PosOrderJson } from './pos-mappers';

const tableInclude = {
  orders: {
    where: {
      deletedAt: null,
      status: { in: [PosOrderStatus.OPEN, PosOrderStatus.CLOSING] },
    },
    include: { lines: { where: { deletedAt: null } } },
    orderBy: { openedAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.PosTableInclude;

const orderInclude = {
  table: true,
  lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const } },
} as const;

@Injectable()
export class PosEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PosGateway,
  ) {}

  async broadcastTables(): Promise<void> {
    const rows = await this.prisma.posTable.findMany({
      where: { deletedAt: null },
      include: tableInclude,
      orderBy: [{ section: 'asc' }, { number: 'asc' }],
    });
    this.gateway.emitTablesUpdated(rows.map(mapPosTable));
  }

  async broadcastOrder(orderId: string): Promise<void> {
    const order = await this.prisma.posOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: orderInclude,
    });
    if (!order) return;
    this.gateway.emitOrderUpdated(mapPosOrder(order));
    await this.broadcastTables();
  }

  emitOrderClosed(orderId: string, tableId: string, order?: PosOrderJson): void {
    this.gateway.emitOrderClosed(orderId, tableId, order);
  }
}
