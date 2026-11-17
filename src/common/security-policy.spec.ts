import {
  assertOperationalPassword,
  elevatedSupportPermissions,
  isPublicCompanySignupEnabled,
  rateLimitPerMinute,
  readOnlyPermissions,
  resolveTenantCompanyId,
  shouldDeliverShopEvent,
  skipRateLimit,
  supportWriteStillValid,
} from './security-policy';

describe('política de seguridad', () => {
  it('rechaza contraseñas vacías, cortas o genéricas', () => {
    expect(() => assertOperationalPassword('SEED_ADMIN_PASSWORD', '')).toThrow(
      /obligatorio/,
    );
    expect(() =>
      assertOperationalPassword('SEED_ADMIN_PASSWORD', 'corta'),
    ).toThrow(/12/);
    expect(() =>
      assertOperationalPassword('SEED_ADMIN_PASSWORD', 'admin12345678'),
    ).toThrow(/ejemplo|débil/);
  });

  it('acepta una contraseña propia', () => {
    expect(
      assertOperationalPassword(
        'SEED_ADMIN_PASSWORD',
        'una-clave-operativa-distinta',
      ),
    ).toBe('una-clave-operativa-distinta');
  });

  it('cierra el alta pública en producción y staging', () => {
    expect(isPublicCompanySignupEnabled({ NODE_ENV: 'production' })).toBe(
      false,
    );
    expect(
      isPublicCompanySignupEnabled({ NODE_ENV: 'development', VOS_ENV: 'dev' }),
    ).toBe(false);
    expect(
      isPublicCompanySignupEnabled({
        NODE_ENV: 'production',
        AUTH_PUBLIC_REGISTER: 'true',
      }),
    ).toBe(true);
    expect(isPublicCompanySignupEnabled({ NODE_ENV: 'development' })).toBe(
      true,
    );
    expect(
      isPublicCompanySignupEnabled({
        NODE_ENV: 'development',
        AUTH_PUBLIC_REGISTER: 'false',
      }),
    ).toBe(false);
  });

  it('aplica límite de ritmo en producción y staging, y lo salta en test', () => {
    expect(skipRateLimit({ NODE_ENV: 'production' })).toBe(false);
    expect(skipRateLimit({ NODE_ENV: 'development', VOS_ENV: 'staging' })).toBe(
      false,
    );
    expect(skipRateLimit({ NODE_ENV: 'test' })).toBe(true);
    expect(skipRateLimit({ NODE_ENV: 'development' })).toBe(true);
    expect(rateLimitPerMinute({})).toBe(120);
    expect(rateLimitPerMinute({ VOS_ENV: 'staging' })).toBe(300);
    expect(rateLimitPerMinute({ THROTTLE_LIMIT: '40' })).toBe(40);
  });

  it('no deja que una cabecera cambie la empresa de la sesión', () => {
    expect(
      resolveTenantCompanyId({
        tokenCompanyId: 'empresa-a',
        headerCompanyId: 'empresa-b',
      }),
    ).toEqual({ ok: false, code: 'mismatch' });
    expect(
      resolveTenantCompanyId({
        tokenCompanyId: '',
        headerCompanyId: 'empresa-b',
      }),
    ).toEqual({ ok: false, code: 'missing' });
    expect(
      resolveTenantCompanyId({
        tokenCompanyId: 'empresa-a',
        headerCompanyId: 'empresa-a',
      }),
    ).toEqual({ ok: true, companyId: 'empresa-a' });
  });

  it('entrega eventos de pedidos solo a la misma empresa', () => {
    expect(shouldDeliverShopEvent('empresa-a', 'empresa-a')).toBe(true);
    expect(shouldDeliverShopEvent('empresa-a', 'empresa-b')).toBe(false);
    expect(shouldDeliverShopEvent('', 'empresa-a')).toBe(false);
    expect(shouldDeliverShopEvent('empresa-a', '')).toBe(false);
  });

  it('deja al soporte en lectura y aparta borrados y clínica al elevar', () => {
    const all = [
      'sales.view',
      'sales.create',
      'sales.delete',
      'dental.view',
      'dental.update',
      'finance.view',
    ];
    expect(readOnlyPermissions(all)).toEqual([
      'sales.view',
      'dental.view',
      'finance.view',
    ]);
    expect(elevatedSupportPermissions(all)).toEqual([
      'sales.view',
      'sales.create',
      'dental.view',
      'finance.view',
    ]);
    expect(
      supportWriteStillValid({
        supportMode: 'write',
        supportUntil: 2_000,
        nowMs: 1_000_000,
      }),
    ).toBe(true);
    expect(
      supportWriteStillValid({
        supportMode: 'write',
        supportUntil: 1,
        nowMs: 5_000,
      }),
    ).toBe(false);
    expect(supportWriteStillValid({ supportMode: 'read' })).toBe(false);
  });
});
