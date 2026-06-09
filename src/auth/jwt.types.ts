export type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  isPlatformAdmin?: boolean;
  platformView?: boolean;
  companyId: string;
  companyName: string;
  companySlug: string;
  role: string;
  permissions: string[];
};

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  role: string;
  modules: string[];
};

export type AuthUserResponse = JwtPayload & {
  companies: CompanySummary[];
};
