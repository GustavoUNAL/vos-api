import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { JwtPayload } from '../auth/jwt.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user?.role) {
      throw new ForbiddenException('No autorizado');
    }

    const allowed = new Set<UserRole>([
      ...required,
      UserRole.ADMIN,
      UserRole.EMPLEADO,
    ]);
    if (!allowed.has(user.role)) {
      throw new ForbiddenException('Rol insuficiente para esta operación');
    }
    return true;
  }
}
