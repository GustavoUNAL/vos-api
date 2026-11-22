/** Tipos de negocio del onboarding y módulos de plataforma que habilitan. */
export const BUSINESS_TYPES = [
  'cafe',
  'restaurant',
  'barbershop',
  'retail',
  'services',
  'clinic',
  'personal',
  'energy',
  'other',
] as const;

export type BusinessTypeId = (typeof BUSINESS_TYPES)[number];

export function isBusinessTypeId(value: string): value is BusinessTypeId {
  return (BUSINESS_TYPES as readonly string[]).includes(value);
}

/**
 * Módulos reales de `modules.slug` (no IDs del landing).
 * dental solo para clínica; el resto nunca lo activa el onboarding general.
 */
export const BUSINESS_TYPE_MODULES: Record<BusinessTypeId, readonly string[]> = {
  cafe: ['products', 'inventory', 'sales', 'purchases', 'tasks', 'finance'],
  restaurant: [
    'products',
    'inventory',
    'sales',
    'purchases',
    'staff',
    'tasks',
    'finance',
  ],
  barbershop: ['booking', 'sales', 'finance'],
  retail: ['products', 'inventory', 'sales', 'purchases', 'finance'],
  services: ['booking', 'projects', 'tasks', 'finance'],
  clinic: ['dental', 'inventory', 'finance'],
  /** Vida personal: agenda, pendientes, proyectos y dinero (más diario/calendario/finanzas personales en /personal y /journal). */
  personal: ['booking', 'tasks', 'projects', 'finance'],
  /** Consultoría de energía, remodelación e instalación. */
  energy: [
    'projects',
    'tasks',
    'booking',
    'products',
    'inventory',
    'purchases',
    'sales',
    'staff',
    'finance',
  ],
  other: ['products', 'sales', 'inventory', 'tasks', 'finance'],
};
