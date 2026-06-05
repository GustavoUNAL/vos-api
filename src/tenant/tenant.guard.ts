import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/jwt.types';
import type { TenantContext } from './tenant.types';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      headers: Record<string, string | string[] | undefined>;
      tenant?: TenantContext;
    }>();

    const jwtUser = req.user;
    if (!jwtUser?.sub) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const headerCompany = req.headers['x-company-id'];
    const companyId =
      (typeof headerCompany === 'string' ? headerCompany : jwtUser.companyId) ||
      '';

    if (!companyId) {
      throw new ForbiddenException('Seleccioná una empresa (X-Company-Id)');
    }

    const membership = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId: jwtUser.sub,
        status: 'ACTIVE',
      },
      include: {
        company: { select: { id: true, name: true, status: true } },
        memberRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: { select: { slug: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!membership || membership.company.status !== 'ACTIVE') {
      throw new ForbiddenException('Sin acceso a esta empresa');
    }

    const permissions = [
      ...new Set(
        membership.memberRoles.flatMap((mr) =>
          mr.role.rolePermissions.map((rp) => rp.permission.slug),
        ),
      ),
    ];

    const primaryRole =
      membership.memberRoles[0]?.role.slug ?? jwtUser.role ?? 'member';

    req.tenant = {
      userId: jwtUser.sub,
      email: jwtUser.email,
      name: jwtUser.name,
      companyId: membership.company.id,
      companyName: membership.company.name,
      permissions,
      role: primaryRole,
    };

    return true;
  }
}
