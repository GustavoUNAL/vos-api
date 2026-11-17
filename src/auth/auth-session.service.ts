import { createHash, randomBytes } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionContext = {
  companyId?: string | null;
  platformView?: boolean;
  supportMode?: string | null;
  supportUntil?: number | null;
};

@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

  refreshTtlMs(): number {
    const days = Number(process.env.AUTH_REFRESH_DAYS ?? 14);
    const safe = Number.isFinite(days) && days >= 1 && days <= 60 ? days : 14;
    return safe * 24 * 60 * 60 * 1000;
  }

  async start(
    userId: string,
    context: SessionContext = {},
  ): Promise<{ id: string; refreshToken: string }> {
    const refreshToken = randomBytes(32).toString('base64url');
    const row = await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        companyId: context.companyId || null,
        platformView: Boolean(context.platformView),
        supportMode: context.supportMode || null,
        supportUntil: context.supportUntil ?? null,
      },
      select: { id: true },
    });
    return { id: row.id, refreshToken };
  }

  async rotate(refreshToken: string): Promise<{
    id: string;
    userId: string;
    refreshToken: string;
    companyId: string | null;
    platformView: boolean;
    supportMode: string | null;
    supportUntil: number | null;
  }> {
    const current = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        companyId: true,
        platformView: true,
        supportMode: true,
        supportUntil: true,
      },
    });
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const next = await this.start(current.userId, {
      companyId: current.companyId,
      platformView: current.platformView,
      supportMode: current.supportMode,
      supportUntil: current.supportUntil,
    });
    await this.prisma.authSession.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });
    return {
      id: next.id,
      userId: current.userId,
      refreshToken: next.refreshToken,
      companyId: current.companyId,
      platformView: current.platformView,
      supportMode: current.supportMode,
      supportUntil: current.supportUntil,
    };
  }

  async revokeByToken(
    refreshToken: string,
  ): Promise<{ id: string; userId: string } | null> {
    const row = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!row) return null;
    if (!row.revokedAt) await this.revoke(row.id);
    return { id: row.id, userId: row.userId };
  }

  async revoke(sessionId: string | undefined | null): Promise<void> {
    if (!sessionId) return;
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async assertActive(sessionId: string, userId: string): Promise<void> {
    const row = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
      select: { expiresAt: true },
    });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Sesión revocada');
    }
  }
}
