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
import { UsageService } from '../billing/usage.service';
import { resolveCompanySystemSettings } from '../config/system-settings';
import type { AuthUserResponse, CompanySummary, JwtPayload } from './jwt.types';
import { slugifyCompanyLabel, uniqueShopSlug } from './company-slug';
import { AuditService } from '../audit/audit.service';
import { AuthSessionService } from './auth-session.service';
import {
  elevatedSupportPermissions,
  isPublicCompanySignupEnabled,
  readOnlyPermissions,
  supportWriteStillValid,
} from '../common/security-policy';
import {
  googleAuthorizeUrl,
  googleCallbackErrorCode,
  googleConfig,
  googleFrontRedirect,
  googleOAuthConfigured,
  googleProfilePicture,
  googleTokenExchangeBody,
  parseGoogleReturnTo,
  pickActiveMembership,
  sanitizeCompanyIdHint,
  type GoogleOAuthState,
  type GoogleSignupTicket,
} from './google-oauth';
import {
  BUSINESS_TYPE_MODULES,
  isBusinessTypeId,
  type BusinessTypeId,
} from './business-types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly usage: UsageService,
    private readonly sessions: AuthSessionService,
    private readonly audit: AuditService,
  ) {}

  private companySlugFromName(name: string, shopSlug: string | null): string {
    return shopSlug?.trim() || slugifyCompanyLabel(name);
  }

  private ensurePlatformAdminFlag(user: {
    isPlatformAdmin?: boolean;
  }): boolean {
    return Boolean(user.isPlatformAdmin);
  }

  private async signSession(
    userId: string,
    payload: JwtPayload,
    replaceSid?: string | null,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (replaceSid) await this.sessions.revoke(replaceSid);
    const session = await this.sessions.start(userId, {
      companyId: payload.companyId,
      platformView: payload.platformView,
      supportMode: payload.supportMode,
      supportUntil: payload.supportUntil,
    });
    const accessToken = this.jwt.sign({ ...payload, sid: session.id });
    return { accessToken, refreshToken: session.refreshToken };
  }

  private touchLastLogin(userId: string) {
    void this.prisma.user
      .update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => undefined);
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

  private async withAvatar(user: AuthUserResponse): Promise<AuthUserResponse> {
    if (!user.sub) return user;
    const row = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { avatarUrl: true },
    });
    return { ...user, avatarUrl: row?.avatarUrl ?? null };
  }

  private async withUsage(user: AuthUserResponse): Promise<AuthUserResponse> {
    let next = user;
    if (user.companyId?.trim() && !user.platformView) {
      try {
        const usage = await this.usage.getUsage(user.companyId);
        if (usage) next = { ...user, usage };
      } catch {
        /* la sesión sigue sin el cupo */
      }
    }
    return this.withAvatar(next);
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
            businessType: true,
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
      businessType: m.company.businessType ?? null,
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

  private async issueSession(
    user: { id: string; email: string; name: string; isPlatformAdmin?: boolean },
    membership: Awaited<ReturnType<typeof this.loadMemberships>>[0],
    allMemberships: Awaited<ReturnType<typeof this.loadMemberships>>,
    replaceSid?: string | null,
  ) {
    const payload = this.buildPayload(user, membership);
    const signed = await this.signSession(user.id, payload, replaceSid);
    const companies = allMemberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));
    return {
      accessToken: signed.accessToken,
      refreshToken: signed.refreshToken,
      user: await this.withUsage(
        this.withSystemSettings({ ...payload, companies }),
      ),
    };
  }

  private async issuePlatformSession(
    user: { id: string; email: string; name: string },
    allMemberships: Awaited<ReturnType<typeof this.loadMemberships>>,
    replaceSid?: string | null,
  ) {
    const payload = this.buildPlatformPayload(user);
    const signed = await this.signSession(user.id, payload, replaceSid);
    const companies = allMemberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));
    return {
      accessToken: signed.accessToken,
      refreshToken: signed.refreshToken,
      user: await this.withAvatar(
        this.withSystemSettings({ ...payload, companies }),
      ),
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
    const permissions = readOnlyPermissions(await this.loadAllPermissions());
    const payload = {
      ...this.buildPlatformCompanyPayload(user, company, permissions),
      supportMode: 'read' as const,
    };
    const signed = await this.signSession(user.id, payload);
    const companies = allMemberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));
    return {
      accessToken: signed.accessToken,
      refreshToken: signed.refreshToken,
      user: await this.withUsage(
        this.withSystemSettings({ ...payload, companies }),
      ),
    };
  }

  private async assertPlatformAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, active: true, isPlatformAdmin: true },
    });
    if (!user?.active) {
      throw new ForbiddenException('Acceso reservado al administrador de plataforma');
    }
    const isAdmin = await this.ensurePlatformAdminFlag(user);
    if (!isAdmin) {
      throw new ForbiddenException('Acceso reservado al administrador de plataforma');
    }
    return { ...user, isPlatformAdmin: true };
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

    // Sin módulos activos hasta que el dueño elija el tipo de negocio.
    for (const mod of modules) {
      await this.prisma.companyModule.create({
        data: {
          companyId: company.id,
          moduleId: mod.id,
          isEnabled: false,
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
      picture?: string;
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
      picture: googleProfilePicture(data.picture),
    };
  }

  async login(
    emailRaw: string,
    password: string,
    preferredCompanyId?: string,
  ) {
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
    return this.issueExistingUserSession(
      user,
      memberships,
      preferredCompanyId,
    );
  }

  async register(
    name: string,
    emailRaw: string,
    password: string,
    companyName: string,
    acceptTerms: boolean,
    acceptPrivacy: boolean,
  ) {
    if (!isPublicCompanySignupEnabled()) {
      throw new ForbiddenException(
        'El registro público está cerrado. Solicitá acceso y esperá la aprobación.',
      );
    }
    if (!acceptTerms || !acceptPrivacy) {
      throw new BadRequestException(
        'Para crear la cuenta tenés que aceptar los términos y el tratamiento de datos.',
      );
    }
    const email = emailRaw.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name.trim(),
        active: true,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
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

  async googleLogin(
    idToken: string,
    companyName?: string,
    preferredCompanyId?: string,
    opts?: { allowSignup?: boolean },
  ) {
    const profile = await this.verifyGoogleIdToken(idToken);
    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        isPlatformAdmin: true,
      },
    });

    if (existing) {
      if (!existing.active) {
        throw new UnauthorizedException({
          code: 'GOOGLE_INACTIVE',
          message: 'Usuario inactivo',
        });
      }
      if (profile.picture) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { avatarUrl: profile.picture },
        });
      }
      const memberships = await this.loadMemberships(existing.id);
      const session = await this.issueExistingUserSession(
        existing,
        memberships,
        preferredCompanyId,
        { google: true },
      );
      return { kind: 'session' as const, ...session };
    }

    if (!isPublicCompanySignupEnabled() || opts?.allowSignup === false) {
      throw new BadRequestException({
        code: 'GOOGLE_NO_ACCOUNT',
        message: 'No hay una cuenta VOS IA con este email. Solicitá acceso.',
      });
    }

    const signupToken = this.jwt.sign(
      {
        t: 'gs',
        email: profile.email,
        name: profile.name,
        ...(profile.picture ? { picture: profile.picture } : {}),
      } satisfies GoogleSignupTicket,
      { expiresIn: '20m' },
    );
    return {
      kind: 'signup' as const,
      signupToken,
      email: profile.email,
      name: profile.name,
    };
  }

  async completeGoogleSignup(input: {
    signupToken: string;
    companyName: string;
    acceptTerms: boolean;
    acceptPrivacy: boolean;
  }) {
    if (!input.acceptTerms || !input.acceptPrivacy) {
      throw new BadRequestException(
        'Para crear la cuenta tenés que aceptar los términos y el tratamiento de datos.',
      );
    }
    let ticket: GoogleSignupTicket;
    try {
      ticket = this.jwt.verify<GoogleSignupTicket>(input.signupToken);
    } catch {
      throw new UnauthorizedException(
        'La sesión con Google expiró. Volvé a entrar con Google.',
      );
    }
    if (ticket.t !== 'gs' || !ticket.email?.trim() || !ticket.name?.trim()) {
      throw new UnauthorizedException('El registro con Google no es válido.');
    }

    const email = ticket.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        isPlatformAdmin: true,
      },
    });
    if (existing) {
      if (!existing.active) {
        throw new UnauthorizedException({
          code: 'GOOGLE_INACTIVE',
          message: 'Usuario inactivo',
        });
      }
      if (ticket.picture) {
        const picture = googleProfilePicture(ticket.picture);
        if (picture) {
          await this.prisma.user.update({
            where: { id: existing.id },
            data: { avatarUrl: picture },
          });
        }
      }
      const memberships = await this.loadMemberships(existing.id);
      return this.issueExistingUserSession(existing, memberships, undefined, {
        google: true,
      });
    }
    if (!isPublicCompanySignupEnabled()) {
      throw new ForbiddenException(
        'El registro público está cerrado. Solicitá acceso y esperá la aprobación.',
      );
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(
      `google-oauth-${email}-${Date.now()}`,
      10,
    );
    const created = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: ticket.name.trim(),
        avatarUrl: googleProfilePicture(ticket.picture),
        active: true,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
      },
    });
    await this.provisionNewCompany(input.companyName.trim(), created.id);
    const memberships = await this.loadMemberships(created.id);
    return this.issueExistingUserSession(created, memberships, undefined, {
      google: true,
    });
  }

  /**
   * Reabre la sesión de una cuenta ya existente.
   * No actualiza nombre, password, membresías ni datos operativos.
   */
  private async issueExistingUserSession(
    user: {
      id: string;
      email: string;
      name: string;
      isPlatformAdmin?: boolean;
    },
    memberships: Awaited<ReturnType<typeof this.loadMemberships>>,
    preferredCompanyId?: string,
    opts?: { google?: boolean },
  ) {
    this.touchLastLogin(user.id);
    await this.audit.write({
      action: 'LOGIN',
      tableName: 'users',
      recordId: user.id,
      userId: user.id,
      newValues: { google: Boolean(opts?.google) },
    });
    const isPlatformAdmin = this.ensurePlatformAdminFlag(user);
    const sessionUser = { ...user, isPlatformAdmin };

    if (isPlatformAdmin) {
      // El admin siempre arranca en el panel de plataforma (empresas + menú).
      // Entra a una empresa solo cuando la elige desde ese panel.
      return this.issuePlatformSession(sessionUser, memberships);
    }

    const picked = pickActiveMembership(memberships, preferredCompanyId);
    if (!picked) {
      if (opts?.google) {
        throw new UnauthorizedException({
          code: 'GOOGLE_NO_COMPANY',
          message: 'Usuario sin empresas activas',
        });
      }
      throw new UnauthorizedException('Usuario sin empresas activas');
    }
    return this.issueSession(sessionUser, picked, memberships);
  }

  buildGoogleAuthorizeRedirect(
    returnToRaw?: string,
    companyIdRaw?: string,
    popup = false,
  ): string {
    const cfg = googleConfig();
    const returnTo = parseGoogleReturnTo(returnToRaw);
    if (!googleOAuthConfigured(cfg)) {
      return googleFrontRedirect({
        frontUrl: cfg.frontUrl,
        returnTo,
        error: 'not_configured',
        popup,
      });
    }
    const companyId = sanitizeCompanyIdHint(companyIdRaw);
    const state = this.jwt.sign(
      {
        t: 'g',
        r: returnTo,
        ...(companyId ? { c: companyId } : {}),
        ...(popup ? { p: 1 as const } : {}),
      } satisfies GoogleOAuthState,
      { expiresIn: '10m' },
    );
    return googleAuthorizeUrl({
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      state,
      popup,
    });
  }

  async handleGoogleOAuthCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<{ url: string; refreshToken?: string }> {
    const cfg = googleConfig();
    let returnTo = parseGoogleReturnTo(undefined);
    let preferredCompanyId: string | undefined;
    let popup = false;
    const redirect = (
      extra: { signup?: string; error?: string; session?: boolean } = {},
    ) =>
      googleFrontRedirect({
        frontUrl: cfg.frontUrl,
        returnTo,
        popup,
        ...extra,
      });
    const fail = (error: string) => ({ url: redirect({ error }) });
    if (!query.state?.trim()) {
      return fail('invalid_state');
    }
    try {
      const payload = this.jwt.verify<GoogleOAuthState>(query.state);
      if (payload.t === 'g') {
        returnTo = parseGoogleReturnTo(payload.r);
        preferredCompanyId = sanitizeCompanyIdHint(payload.c);
        popup = payload.p === 1;
      } else {
        return fail('invalid_state');
      }
    } catch {
      return fail('invalid_state');
    }
    if (query.error) {
      const error =
        query.error === 'access_denied' ? 'access_denied' : 'oauth_failed';
      return fail(error);
    }
    if (!query.code?.trim()) {
      return fail('oauth_failed');
    }
    if (!googleOAuthConfigured(cfg)) {
      return fail('not_configured');
    }
    try {
      const idToken = await this.exchangeGoogleAuthCode(query.code.trim(), cfg);
      const result = await this.googleLogin(
        idToken,
        undefined,
        preferredCompanyId,
        { allowSignup: isPublicCompanySignupEnabled() && returnTo === 'login' },
      );
      if (result.kind === 'signup') {
        return { url: redirect({ signup: result.signupToken }) };
      }
      return {
        url: redirect({ session: true }),
        refreshToken: result.refreshToken,
      };
    } catch (err) {
      return fail(googleCallbackErrorCode(err));
    }
  }

  private async exchangeGoogleAuthCode(
    code: string,
    cfg: ReturnType<typeof googleConfig>,
  ): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: googleTokenExchangeBody({
        code,
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri: cfg.redirectUri,
      }),
    });
    if (!res.ok) {
      throw new UnauthorizedException('No se pudo canjear el código de Google');
    }
    const data = (await res.json()) as { id_token?: string };
    if (!data.id_token?.trim()) {
      throw new UnauthorizedException('Google no devolvió un id_token');
    }
    return data.id_token.trim();
  }

  async me(jwt: JwtPayload): Promise<AuthUserResponse> {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: jwt.sub },
      select: { id: true, email: true, isPlatformAdmin: true },
    });
    const isPlatformAdmin = dbUser
      ? this.ensurePlatformAdminFlag(dbUser)
      : Boolean(jwt.isPlatformAdmin);

    const memberships = await this.loadMemberships(jwt.sub);
    const companies = memberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));

    if (isPlatformAdmin && jwt.platformView) {
      return this.withUsage(
        this.withSystemSettings({
          ...this.buildPlatformPayload({
            id: jwt.sub,
            email: jwt.email,
            name: jwt.name,
          }),
          companies,
        }),
      );
    }

    const current =
      memberships.find((m) => m.company.id === jwt.companyId) ?? memberships[0];

    if (current) {
      const payload = this.buildPayload(
        {
          id: jwt.sub,
          email: jwt.email,
          name: jwt.name,
          isPlatformAdmin,
        },
        current,
      );
      if (isPlatformAdmin && !jwt.platformView) {
        return this.withUsage(
          this.withSystemSettings({
            ...payload,
            isPlatformAdmin: true,
            platformView: false,
            role: 'platform-admin',
            permissions: await this.loadAllPermissions(),
            companies,
          }),
        );
      }
      return this.withUsage(this.withSystemSettings({ ...payload, companies }));
    }

    if (isPlatformAdmin) {
      return this.withUsage(
        this.withSystemSettings({
          ...this.buildPlatformPayload({
            id: jwt.sub,
            email: jwt.email,
            name: jwt.name,
          }),
          companies,
        }),
      );
    }

    return this.withUsage(this.withSystemSettings({ ...jwt, companies }));
  }

  async switchCompany(
    userId: string,
    companyId: string,
    replaceSid?: string | null,
  ) {
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

    const isAdmin = await this.ensurePlatformAdminFlag(user);
    // Platform admin usa /auth/platform/enter-company, no este endpoint.
    if (isAdmin) {
      throw new ForbiddenException(
        'Usá el panel de plataforma para entrar a una empresa',
      );
    }

    const membership = await this.loadMemberships(userId);
    const ownedActive = membership.filter(
      (m) =>
        m.company.status === 'ACTIVE' &&
        m.memberRoles.some((mr) => mr.role.slug === 'owner'),
    );

    if (ownedActive.length < 2) {
      throw new ForbiddenException(
        'Solo cuentas propietarias con varias empresas pueden cambiar de empresa',
      );
    }

    const target = ownedActive.find((m) => m.company.id === companyId);
    if (!target) {
      throw new UnauthorizedException(
        'Sin acceso de propietario a esa empresa',
      );
    }

    return this.issueSession(user, target, membership, replaceSid);
  }

  async enterCompanyAsPlatformAdmin(
    userId: string,
    companyId: string,
    reason: string,
    replaceSid?: string | null,
  ) {
    const clean = reason?.trim() ?? '';
    if (clean.length < 8 || clean.length > 500) {
      throw new BadRequestException(
        'Indicá un motivo de acceso de entre 8 y 500 caracteres.',
      );
    }
    const user = await this.assertPlatformAdmin(userId);
    const memberships = await this.loadMemberships(userId);
    await this.audit.write({
      action: 'LOGIN',
      tableName: 'support_access',
      recordId: companyId,
      companyId,
      userId,
      newValues: { reason: clean, mode: 'read' },
    });
    const session = await this.issuePlatformCompanySession(
      user,
      companyId,
      memberships,
    );
    if (replaceSid) await this.sessions.revoke(replaceSid);
    return session;
  }

  async elevateSupport(
    jwt: JwtPayload,
    reason: string,
    minutes = 30,
  ) {
    if (!jwt.isPlatformAdmin || jwt.platformView || !jwt.companyId) {
      throw new ForbiddenException(
        'La edición temporal solo aplica dentro de una empresa en modo soporte.',
      );
    }
    const clean = reason?.trim() ?? '';
    if (clean.length < 8 || clean.length > 500) {
      throw new BadRequestException(
        'Indicá un motivo de entre 8 y 500 caracteres.',
      );
    }
    const span = Math.min(120, Math.max(5, Math.floor(minutes) || 30));
    const company = await this.prisma.company.findFirst({
      where: { id: jwt.companyId, status: 'ACTIVE' },
      select: { id: true, name: true, shopSlug: true },
    });
    if (!company) throw new BadRequestException('Empresa no encontrada o inactiva');
    const permissions = elevatedSupportPermissions(await this.loadAllPermissions());
    const supportUntil = Math.floor(Date.now() / 1000) + span * 60;
    const payload: JwtPayload = {
      ...this.buildPlatformCompanyPayload(
        { id: jwt.sub, email: jwt.email, name: jwt.name },
        company,
        permissions,
      ),
      supportMode: 'write',
      supportUntil,
    };
    const signed = await this.signSession(jwt.sub, payload, jwt.sid);
    await this.audit.write({
      action: 'UPDATE',
      tableName: 'support_elevation',
      recordId: company.id,
      companyId: company.id,
      userId: jwt.sub,
      newValues: { reason: clean, minutes: span, excludes: ['*.delete', 'dental.write'] },
    });
    const memberships = await this.loadMemberships(jwt.sub);
    const companies = memberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));
    return {
      accessToken: signed.accessToken,
      refreshToken: signed.refreshToken,
      user: await this.withUsage(
        this.withSystemSettings({ ...payload, companies }),
      ),
    };
  }

  async refresh(refreshToken: string) {
    const rotated = await this.sessions.rotate(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        isPlatformAdmin: true,
      },
    });
    if (!user?.active) throw new UnauthorizedException('Sesión inválida');
    const memberships = await this.loadMemberships(user.id);
    const companies = memberships
      .filter((m) => m.company.status === 'ACTIVE')
      .map((m) => this.membershipToSummary(m));
    if (rotated.platformView || (user.isPlatformAdmin && !rotated.companyId)) {
      const payload = this.buildPlatformPayload(user);
      return {
        accessToken: this.jwt.sign({ ...payload, sid: rotated.id }),
        refreshToken: rotated.refreshToken,
        user: await this.withAvatar(
          this.withSystemSettings({ ...payload, companies }),
        ),
      };
    }
    if (user.isPlatformAdmin && rotated.companyId && rotated.supportMode) {
      const company = await this.prisma.company.findFirst({
        where: { id: rotated.companyId, status: 'ACTIVE' },
        select: { id: true, name: true, shopSlug: true },
      });
      if (company) {
        const write = supportWriteStillValid({
          supportMode: rotated.supportMode === 'write' ? 'write' : 'read',
          supportUntil: rotated.supportUntil,
        });
        const permissions = write
          ? elevatedSupportPermissions(await this.loadAllPermissions())
          : readOnlyPermissions(await this.loadAllPermissions());
        if (!write && rotated.supportMode === 'write') {
          await this.prisma.authSession.update({
            where: { id: rotated.id },
            data: { supportMode: 'read', supportUntil: null },
          });
        }
        const payload = {
          ...this.buildPlatformCompanyPayload(user, company, permissions),
          supportMode: (write ? 'write' : 'read') as 'read' | 'write',
          ...(write && rotated.supportUntil
            ? { supportUntil: rotated.supportUntil }
            : {}),
        };
        return {
          accessToken: this.jwt.sign({ ...payload, sid: rotated.id }),
          refreshToken: rotated.refreshToken,
          user: await this.withUsage(
            this.withSystemSettings({ ...payload, companies }),
          ),
        };
      }
    }
    const picked =
      memberships.find((m) => m.company.id === rotated.companyId) ??
      pickActiveMembership(memberships);
    if (!picked) throw new UnauthorizedException('Usuario sin empresas activas');
    if (picked.company.id !== rotated.companyId) {
      await this.prisma.authSession.update({
        where: { id: rotated.id },
        data: {
          companyId: picked.company.id,
          platformView: false,
          supportMode: null,
          supportUntil: null,
        },
      });
    }
    const payload = this.buildPayload(user, picked);
    return {
      accessToken: this.jwt.sign({ ...payload, sid: rotated.id }),
      refreshToken: rotated.refreshToken,
      user: await this.withUsage(
        this.withSystemSettings({ ...payload, companies }),
      ),
    };
  }

  async logoutByRefresh(refreshToken: string) {
    const row = await this.sessions.revokeByToken(refreshToken);
    if (!row) return;
    await this.audit.write({
      action: 'LOGOUT',
      tableName: 'auth_sessions',
      recordId: row.id,
      userId: row.userId,
    });
  }

  async exitToPlatformAdmin(userId: string, replaceSid?: string | null) {
    const user = await this.assertPlatformAdmin(userId);
    const memberships = await this.loadMemberships(userId);
    return this.issuePlatformSession(user, memberships, replaceSid);
  }

  private async applyBusinessTypeModules(
    companyId: string,
    businessType: BusinessTypeId,
  ) {
    const wanted = new Set(BUSINESS_TYPE_MODULES[businessType]);
    const catalog = await this.prisma.module.findMany({
      select: { id: true, slug: true },
    });
    if (!catalog.length) {
      throw new BadRequestException(
        'La plataforma aún no está inicializada. Contactá soporte.',
      );
    }
    const known = new Set(catalog.map((mod) => mod.slug));
    const missing = [...wanted].filter((slug) => !known.has(slug));
    if (missing.length) {
      throw new BadRequestException(
        `Faltan módulos en el catálogo: ${missing.join(', ')}. Ejecutá el seed de plataforma antes de configurar el negocio.`,
      );
    }

    for (const mod of catalog) {
      const enabled = wanted.has(mod.slug);
      await this.prisma.companyModule.upsert({
        where: {
          companyId_moduleId: { companyId, moduleId: mod.id },
        },
        create: {
          companyId,
          moduleId: mod.id,
          isEnabled: enabled,
          enabledAt: new Date(),
        },
        update: {
          isEnabled: enabled,
          ...(enabled ? { enabledAt: new Date() } : {}),
        },
      });
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: { businessType },
    });
  }

  async setBusinessType(
    userId: string,
    businessTypeRaw: string,
    companyIdHint?: string,
  ) {
    if (!isBusinessTypeId(businessTypeRaw)) {
      throw new BadRequestException('Tipo de negocio no válido');
    }
    const businessType = businessTypeRaw;

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

    const memberships = await this.loadMemberships(userId);
    const preferred = sanitizeCompanyIdHint(companyIdHint);
    const current =
      (preferred
        ? memberships.find((m) => m.company.id === preferred)
        : undefined) ??
      memberships.find((m) => m.company.status === 'ACTIVE') ??
      memberships[0];
    if (!current || current.company.status !== 'ACTIVE') {
      throw new BadRequestException('No hay empresa activa');
    }

    const isOwner = current.memberRoles.some((mr) => mr.role.slug === 'owner');
    if (!isOwner) {
      throw new ForbiddenException(
        'Solo el propietario puede configurar el tipo de negocio',
      );
    }

    await this.applyBusinessTypeModules(current.company.id, businessType);

    const refreshed = await this.loadMemberships(userId);
    const target =
      refreshed.find((m) => m.company.id === current.company.id) ?? refreshed[0];
    if (!target) {
      throw new BadRequestException('No se pudo actualizar la empresa');
    }

    return this.issueSession(user, target, refreshed);
  }
}
