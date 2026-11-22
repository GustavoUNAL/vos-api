import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { UpsertJournalDto } from './dto/journal.dto';

function formatEntry(row: {
  id: string;
  title: string | null;
  tags: string[];
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string };
}) {
  return {
    id: row.id,
    title: row.title,
    tags: row.tags ?? [],
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.author.id,
    authorName: row.author.name,
  };
}

@Injectable()
export class PlatformJournalService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenant: TenantContext) {
    const rows = await this.prisma.companyJournalEntry.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { updatedAt: 'desc' },
      take: 80,
      include: { author: { select: { id: true, name: true } } },
    });
    return { entries: rows.map(formatEntry) };
  }

  async create(tenant: TenantContext, dto: UpsertJournalDto) {
    const body = this.cleanBody(dto.body);
    const row = await this.prisma.companyJournalEntry.create({
      data: {
        companyId: tenant.companyId,
        authorId: tenant.userId,
        body,
        title: this.cleanTitle(dto.title),
        tags: this.cleanTags(dto.tags),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return formatEntry(row);
  }

  async update(tenant: TenantContext, id: string, dto: UpsertJournalDto) {
    const existing = await this.findOwned(tenant, id);
    const row = await this.prisma.companyJournalEntry.update({
      where: { id: existing.id },
      data: {
        body: this.cleanBody(dto.body),
        title: this.cleanTitle(dto.title),
        tags: this.cleanTags(dto.tags),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return formatEntry(row);
  }

  async remove(tenant: TenantContext, id: string) {
    const existing = await this.findOwned(tenant, id);
    await this.prisma.companyJournalEntry.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private cleanBody(value: string) {
    const body = value.trim();
    if (!body) throw new BadRequestException('Escriba la nota');
    return body;
  }

  private cleanTitle(value?: string) {
    const title = value?.trim();
    return title ? title.slice(0, 160) : null;
  }

  private cleanTags(tags?: string[]) {
    if (!tags?.length) return [];
    return [
      ...new Set(
        tags
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 12),
      ),
    ];
  }

  private async findOwned(tenant: TenantContext, id: string) {
    const row = await this.prisma.companyJournalEntry.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!row) throw new NotFoundException('Nota no encontrada');
    if (row.authorId !== tenant.userId && tenant.role !== 'platform-admin') {
      throw new ForbiddenException('Solo puede editar sus propias notas');
    }
    return row;
  }
}
