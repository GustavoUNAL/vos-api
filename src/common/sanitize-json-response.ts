import { Prisma } from '@prisma/client';

/**
 * Convierte valores que `JSON.stringify` no serializa bien (Decimal, BigInt)
 * en tipos seguros para JSON. Evita respuestas 500 por serialización.
 */
export function sanitizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForJson);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(entries.map(([k, v]) => [k, sanitizeForJson(v)]));
  }
  return value;
}
