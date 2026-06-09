/**
 * Parámetros globales del sistema y overrides por empresa.
 * Incluye límites operativos (calendario, IA, etc.).
 *
 * Mantener en sync con vos-front/src/config/systemSettings.ts (misma forma).
 */

export type SystemSettings = {
  /** Primera fecha con datos operativos (YYYY-MM-DD). El calendario no retrocede antes. */
  inaugurationDate: string | null;
};

export type AiSystemDefaults = {
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  locale: string;
  currency: string;
  businessContextHint: string;
};

/** Valores por defecto para agentes IA (cuando no hay config en BD). */
export const AI_SYSTEM_DEFAULTS: AiSystemDefaults = {
  defaultModel: 'gpt-4o-mini',
  temperature: 0.35,
  maxTokens: 2048,
  locale: 'es-CO',
  currency: 'COP',
  businessContextHint:
    'Negocio gastronómico en Colombia. Montos en pesos colombianos (COP).',
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  inaugurationDate: null,
};

/**
 * Overrides por `companyId` o `shopSlug`.
 * Clave nueva empresa: agregar aquí hasta persistir en BD.
 */
export const COMPANY_SYSTEM_OVERRIDES: Record<string, Partial<SystemSettings>> = {
  'seed-arandano-cafe-bar': {
    inaugurationDate: '2025-12-26',
  },
  arandano: {
    inaugurationDate: '2025-12-26',
  },
};

export function resolveCompanySystemSettings(
  companyId?: string | null,
  companySlug?: string | null,
): SystemSettings {
  const byId = companyId?.trim()
    ? COMPANY_SYSTEM_OVERRIDES[companyId.trim()]
    : undefined;
  const bySlug = companySlug?.trim()
    ? COMPANY_SYSTEM_OVERRIDES[companySlug.trim()]
    : undefined;
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...byId,
    ...bySlug,
  };
}
