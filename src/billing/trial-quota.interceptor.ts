import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import type { JwtPayload } from '../auth/jwt.types';
import { UsageService } from './usage.service';

@Injectable()
export class TrialQuotaInterceptor implements NestInterceptor {
  constructor(private readonly usage: UsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: JwtPayload;
    }>();
    if (req.method !== 'POST') return next.handle();

    const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
    if (
      path.startsWith('/auth') ||
      path.startsWith('/platform') ||
      path.startsWith('/access-requests') ||
      path.startsWith('/public')
    ) {
      return next.handle();
    }

    const user = req.user;
    if (!user?.companyId?.trim() || user.isPlatformAdmin) {
      return next.handle();
    }

    return from(this.usage.assertWithinQuota(user.companyId)).pipe(
      switchMap(() => next.handle()),
    );
  }
}
