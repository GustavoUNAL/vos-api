import type { TenantContext } from '../tenant/tenant.types';

/** Dueños y gerencia ven todos los turnos. El resto solo los propios. */
export function canManageAllStaff(tenant: TenantContext): boolean {
  if (tenant.permissions.includes('staff.manage')) return true;
  return (
    tenant.role === 'owner' ||
    tenant.role === 'manager' ||
    tenant.role === 'admin'
  );
}
