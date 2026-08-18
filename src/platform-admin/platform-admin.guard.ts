import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/jwt.types';
import { isPlatformAdminEmail } from '../auth/platform-admins';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!req.user?.isPlatformAdmin && !isPlatformAdminEmail(req.user?.email)) {
      throw new ForbiddenException('Acceso reservado al administrador de plataforma');
    }
    return true;
  }
}
