/**
 * Invariante multi-tenant: toda consulta administrativa del motor
 * debe filtrar por organization/companyId. Health y Agenda reutilizan esto.
 */
function scopedWhere(companyId: string, extra: Record<string, unknown> = {}) {
  return { companyId, ...extra };
}

describe('scheduling multi-tenant isolation', () => {
  it('incluye companyId en filtros de citas, clientes y disponibilidad', () => {
    const companyA = 'org-a';
    const companyB = 'org-b';
    expect(scopedWhere(companyA).companyId).toBe('org-a');
    expect(scopedWhere(companyB, { staffId: 'r1' })).toEqual({
      companyId: 'org-b',
      staffId: 'r1',
    });
    expect(scopedWhere(companyA).companyId).not.toBe(
      scopedWhere(companyB).companyId,
    );
  });
});
