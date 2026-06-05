export type TenantContext = {
  userId: string;
  email: string;
  name: string;
  companyId: string;
  companyName: string;
  permissions: string[];
  /** Rol principal (slug) para compatibilidad con el front legacy. */
  role: string;
};
