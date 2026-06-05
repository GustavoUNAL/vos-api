# Respaldos PostgreSQL

Volcados locales con `npm run db:backup` (formato `.dump` de `pg_dump`).

- No se versionan en git.
- Con Neon, los respaldos automáticos los gestiona el proveedor.
- Para clonar entre entornos: `npm run db:pg-copy-database` (ver `scripts/pg-copy-database.sh`).
