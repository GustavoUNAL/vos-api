import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

function context(req: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
}

describe('TenantGuard', () => {
  const membership = {
    company: { id: 'empresa-a', name: 'A', status: 'ACTIVE' },
    memberRoles: [
      {
        role: {
          slug: 'owner',
          rolePermissions: [
            { permission: { slug: 'products.view' } },
            { permission: { slug: 'products.update' } },
          ],
        },
      },
    ],
  };

  it('rechaza una cabecera de otra empresa antes de consultar datos', async () => {
    const findFirst = jest.fn();
    const guard = new TenantGuard({
      companyMember: { findFirst },
    } as never);
    const req = {
      user: {
        sub: 'user-a',
        email: 'a@example.com',
        name: 'A',
        companyId: 'empresa-a',
      },
      headers: { 'x-company-id': 'empresa-b' },
    };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('carga solo la membresía de la empresa del token', async () => {
    const findFirst = jest.fn().mockResolvedValue(membership);
    const guard = new TenantGuard({
      companyMember: { findFirst },
    } as never);
    const req: {
      user: object;
      headers: object;
      tenant?: { companyId: string; permissions: string[] };
    } = {
      user: {
        sub: 'user-a',
        email: 'a@example.com',
        name: 'A',
        companyId: 'empresa-a',
      },
      headers: { 'x-company-id': 'empresa-a' },
    };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'empresa-a',
          userId: 'user-a',
          status: 'ACTIVE',
        },
      }),
    );
    expect(req.tenant?.companyId).toBe('empresa-a');
    expect(req.tenant?.permissions).toEqual([
      'products.view',
      'products.update',
    ]);
  });

  it('deja al soporte sin escritura cuando la elevación no está vigente', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const companyFind = jest.fn().mockResolvedValue({
      id: 'empresa-a',
      name: 'A',
      status: 'ACTIVE',
    });
    const guard = new TenantGuard({
      companyMember: { findFirst },
      company: { findFirst: companyFind },
    } as never);
    const req: {
      user: object;
      headers: object;
      tenant?: { role: string; permissions: string[] };
    } = {
      user: {
        sub: 'support',
        email: 'soporte@example.com',
        name: 'Soporte',
        companyId: 'empresa-a',
        isPlatformAdmin: true,
        platformView: false,
        supportMode: 'read',
        permissions: ['sales.view', 'sales.delete', 'finance.view'],
      },
      headers: {},
    };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.tenant?.role).toBe('platform-support');
    expect(req.tenant?.permissions).toEqual(['sales.view', 'finance.view']);
  });
});
