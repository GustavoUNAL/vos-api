import { Global, Module } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [TenantGuard, PermissionsGuard],
  exports: [TenantGuard, PermissionsGuard],
})
export class TenantModule {}
