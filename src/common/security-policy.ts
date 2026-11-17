import { createHash } from 'crypto';

/** SHA-256 de contraseñas de ejemplo que llegaron a estar en el repositorio. */
const BANNED_PASSWORD_SHA256 = new Set([
  'b7191d3468b9e7e03835f3f2af9b405c375886fee00f811c8bf68e5ba5654fa2',
  '24568f10c516451eb9ee62149a39bf38c0d459eb0c809953f6d008778be9238d',
  '1c5c62d339558ffd538627210d3851cef5214b394f4f6f03f431927c4576f5e6',
  '5850545cc7515c64c0d852691659fd67566c37319783fd550a2ce8952974681a',
  '9e244fa66ac6a5ada9e07ed931cf7c9bb8d347f04aefcf92b5a1c5c4326aa39a',
  '35e6142d64bab6e0be112b0d4c13303581c0bc2fbc6cddbd24b1856ed3098adc',
  'f46213a2bfd8a36cab0e511aeec235e24c23b4ffe41975dd1548ce0e3d48c1c4',
  '81b2ca7b34a12d6f56ef4785f6448e66027585a6f5cdadda257961aa17e2e007',
  '9659df8273fe7e46ec414f027402e3b759da80bf06a4bfe37d979e3feba144cc',
  'bd6a880c4e323fdb96ed7a911ca9082cf4900348b64f25c23546f622d9346b89',
]);

const GENERIC_WEAK = [
  'password',
  'changeme',
  'change-me',
  'admin123',
  'admin1234',
  'qwerty123456',
];

export function passwordFingerprint(password: string): string {
  return createHash('sha256')
    .update(password.trim().toLowerCase())
    .digest('hex');
}

export function assertOperationalPassword(
  envName: string,
  value: string | undefined,
): string {
  const password = (value ?? '').trim();
  if (!password) {
    throw new Error(
      `${envName} es obligatorio. El seed no tiene contraseñas de respaldo.`,
    );
  }
  if (password.length < 12) {
    throw new Error(`${envName} debe tener al menos 12 caracteres.`);
  }
  const lower = password.toLowerCase();
  if (
    GENERIC_WEAK.some((weak) => lower === weak || lower.includes(weak)) ||
    BANNED_PASSWORD_SHA256.has(passwordFingerprint(password))
  ) {
    throw new Error(
      `${envName} coincide con una contraseña de ejemplo o es demasiado débil. Definí una contraseña única.`,
    );
  }
  return password;
}

/**
 * El alta pública de una empresa queda cerrada en producción y en staging.
 * En local sigue abierta salvo AUTH_PUBLIC_REGISTER=false.
 * AUTH_PUBLIC_REGISTER=true la reabre de forma explícita (no recomendado).
 */
export function isPublicCompanySignupEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = (env.AUTH_PUBLIC_REGISTER ?? '').trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  if (env.NODE_ENV === 'production') return false;
  const vos = (env.VOS_ENV ?? '').trim().toLowerCase();
  if (vos === 'dev' || vos === 'staging') return false;
  return true;
}

/** El límite de ritmo corre en producción y en staging. Se salta en local y en test. */
export function skipRateLimit(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'test') return true;
  if ((env.THROTTLE_DISABLED ?? '').trim() === 'true') return true;
  if (env.NODE_ENV === 'production') return false;
  const vos = (env.VOS_ENV ?? '').trim().toLowerCase();
  if (vos === 'dev' || vos === 'staging') return false;
  return true;
}

export function rateLimitPerMinute(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.THROTTLE_LIMIT);
  if (Number.isFinite(raw) && raw >= 10 && raw <= 10_000)
    return Math.floor(raw);
  const vos = (env.VOS_ENV ?? '').trim().toLowerCase();
  if (vos === 'dev' || vos === 'staging') return 300;
  return 120;
}

export type TenantCompanyResolution =
  | { ok: true; companyId: string }
  | { ok: false; code: 'missing' | 'mismatch' };

/**
 * La empresa activa sale del token. Una cabecera distinta no cambia el tenant.
 */
export function resolveTenantCompanyId(input: {
  tokenCompanyId?: string | null;
  headerCompanyId?: string | null;
}): TenantCompanyResolution {
  const token = (input.tokenCompanyId ?? '').trim();
  const header = (input.headerCompanyId ?? '').trim();
  if (!token) return { ok: false, code: 'missing' };
  if (header && header !== token) return { ok: false, code: 'mismatch' };
  return { ok: true, companyId: token };
}

export function shouldDeliverShopEvent(
  clientCompanyId: string | null | undefined,
  eventCompanyId: string,
): boolean {
  if (!clientCompanyId || !eventCompanyId) return false;
  return clientCompanyId === eventCompanyId;
}

export function readOnlyPermissions(permissions: readonly string[]): string[] {
  return permissions.filter(
    (slug) => slug.endsWith('.view') || slug === 'platform.admin',
  );
}

/** Escritura temporal de soporte: sin borrados ni escritura clínica. */
export function elevatedSupportPermissions(
  permissions: readonly string[],
): string[] {
  return permissions.filter((slug) => {
    if (slug.endsWith('.delete')) return false;
    if (slug.startsWith('dental.') && slug !== 'dental.view') return false;
    return true;
  });
}

export function supportWriteStillValid(input: {
  supportMode?: 'read' | 'write' | null;
  supportUntil?: number | null;
  nowMs?: number;
}): boolean {
  if (input.supportMode !== 'write') return false;
  if (!input.supportUntil) return false;
  return input.supportUntil * 1000 > (input.nowMs ?? Date.now());
}
