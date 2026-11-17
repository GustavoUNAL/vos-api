/**
 * El administrador de plataforma sale únicamente de User.isPlatformAdmin.
 * No hay lista de correos en el código ni autopromoción al iniciar sesión.
 */
export function isPlatformAdminEmail(): boolean {
  return false;
}
