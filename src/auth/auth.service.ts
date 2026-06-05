import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUserResponse, CompanySummary, JwtPayload } from './jwt.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async loadMemberships(userId: string) {
    return this.prisma.companyMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
            companyModules: {
              where: { isEnabled: true },
              include: { module: { select: { slug: true } } },
            },
          },
        },
        memberRoles: {
          include: {
            role: {
              select: {
                slug: true,
                rolePermissions: {
                  include: { permission: { select: { slug: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  private membershipToSummary(m: Awaited<ReturnType<typeof this.loadMemberships>>[0]): CompanySummary {
    return {
      id: m.company.id,
      name: m.company.name,
      role: m.memberRoles[0]?.role.slug ?? 'member',
      modules: m.company.companyModules.map((cm) => cm.module.slug),
    };
  }

  private extractPermissions(
    m: Awaited<ReturnType<typeof this.loadMemberships>>[0],
  ): string[] {
    return [
      ...new Set(
        m.memberRoles.flatMap((mr) =>
          mr.role.rolePermissions.map((rp) => rp.permission.slug),
        ),
      ),
    ];
  }

  private buildPayload(
    user: { id: string; email: string; name: string },
    membership: Awaited<ReturnType<typeof this.loadMemberships>>[0],
  ): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      companyId: membership.company.id,
      companyName: membership.company.name,
      role: membership.memberRoles[0]?.role.slug ?? 'member',
      permissions: this.extractPermissions(membership),
    };
  }

  async login(emailRaw: string, password: string) {
    const email = (emailRaw ?? '').trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        passwordHash: true,
      },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const memberships = await this.loadMemberships(user.id);
    const activeMemberships = memberships.filter(
      (m) => m.company.status === 'ACTIVE',
    );
    if (!activeMemberships.length) {
      throw new UnauthorizedException('Usuario sin empresas activas');
    }

    const primary = activeMemberships[0];
    const payload = this.buildPayload(user, primary);
    const accessToken = await this.jwt.signAsync(payload);

    const companies = activeMemberships.map((m) => this.membershipToSummary(m));

    return {
      accessToken,
      user: { ...payload, companies } satisfies AuthUserResponse,
    };
  }

  async me(jwt: JwtPayload): Promise<AuthUserResponse> {
    const memberships = await this.loadMemberships(jwt.sub);
    const companies = memberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));

    const current =
      memberships.find((m) => m.company.id === jwt.companyId) ?? memberships[0];

    if (current) {
      return { ...this.buildPayload({ id: jwt.sub, email: jwt.email, name: jwt.name }, current), companies };
    }

    return { ...jwt, companies };
  }

  async switchCompany(userId: string, companyId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, active: true },
    });
    if (!user?.active) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const membership = await this.loadMemberships(userId);
    const target = membership.find(
      (m) => m.company.id === companyId && m.company.status === 'ACTIVE',
    );
    if (!target) {
      throw new UnauthorizedException('Sin acceso a esa empresa');
    }

    const payload = this.buildPayload(user, target);
    const accessToken = await this.jwt.signAsync(payload);
    const companies = membership
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));

    return {
      accessToken,
      user: { ...payload, companies } satisfies AuthUserResponse,
    };
  }
}
