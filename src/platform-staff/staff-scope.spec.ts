import { canManageAllStaff } from './staff-scope';
import type { TenantContext } from '../tenant/tenant.types';

function tenant(partial: Partial<TenantContext>): TenantContext {
  return {
    userId: 'u1',
    email: 'a@b.com',
    name: 'A',
    companyId: 'c1',
    companyName: 'C',
    permissions: [],
    role: 'crew',
    ...partial,
  };
}

describe('canManageAllStaff', () => {
  it('permite owner y manager', () => {
    expect(canManageAllStaff(tenant({ role: 'owner' }))).toBe(true);
    expect(canManageAllStaff(tenant({ role: 'manager' }))).toBe(true);
  });

  it('permite staff.manage', () => {
    expect(
      canManageAllStaff(tenant({ role: 'crew', permissions: ['staff.manage'] })),
    ).toBe(true);
  });

  it('niega al personal de piso', () => {
    expect(
      canManageAllStaff(
        tenant({ role: 'crew', permissions: ['staff.view', 'staff.create'] }),
      ),
    ).toBe(false);
  });
});
