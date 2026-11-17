export type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  sid?: string;
  isPlatformAdmin?: boolean;
  platformView?: boolean;
  companyId: string;
  companyName: string;
  companySlug: string;
  role: string;
  permissions: string[];
  supportMode?: 'read' | 'write';
  /** Epoch en segundos. La escritura de soporte caduca. */
  supportUntil?: number;
};

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  role: string;
  modules: string[];
  businessType?: string | null;
};

export type SystemSettings = {
  inaugurationDate: string | null;
};

export type CompanyUsageSummary = {
  plan: 'TRIAL' | 'PRO' | 'BUSINESS';
  storageUsedBytes: number;
  storageLimitBytes: number;
  percent: number;
  products: number;
  sales: number;
  purchases: number;
  inventory: number;
  appointments: number;
  overLimit: boolean;
  offerPro: boolean;
  limitLabel: string | null;
};

export type AuthUserResponse = JwtPayload & {
  companies: CompanySummary[];
  avatarUrl?: string | null;
  systemSettings?: SystemSettings;
  usage?: CompanyUsageSummary | null;
};
