import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { nextHumanCode } from '../common/human-code';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { search?: string; active?: boolean }) {
    const where: Prisma.ClientWhereInput = {};
    if (params.active !== undefined) where.active = params.active;
    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.client.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { _count: { select: { sales: true } } },
    });

    return {
      data: rows.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        notes: c.notes,
        active: c.active,
        saleCount: c._count.sales,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    };
  }

  async findOne(idOrCode: string) {
    const client = await this.prisma.client.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
      },
      include: {
        sales: {
          orderBy: { saleDate: 'desc' },
          take: 50,
          select: {
            id: true,
            code: true,
            saleDate: true,
            total: true,
            paymentMethod: true,
            notes: true,
          },
        },
      },
    });
    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return {
      id: client.id,
      code: client.code,
      name: client.name,
      notes: client.notes,
      active: client.active,
      sales: client.sales.map((s) => ({
        id: s.id,
        code: s.code ?? s.id,
        saleDate: s.saleDate.toISOString(),
        totalCOP: Number(s.total.toFixed(0)),
        paymentMethod: s.paymentMethod,
        notes: s.notes,
      })),
    };
  }

  async create(dto: CreateClientDto) {
    const code = await nextHumanCode(this.prisma, 'client', 'C');
    const client = await this.prisma.client.create({
      data: {
        code,
        name: dto.name.trim(),
        notes: dto.notes?.trim() || null,
      },
    });
    return {
      id: client.id,
      code: client.code,
      name: client.name,
      notes: client.notes,
      active: client.active,
    };
  }

  async update(idOrCode: string, dto: UpdateClientDto) {
    const existing = await this.prisma.client.findFirst({
      where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
    });
    if (!existing) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const client = await this.prisma.client.update({
      where: { id: existing.id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    return {
      id: client.id,
      code: client.code,
      name: client.name,
      notes: client.notes,
      active: client.active,
    };
  }

  async nextCodePreview() {
    const code = await nextHumanCode(this.prisma, 'client', 'C');
    return { nextCode: code };
  }
}
