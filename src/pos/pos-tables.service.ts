import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PosOrderStatus, PosTableStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePosTableDto } from './dto/create-pos-table.dto';
import { UpdatePosTableDto } from './dto/update-pos-table.dto';
import { PosEventsService } from './pos-events.service';
import { posBadRequest, posConflict, posNotFound } from './pos-exceptions';
import { activeOrder, mapPosOrder, mapPosTable } from './pos-mappers';
import { DEFAULT_POS_TAX_RATE } from './pos-totals';

const tableInclude = {
  orders: {
    where: { deletedAt: null, status: { in: [PosOrderStatus.OPEN, PosOrderStatus.CLOSING] } },
    include: { lines: { where: { deletedAt: null } } },
    orderBy: { openedAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.PosTableInclude;

const orderInclude = {
  table: true,
  lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.PosOrderInclude;

@Injectable()
export class PosTablesService implements OnModuleInit {
  private readonly logger = new Logger(PosTablesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PosEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureDefaultTables();
    } catch (err) {
      this.logger.error(
        'No se pudieron crear mesas POS por defecto al arrancar (revisa DATABASE_URL y migraciones).',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async ensureDefaultTables(): Promise<void> {
    const count = await this.prisma.posTable.count({ where: { deletedAt: null } });
    if (count > 0) return;

    await this.prisma.posTable.createMany({
      data: Array.from({ length: 12 }, (_, i) => {
        const number = i + 1;
        return {
          number,
          name: `Mesa ${number}`,
          status: PosTableStatus.FREE,
          capacity: 4,
          section: number <= 6 ? 'Salón' : 'Terraza',
        };
      }),
    });
  }

  async listTables() {
    const rows = await this.prisma.posTable.findMany({
      where: { deletedAt: null },
      include: tableInclude,
      orderBy: [{ section: 'asc' }, { number: 'asc' }],
    });
    const tables = rows.map(mapPosTable);
    return { tables };
  }

  async findTableEntity(id: string) {
    return this.prisma.posTable.findFirst({
      where: { id, deletedAt: null },
      include: tableInclude,
    });
  }

  private async requireTable(id: string) {
    const table = await this.findTableEntity(id);
    if (!table) {
      throw posNotFound('Mesa no encontrada', 'Verifica el identificador de la mesa.');
    }
    return table;
  }

  private hasActiveOrder(
    table: { orders: { status: PosOrderStatus; deletedAt: Date | null }[] },
  ) {
    return !!activeOrder(table.orders);
  }

  async create(dto: CreatePosTableDto) {
    const clash = await this.prisma.posTable.findFirst({
      where: { number: dto.number, deletedAt: null },
    });
    if (clash) {
      throw posConflict(
        `Ya existe una mesa con el número ${dto.number}`,
        'Usa otro número o edita la mesa existente.',
      );
    }

    const table = await this.prisma.posTable.create({
      data: {
        name: dto.name.trim(),
        number: dto.number,
        section: dto.section?.trim() || null,
        capacity: dto.capacity ?? null,
        notes: dto.notes?.trim() || null,
        status: PosTableStatus.FREE,
      },
      include: tableInclude,
    });

    await this.events.broadcastTables();
    return mapPosTable(table);
  }

  async update(tableId: string, dto: UpdatePosTableDto) {
    const table = await this.requireTable(tableId);

    if (dto.number != null && dto.number !== table.number) {
      if (this.hasActiveOrder(table)) {
        throw posConflict(
          'No se puede cambiar el número de mesa con cuenta abierta',
          'Cierra o cobra la cuenta antes de cambiar el número.',
        );
      }
      const clash = await this.prisma.posTable.findFirst({
        where: { number: dto.number, deletedAt: null, id: { not: tableId } },
      });
      if (clash) {
        throw posConflict(
          `Ya existe una mesa con el número ${dto.number}`,
          'El número de mesa debe ser único.',
        );
      }
    }

    const updated = await this.prisma.posTable.update({
      where: { id: tableId },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.number != null ? { number: dto.number } : {}),
        ...(dto.section !== undefined ? { section: dto.section?.trim() || null } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.guestCount !== undefined ? { guestCount: dto.guestCount } : {}),
      },
      include: tableInclude,
    });

    await this.events.broadcastTables();
    return mapPosTable(updated);
  }

  async open(tableId: string, userId?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const table = await tx.posTable.findFirst({
          where: { id: tableId, deletedAt: null },
          include: {
            orders: {
              where: {
                deletedAt: null,
                status: { in: [PosOrderStatus.OPEN, PosOrderStatus.CLOSING] },
              },
              include: { lines: { where: { deletedAt: null } } },
            },
          },
        });
        if (!table) {
          throw posNotFound('Mesa no encontrada');
        }

        const existing = activeOrder(table.orders);
        if (existing) {
          const full = await tx.posOrder.findFirst({
            where: { id: existing.id },
            include: orderInclude,
          });
          return full!;
        }

        if (table.status === PosTableStatus.RESERVED) {
          /* permitido abrir sobre reserva */
        } else if (table.status === PosTableStatus.CLOSING) {
          throw posConflict(
            'La mesa está cerrando cuenta',
            'Cobra o cancela la cuenta actual antes de abrir otra.',
          );
        }

        const order = await tx.posOrder.create({
          data: {
            tableId,
            userId: userId ?? null,
            status: PosOrderStatus.OPEN,
            taxRate: new Prisma.Decimal(DEFAULT_POS_TAX_RATE),
          },
          include: orderInclude,
        });

        await tx.posTable.update({
          where: { id: tableId },
          data: { status: PosTableStatus.OCCUPIED },
        });

        return order;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ).then(async (order) => {
      const json = mapPosOrder(order);
      await this.events.broadcastOrder(order.id);
      return json;
    });
  }

  async closeTable(tableId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.posOrder.findFirst({
        where: {
          tableId,
          deletedAt: null,
          status: PosOrderStatus.OPEN,
        },
      });
      if (!order) {
        throw posBadRequest(
          'No hay cuenta abierta en esta mesa',
          'Abre una cuenta antes de pedir el cierre.',
        );
      }

      await tx.posOrder.update({
        where: { id: order.id },
        data: { status: PosOrderStatus.CLOSING, closedAt: new Date() },
      });
      await tx.posTable.update({
        where: { id: tableId },
        data: { status: PosTableStatus.CLOSING },
      });

      return { ok: true as const };
    }).then(async (res) => {
      await this.events.broadcastTables();
      const order = await this.prisma.posOrder.findFirst({
        where: { tableId, status: PosOrderStatus.CLOSING, deletedAt: null },
        include: orderInclude,
      });
      if (order) await this.events.broadcastOrder(order.id);
      return res;
    });
  }

  async reserve(tableId: string) {
    const table = await this.requireTable(tableId);
    if (this.hasActiveOrder(table)) {
      throw posConflict(
        'No se puede reservar una mesa con cuenta activa',
        'Cierra la cuenta antes de reservar.',
      );
    }
    if (table.status !== PosTableStatus.FREE) {
      throw posBadRequest('Solo se pueden reservar mesas libres');
    }

    const updated = await this.prisma.posTable.update({
      where: { id: tableId },
      data: { status: PosTableStatus.RESERVED },
      include: tableInclude,
    });
    await this.events.broadcastTables();
    return mapPosTable(updated);
  }

  async unreserve(tableId: string) {
    const table = await this.requireTable(tableId);
    if (table.status !== PosTableStatus.RESERVED) {
      throw posBadRequest('La mesa no está reservada');
    }

    const updated = await this.prisma.posTable.update({
      where: { id: tableId },
      data: { status: PosTableStatus.FREE },
      include: tableInclude,
    });
    await this.events.broadcastTables();
    return mapPosTable(updated);
  }
}
