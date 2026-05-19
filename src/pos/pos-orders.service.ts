import { Injectable } from '@nestjs/common';
import { PosOrderStatus, PosTableStatus, Prisma, SaleSource } from '@prisma/client';
import { nextHumanCodeTx } from '../common/human-code';
import { PrismaService } from '../prisma/prisma.service';
import { ListPosOrdersQueryDto } from './dto/list-pos-orders-query.dto';
import { OrderLineInputDto } from './dto/order-line-input.dto';
import { PatchPosOrderDto } from './dto/patch-pos-order.dto';
import { PayOrderDto } from './dto/pay-order.dto';
import { PosEventsService } from './pos-events.service';
import { posBadRequest, posConflict, posNotFound } from './pos-exceptions';
import { mapPosOrder } from './pos-mappers';
import {
  computeTotals,
  copInt,
  DEFAULT_POS_TAX_RATE,
} from './pos-totals';

const orderInclude = {
  table: true,
  lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.PosOrderInclude;

@Injectable()
export class PosOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PosEventsService,
  ) {}

  async getOrderEntity(orderId: string) {
    return this.prisma.posOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: orderInclude,
    });
  }

  private parseOrderStatus(status?: string): PosOrderStatus | undefined {
    if (!status) return undefined;
    const map: Record<string, PosOrderStatus> = {
      open: PosOrderStatus.OPEN,
      closing: PosOrderStatus.CLOSING,
      closed: PosOrderStatus.CLOSED,
      paid: PosOrderStatus.PAID,
    };
    return map[status.toLowerCase()];
  }

  private dayRange(dateFrom?: string, dateTo?: string): { gte?: Date; lte?: Date } {
    const range: { gte?: Date; lte?: Date } = {};
    if (dateFrom?.trim()) {
      range.gte = new Date(`${dateFrom.trim()}T00:00:00.000Z`);
    }
    if (dateTo?.trim()) {
      const end = new Date(`${dateTo.trim()}T23:59:59.999Z`);
      range.lte = end;
    }
    return range;
  }

  async list(query: ListPosOrdersQueryDto) {
    const status = this.parseOrderStatus(query.status);
    const where: Prisma.PosOrderWhereInput = { deletedAt: null };
    if (status) where.status = status;

    const paidRange = this.dayRange(query.dateFrom, query.dateTo);
    if (Object.keys(paidRange).length > 0) {
      if (status === PosOrderStatus.PAID) {
        where.paidAt = paidRange;
      } else {
        where.openedAt = paidRange;
      }
    }

    const rows = await this.prisma.posOrder.findMany({
      where,
      include: orderInclude,
      orderBy: { openedAt: 'desc' },
      take: 500,
    });

    return { data: rows.map(mapPosOrder) };
  }

  async getOne(orderId: string) {
    const order = await this.getOrderEntity(orderId);
    if (!order) {
      throw posNotFound('Orden no encontrada');
    }
    return mapPosOrder(order);
  }

  private async validateProduct(line: OrderLineInputDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: line.productId, deletedAt: null, active: true },
    });
    if (!product) {
      throw posBadRequest(
        `Producto no válido: ${line.productName}`,
        'El producto no existe o está inactivo.',
      );
    }
    return product;
  }

  async patch(orderId: string, dto: PatchPosOrderDto, userId?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.posOrder.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { lines: true, table: true },
      });
      if (!order) throw posNotFound('Orden no encontrada');
      if (order.status === PosOrderStatus.PAID || order.status === PosOrderStatus.CLOSED) {
        throw posConflict('No se puede editar una orden cerrada o cobrada');
      }

      if (dto.status) {
        const next = this.parseOrderStatus(dto.status);
        if (!next) throw posBadRequest('Estado de orden inválido');
        if (next === PosOrderStatus.PAID) {
          throw posBadRequest('Usa POST /pos/orders/:id/pay para cobrar');
        }
        await tx.posOrder.update({
          where: { id: orderId },
          data: {
            status: next,
            ...(next === PosOrderStatus.CLOSING ? { closedAt: new Date() } : {}),
          },
        });
        if (next === PosOrderStatus.CLOSING) {
          await tx.posTable.update({
            where: { id: order.tableId },
            data: { status: PosTableStatus.CLOSING },
          });
        }
      }

      if (dto.lines) {
        const existingIds = new Set(order.lines.filter((l) => !l.deletedAt).map((l) => l.id));
        const payloadIds = new Set(dto.lines.filter((l) => l.id).map((l) => l.id!));

        for (const id of existingIds) {
          if (!payloadIds.has(id)) {
            await tx.posOrderLine.update({
              where: { id },
              data: { deletedAt: new Date() },
            });
          }
        }

        let sortOrder = 0;
        for (const line of dto.lines) {
          await this.validateProduct(line);
          const quantity = new Prisma.Decimal(line.quantity);
          const unitPrice = copInt(line.unitPrice);

          if (line.id && existingIds.has(line.id)) {
            await tx.posOrderLine.update({
              where: { id: line.id },
              data: {
                productId: line.productId,
                productName: line.productName.trim(),
                quantity,
                unitPrice,
                notes: line.notes?.trim() || null,
                sortOrder,
              },
            });
          } else {
            await tx.posOrderLine.create({
              data: {
                orderId,
                productId: line.productId,
                productName: line.productName.trim(),
                quantity,
                unitPrice,
                notes: line.notes?.trim() || null,
                sortOrder,
              },
            });
          }
          sortOrder += 1;
        }

        const activeLines = await tx.posOrderLine.findMany({
          where: { orderId, deletedAt: null },
        });
        const totals = computeTotals(activeLines, order.taxRate);
        await tx.posOrder.update({
          where: { id: orderId },
          data: {
            subtotalCOP: totals.subtotalCOP,
            taxCOP: totals.taxCOP,
            totalCOP: totals.totalCOP,
            ...(order.status === PosOrderStatus.OPEN && activeLines.length > 0
              ? {}
              : {}),
          },
        });

        if (activeLines.length > 0 && order.status === PosOrderStatus.OPEN) {
          await tx.posTable.update({
            where: { id: order.tableId },
            data: { status: PosTableStatus.OCCUPIED },
          });
        }
      }

      return tx.posOrder.findFirst({
        where: { id: orderId },
        include: orderInclude,
      });
    });

    await this.events.broadcastOrder(orderId);
    return mapPosOrder(updated!);
  }

  async pay(orderId: string, dto: PayOrderDto, userId?: string) {
    const tipCOP = copInt(dto.tipCOP ?? 0);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.posOrder.findFirst({
          where: { id: orderId, deletedAt: null },
          include: { lines: { where: { deletedAt: null } }, table: true },
        });
        if (!order) throw posNotFound('Orden no encontrada');
        if (order.status === PosOrderStatus.PAID) {
          throw posConflict('La orden ya fue cobrada');
        }
        if (
          order.status !== PosOrderStatus.OPEN &&
          order.status !== PosOrderStatus.CLOSING
        ) {
          throw posBadRequest('La orden no está lista para cobrar');
        }
        if (!order.lines.length) {
          throw posBadRequest('La cuenta no tiene productos');
        }

        const totals = computeTotals(order.lines, order.taxRate);
        const required = copInt(totals.totalCOP.add(tipCOP));
        const paid = copInt(
          dto.splits.reduce((acc, s) => acc.add(s.amountCOP), new Prisma.Decimal(0)),
        );
        if (paid.lt(required)) {
          throw posBadRequest(
            `Pago insuficiente: recibido $${paid.toFixed(0)}, requerido $${required.toFixed(0)}`,
            'Suma los medios de pago hasta cubrir total + propina.',
          );
        }

        for (let i = 0; i < dto.splits.length; i++) {
          const split = dto.splits[i]!;
          await tx.posPayment.create({
            data: {
              orderId,
              method: split.method,
              amountCOP: copInt(split.amountCOP),
              tipCOP: i === 0 ? tipCOP : copInt(0),
            },
          });
        }

        const paymentMethod =
          dto.splits.length === 1
            ? dto.splits[0]!.method
            : dto.splits.map((s) => `${s.method}:${s.amountCOP}`).join(' + ');

        const saleCode = await nextHumanCodeTx(tx, 'sale', 'V');
        const sale = await tx.sale.create({
          data: {
            code: saleCode,
            saleDate: new Date(),
            total: totals.totalCOP,
            paymentMethod,
            source: SaleSource.CART,
            mesa: order.table.name,
            notes: dto.printReceipt ? 'POS printReceipt' : null,
            userId: userId ?? order.userId ?? null,
          },
        });

        for (const line of order.lines) {
          const lineCode = await nextHumanCodeTx(tx, 'saleLine', 'D');
          await tx.saleLine.create({
            data: {
              code: lineCode,
              saleId: sale.id,
              productId: line.productId,
              productName: line.productName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            },
          });
        }

        const paidAt = new Date();
        const closed = await tx.posOrder.update({
          where: { id: orderId },
          data: {
            status: PosOrderStatus.PAID,
            subtotalCOP: totals.subtotalCOP,
            taxCOP: totals.taxCOP,
            totalCOP: totals.totalCOP,
            paidAt,
            closedAt: order.closedAt ?? paidAt,
            saleId: sale.id,
          },
          include: orderInclude,
        });

        await tx.posTable.update({
          where: { id: order.tableId },
          data: { status: PosTableStatus.FREE, guestCount: null },
        });

        return closed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const json = mapPosOrder(result);
    this.events.emitOrderClosed(orderId, result.tableId, json);
    await this.events.broadcastTables();
    return json;
  }
}
