import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { TenantContext } from './tenant.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<{ tenant?: TenantContext }>();
    const tenant = req.tenant;
    if (!tenant) {
      throw new ForbiddenException('Contexto de empresa requerido');
    }

    const ok = required.some((p) => tenant.permissions.includes(p));
    if (!ok) {
      throw new ForbiddenException('Permiso insuficiente');
    }
    return true;
  }
}
