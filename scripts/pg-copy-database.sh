#!/usr/bin/env bash
# Copia esquema + datos de PostgreSQL desde SOURCE_DATABASE_URL hacia TARGET_DATABASE_URL.
# Útil para alinear local → remoto (o remoto → local) después de `npm run db:migrate` en destino.
#
# Requisitos: PostgreSQL client (`pg_dump`, `pg_restore`) instalados y acceso de red al servidor remoto.
#
# Uso:
#   export SOURCE_DATABASE_URL='postgresql://user:pass@host-local:5432/db'
#   export TARGET_DATABASE_URL='postgresql://user:pass@host-remoto:5432/db'
#   bash scripts/pg-copy-database.sh
#
# ADVERTENCIA: pg_restore --clean elimina objetos en destino antes de recrear. Haz backup del remoto antes.

set -euo pipefail

if [[ -z "${SOURCE_DATABASE_URL:-}" || -z "${TARGET_DATABASE_URL:-}" ]]; then
  echo "Defina SOURCE_DATABASE_URL y TARGET_DATABASE_URL (URI postgres)." >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "Instale pg_dump (PostgreSQL client)." >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "Instale pg_restore (PostgreSQL client)." >&2; exit 1; }

TMP_DUMP="$(mktemp -t arandano-pg.XXXXXX.dump)"
cleanup() { rm -f "$TMP_DUMP"; }
trap cleanup EXIT

echo "Volcando desde SOURCE..."
pg_dump "$SOURCE_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  -f "$TMP_DUMP"

echo "Restaurando en TARGET (--clean --if-exists)..."
pg_restore \
  --dbname="$TARGET_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --jobs="${PG_RESTORE_JOBS:-4}" \
  "$TMP_DUMP"

echo "OK: TARGET actualizado desde SOURCE."
