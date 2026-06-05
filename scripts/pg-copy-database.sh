#!/usr/bin/env bash
# Copia esquema + datos de PostgreSQL desde SOURCE_DATABASE_URL hacia TARGET_DATABASE_URL.
# Útil para alinear local → remoto (o remoto → local) después de `npm run db:migrate` en destino.
#
# Requisitos: PostgreSQL client (`pg_dump`, `pg_restore`) instalados y acceso de red al servidor remoto.
#
# Uso (explícito):
#   export SOURCE_DATABASE_URL='postgresql://...'
#   export TARGET_DATABASE_URL='postgresql://...'
#   bash scripts/pg-copy-database.sh
#
# Uso (proyecto): en la raíz del repo, `.env` con DATABASE_URL (local) y REMOTE_DATABASE_URL (Railway, etc.):
#   PG_COPY_DIRECTION=push   # copia DATABASE_URL → REMOTE_DATABASE_URL (default)
#   PG_COPY_DIRECTION=pull   # copia REMOTE_DATABASE_URL → DATABASE_URL
#   npm run db:pg-copy-database
#
# ADVERTENCIA: pg_restore --clean elimina objetos en destino antes de recrear. Haz backup del remoto antes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

if [[ -z "${SOURCE_DATABASE_URL:-}" || -z "${TARGET_DATABASE_URL:-}" ]]; then
  if [[ -n "${DATABASE_URL:-}" && -n "${REMOTE_DATABASE_URL:-}" ]]; then
    direction="${PG_COPY_DIRECTION:-push}"
    case "$direction" in
      push)
        SOURCE_DATABASE_URL="$DATABASE_URL"
        TARGET_DATABASE_URL="$REMOTE_DATABASE_URL"
        ;;
      pull)
        SOURCE_DATABASE_URL="$REMOTE_DATABASE_URL"
        TARGET_DATABASE_URL="$DATABASE_URL"
        ;;
      *)
        echo "PG_COPY_DIRECTION debe ser push o pull (recibido: $direction)." >&2
        exit 1
        ;;
    esac
    echo "Modo $direction (origen → destino según DATABASE_URL y REMOTE_DATABASE_URL)."
  else
    echo "Opción A: export SOURCE_DATABASE_URL y TARGET_DATABASE_URL." >&2
    echo "Opción B: en .env define DATABASE_URL y REMOTE_DATABASE_URL; ejecuta con PG_COPY_DIRECTION=push|pull." >&2
    exit 1
  fi
fi

command -v pg_dump >/dev/null || { echo "Instale pg_dump (PostgreSQL client)." >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "Instale pg_restore (PostgreSQL client)." >&2; exit 1; }

TMP_DUMP="$(mktemp -t vos-pg.XXXXXX.dump)"
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
