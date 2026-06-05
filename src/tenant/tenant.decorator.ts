import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContext } from './tenant.types';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<{ tenant: TenantContext }>();
    return req.tenant;
  },
);
