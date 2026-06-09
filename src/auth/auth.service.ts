import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCompanySystemSettings } from '../config/system-settings';
import type { AuthUserResponse, CompanySummary, JwtPayload } from './jwt.types';
import { slugifyCompanyLabel, uniqueShopSlug } from './company-slug';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private companySlugFromName(name: string, shopSlug: string | null): string {
    return shopSlug?.trim() || slugifyCompanyLabel(name);
  }

  private withSystemSettings(user: AuthUserResponse): AuthUserResponse {
    if (!user.companyId?.trim() || user.platformView) {
      return { ...user, systemSettings: { inaugurationDate: null } };
    }
    return {
      ...user,
      systemSettings: resolveCompanySystemSettings(
        user.companyId,
        user.companySlug,
      ),
    };
  }

  private async loadAllPermissions(): Promise<string[]> {
    const rows = await this.prisma.permission.findMany({
      select: { slug: true },
    });
    return rows.map((r) => r.slug);
  }

  private async loadMemberships(userId: string) {
    return this.prisma.companyMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            shopSlug: true,
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

  private membershipToSummary(
    m: Awaited<ReturnType<typeof this.loadMemberships>>[0],
  ): CompanySummary {
    return {
      id: m.company.id,
      name: m.company.name,
      slug: this.companySlugFromName(m.company.name, m.company.shopSlug),
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
    user: { id: string; email: string; name: string; isPlatformAdmin?: boolean },
    membership: Awaited<ReturnType<typeof this.loadMemberships>>[0],
  ): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin ?? false,
      platformView: false,
      companyId: membership.company.id,
      companyName: membership.company.name,
      companySlug: this.companySlugFromName(
        membership.company.name,
        membership.company.shopSlug,
      ),
      role: membership.memberRoles[0]?.role.slug ?? 'member',
      permissions: this.extractPermissions(membership),
    };
  }

  private buildPlatformPayload(
    user: { id: string; email: string; name: string },
  ): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: true,
      platformView: true,
      companyId: '',
      companyName: '',
      companySlug: '',
      role: 'platform-admin',
      permissions: ['platform.admin'],
    };
  }

  private buildPlatformCompanyPayload(
    user: { id: string; email: string; name: string },
    company: { id: string; name: string; shopSlug: string | null },
    permissions: string[],
  ): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: true,
      platformView: false,
      companyId: company.id,
      companyName: company.name,
      companySlug: this.companySlugFromName(company.name, company.shopSlug),
      role: 'platform-admin',
      permissions,
    };
  }

  private issueSession(
    user: { id: string; email: string; name: string; isPlatformAdmin?: boolean },
    membership: Awaited<ReturnType<typeof this.loadMemberships>>[0],
    allMemberships: Awaited<ReturnType<typeof this.loadMemberships>>,
  ) {
    const payload = this.buildPayload(user, membership);
    const accessToken = this.jwt.sign(payload);
    const companies = allMemberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));
    return {
      accessToken,
      user: this.withSystemSettings({ ...payload, companies }),
    };
  }

  private issuePlatformSession(
    user: { id: string; email: string; name: string },
    allMemberships: Awaited<ReturnType<typeof this.loadMemberships>>,
  ) {
    const payload = this.buildPlatformPayload(user);
    const accessToken = this.jwt.sign(payload);
    const companies = allMemberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));
    return {
      accessToken,
      user: this.withSystemSettings({ ...payload, companies }),
    };
  }

  private async issuePlatformCompanySession(
    user: { id: string; email: string; name: string },
    companyId: string,
    allMemberships: Awaited<ReturnType<typeof this.loadMemberships>>,
  ) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, status: 'ACTIVE' },
      select: { id: true, name: true, shopSlug: true },
    });
    if (!company) {
      throw new BadRequestException('Empresa no encontrada o inactiva');
    }
    const permissions = await this.loadAllPermissions();
    const payload = this.buildPlatformCompanyPayload(
      user,
      company,
      permissions,
    );
    const accessToken = this.jwt.sign(payload);
    const companies = allMemberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));
    return {
      accessToken,
      user: this.withSystemSettings({ ...payload, companies }),
    };
  }

  private async assertPlatformAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, active: true, isPlatformAdmin: true },
    });
    if (!user?.active || !user.isPlatformAdmin) {
      throw new ForbiddenException('Acceso reservado al administrador de plataforma');
    }
    return user;
  }

  private async provisionNewCompany(companyName: string, userId: string) {
    const shopSlug = await uniqueShopSlug(this.prisma, companyName);
    const company = await this.prisma.company.create({
      data: {
        name: companyName.trim(),
        shopSlug,
        status: 'ACTIVE',
      },
    });

    const modules = await this.prisma.module.findMany();
    if (!modules.length) {
      throw new BadRequestException(
        'La plataforma aún no está inicializada. Contactá soporte.',
      );
    }

    for (const mod of modules) {
      await this.prisma.companyModule.create({
        data: {
          companyId: company.id,
          moduleId: mod.id,
          isEnabled: true,
        },
      });
    }

    const ownerRole = await this.prisma.role.create({
      data: {
        companyId: company.id,
        slug: 'owner',
        name: 'Propietario',
        description: 'Acceso total dentro de la empresa',
        isSystem: true,
      },
    });

    const permissions = await this.prisma.permission.findMany();
    for (const permission of permissions) {
      await this.prisma.rolePermission.create({
        data: { roleId: ownerRole.id, permissionId: permission.id },
      });
    }

    const member = await this.prisma.companyMember.create({
      data: { companyId: company.id, userId, status: 'ACTIVE' },
    });

    await this.prisma.companyMemberRole.create({
      data: { companyMemberId: member.id, roleId: ownerRole.id },
    });

    return company;
  }

  private async verifyGoogleIdToken(idToken: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      throw new UnauthorizedException('Inicio con Google no configurado en el servidor');
    }
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) {
      throw new UnauthorizedException('Token de Google inválido');
    }
    const data = (await res.json()) as {
      aud?: string;
      email?: string;
      name?: string;
      email_verified?: string | boolean;
    };
    if (data.aud !== clientId || !data.email?.trim()) {
      throw new UnauthorizedException('Token de Google inválido');
    }
    const verified =
      data.email_verified === true || data.email_verified === 'true';
    if (!verified) {
      throw new UnauthorizedException('Email de Google no verificado');
    }
    return {
      email: data.email.trim().toLowerCase(),
      name: (data.name ?? data.email.split('@')[0] ?? 'Usuario').trim(),
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
        isPlatformAdmin: true,
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

    if (user.isPlatformAdmin) {
      return this.issuePlatformSession(user, memberships);
    }

    if (!activeMemberships.length) {
      throw new UnauthorizedException('Usuario sin empresas activas');
    }

    return this.issueSession(user, activeMemberships[0], memberships);
  }

  async register(
    name: string,
    emailRaw: string,
    password: string,
    companyName: string,
  ) {
    const email = emailRaw.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name.trim(),
        active: true,
      },
    });

    await this.provisionNewCompany(companyName, user.id);
    const memberships = await this.loadMemberships(user.id);
    const primary = memberships.find((m) => m.company.status === 'ACTIVE');
    if (!primary) {
      throw new BadRequestException('No se pudo crear la empresa');
    }

    return this.issueSession(user, primary, memberships);
  }

  async googleLogin(idToken: string, companyName?: string) {
    const profile = await this.verifyGoogleIdToken(idToken);
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        isPlatformAdmin: true,
      },
    });

    if (!user) {
      if (!companyName?.trim()) {
        throw new BadRequestException(
          'Indicá el nombre de tu empresa para registrarte con Google',
        );
      }
      const passwordHash = await bcrypt.hash(
        `google-oauth-${profile.email}-${Date.now()}`,
        10,
      );
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          passwordHash,
          name: profile.name,
          active: true,
        },
      });
      await this.provisionNewCompany(companyName.trim(), user.id);
    }

    if (!user.active) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const memberships = await this.loadMemberships(user.id);
    if (user.isPlatformAdmin) {
      return this.issuePlatformSession(user, memberships);
    }

    const activeMemberships = memberships.filter(
      (m) => m.company.status === 'ACTIVE',
    );
    if (!activeMemberships.length) {
      throw new UnauthorizedException('Usuario sin empresas activas');
    }

    return this.issueSession(user, activeMemberships[0], memberships);
  }

  async me(jwt: JwtPayload): Promise<AuthUserResponse> {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: jwt.sub },
      select: { isPlatformAdmin: true },
    });

    const memberships = await this.loadMemberships(jwt.sub);
    const companies = memberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));

    if (dbUser?.isPlatformAdmin && jwt.platformView) {
      return this.withSystemSettings({
        ...this.buildPlatformPayload({
          id: jwt.sub,
          email: jwt.email,
          name: jwt.name,
        }),
        companies,
      });
    }

    const current =
      memberships.find((m) => m.company.id === jwt.companyId) ?? memberships[0];

    if (current) {
      const payload = this.buildPayload(
        {
          id: jwt.sub,
          email: jwt.email,
          name: jwt.name,
          isPlatformAdmin: dbUser?.isPlatformAdmin ?? false,
        },
        current,
      );
      if (dbUser?.isPlatformAdmin && !jwt.platformView) {
        return this.withSystemSettings({
          ...payload,
          isPlatformAdmin: true,
          platformView: false,
          role: 'platform-admin',
          permissions: await this.loadAllPermissions(),
          companies,
        });
      }
      return this.withSystemSettings({ ...payload, companies });
    }

    if (dbUser?.isPlatformAdmin) {
      return this.withSystemSettings({
        ...this.buildPlatformPayload({
          id: jwt.sub,
          email: jwt.email,
          name: jwt.name,
        }),
        companies,
      });
    }

    return this.withSystemSettings({ ...jwt, companies });
  }

  async switchCompany(userId: string, companyId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        isPlatformAdmin: true,
      },
    });
    if (!user?.active) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    if (user.isPlatformAdmin) {
      const memberships = await this.loadMemberships(userId);
      return this.issuePlatformCompanySession(user, companyId, memberships);
    }

    const membership = await this.loadMemberships(userId);
    const target = membership.find(
      (m) => m.company.id === companyId && m.company.status === 'ACTIVE',
    );
    if (!target) {
      throw new UnauthorizedException('Sin acceso a esa empresa');
    }

    return this.issueSession(user, target, membership);
  }

  async enterCompanyAsPlatformAdmin(userId: string, companyId: string) {
    const user = await this.assertPlatformAdmin(userId);
    const memberships = await this.loadMemberships(userId);
    return this.issuePlatformCompanySession(user, companyId, memberships);
  }

  async exitToPlatformAdmin(userId: string) {
    const user = await this.assertPlatformAdmin(userId);
    const memberships = await this.loadMemberships(userId);
    return this.issuePlatformSession(user, memberships);
  }
}
