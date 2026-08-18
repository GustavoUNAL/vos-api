/** Correos que siempre son administradores de la plataforma VOS AI. */
export const PLATFORM_ADMIN_EMAILS = new Set([
  'admin@vos.ai',
  'gustavoarteaga0508@gmail.com',
]);

export function isPlatformAdminEmail(email?: string | null): boolean {
  return PLATFORM_ADMIN_EMAILS.has((email ?? '').trim().toLowerCase());
}
