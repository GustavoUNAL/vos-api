import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SECRET_KEY = /password|token|secret|authorization|cookie|hash/i;

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  try {
    const parsed: unknown = JSON.parse(
      JSON.stringify(value, (key, inner: unknown) => {
        if (SECRET_KEY.test(key)) return '[redacted]';
        return inner;
      }),
    );
    if (
      typeof parsed === 'string' ||
      typeof parsed === 'number' ||
      typeof parsed === 'boolean' ||
      Array.isArray(parsed) ||
      (parsed && typeof parsed === 'object')
    ) {
      return parsed as Prisma.InputJsonValue;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(entry: {
    action: AuditAction;
    tableName: string;
    recordId?: string | null;
    companyId?: string | null;
    userId?: string | null;
    oldValues?: unknown;
    newValues?: unknown;
    ipAddress?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          tableName: entry.tableName.slice(0, 120),
          recordId: entry.recordId ?? null,
          companyId: entry.companyId || null,
          userId: entry.userId || null,
          oldValues: sanitize(entry.oldValues),
          newValues: sanitize(entry.newValues),
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `No se pudo escribir AuditLog ${entry.action} ${entry.tableName}`,
        err instanceof Error ? err.message : undefined,
      );
    }
  }
}
