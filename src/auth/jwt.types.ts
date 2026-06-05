export type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  companyId: string;
  companyName: string;
  role: string;
  permissions: string[];
};

export type CompanySummary = {
  id: string;
  name: string;
  role: string;
  modules: string[];
};

export type AuthUserResponse = JwtPayload & {
  companies: CompanySummary[];
};
