import { HttpException } from '@nestjs/common';

export type GoogleOAuthReturnTo = 'login' | 'health';

export type GoogleOAuthState = {
  t: 'g';
  r: GoogleOAuthReturnTo;
  c?: string;
  p?: 1;
};

export type GoogleSignupTicket = {
  t: 'gs';
  email: string;
  name: string;
};

export function googleFrontRedirect(opts: {
  frontUrl: string;
  returnTo: GoogleOAuthReturnTo;
  token?: string;
  signup?: string;
  error?: string;
  popup?: boolean;
}): string {
  const base = opts.frontUrl.replace(/\/$/, '');
  const path = opts.popup
    ? '/#/auth/google/popup'
    : opts.signup
      ? '/#/registro-google'
      : opts.returnTo === 'health'
        ? '/#/health/login'
        : '/#/login';
  const q = new URLSearchParams();
  if (opts.token) q.set('google_token', opts.token);
  if (opts.signup) q.set('google_signup', opts.signup);
  if (opts.error) q.set('google_error', opts.error);
  const qs = q.toString();
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

export function parseGoogleReturnTo(raw?: string | null): GoogleOAuthReturnTo {
  return raw === 'health' ? 'health' : 'login';
}

/** Solo IDs tipo cuid/uuid compacto: se usa como pista, nunca se escribe en la DB. */
export function sanitizeCompanyIdHint(raw?: string | null): string | undefined {
  const v = (raw ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(v)) return undefined;
  return v;
}

export function pickActiveMembership<
  T extends { company: { id: string; status: string } },
>(memberships: T[], preferredCompanyId?: string | null): T | undefined {
  const active = memberships.filter((m) => m.company.status === 'ACTIVE');
  if (!active.length) return undefined;
  const preferred = sanitizeCompanyIdHint(preferredCompanyId);
  if (preferred) {
    const match = active.find((m) => m.company.id === preferred);
    if (match) return match;
  }
  return active[0];
}

export function googleAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  popup?: boolean;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: opts.state,
  });
  if (opts.popup) params.set('display', 'popup');
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  let redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() ?? '';
  let frontUrl =
    process.env.GOOGLE_FRONT_URL?.trim() ||
    process.env.SHOP_FRONT_URL?.trim() ||
    '';
  const production =
    process.env.NODE_ENV === 'production' ||
    process.env.VOS_ENV === 'production';
  if (production) {
    if (!redirectUri || /localhost|127\.0\.0\.1/.test(redirectUri)) {
      redirectUri = 'https://vos-ia.com/auth/google/callback';
    }
    if (!frontUrl || /localhost|127\.0\.0\.1/.test(frontUrl)) {
      frontUrl = 'https://vos-ia.com';
    }
  }
  if (!frontUrl) frontUrl = 'http://localhost:5173';
  return { clientId, clientSecret, redirectUri, frontUrl };
}

export function googleOAuthConfigured(cfg = googleConfig()): boolean {
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.redirectUri);
}

export function googleTokenExchangeBody(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): URLSearchParams {
  return new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: 'authorization_code',
  });
}

function exceptionMessage(err: unknown): string {
  if (err instanceof HttpException) {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res && 'message' in res) {
      const msg = (res as { message?: unknown }).message;
      if (Array.isArray(msg)) return msg.join(' ');
      if (typeof msg === 'string') return msg;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return '';
}

function exceptionCode(err: unknown): string {
  if (!(err instanceof HttpException)) return '';
  const res = err.getResponse();
  if (typeof res === 'object' && res && 'code' in res) {
    return String((res as { code?: unknown }).code ?? '');
  }
  return '';
}

export function googleCallbackErrorCode(err: unknown): string {
  const code = exceptionCode(err);
  if (code === 'GOOGLE_NO_ACCOUNT') return 'no_account';
  if (code === 'GOOGLE_INACTIVE') return 'inactive';
  if (code === 'GOOGLE_NO_COMPANY') return 'no_company';
  const msg = exceptionMessage(err);
  if (/GOOGLE_NO_ACCOUNT|cuenta VOS IA|cuenta VOS AI|registrarte con Google/i.test(msg)) {
    return 'no_account';
  }
  if (/inactivo/i.test(msg)) return 'inactive';
  if (/sin empresas/i.test(msg)) return 'no_company';
  return 'oauth_failed';
}
