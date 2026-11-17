/**
 * Seed legacy deshabilitado.
 * El esquema vigente es multiempresa y el alta oficial es `npm run db:seed-platform`.
 * Este archivo no crea usuarios ni conserva contraseñas de ejemplo.
 */
async function main() {
  throw new Error(
    'prisma/seed.ts está deshabilitado. Usá npm run db:seed-platform con SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD propios.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
