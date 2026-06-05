#!/usr/bin/env bash
# Restaura un volcado .dump (custom) sobre DATABASE_URL.
# Usa --clean --if-exists: borra objetos en destino antes de importar. Haz backup antes si la BD tiene datos que quieras conservar.
#
# Uso: npm run db:restore-backup -- backups/vos-20260108-120000.dump
#      bash scripts/pg-restore-local.sh backups/vos-....dump
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL no está definida (.env)." >&2
  exit 1
fi

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Uso: bash scripts/pg-restore-local.sh <archivo.dump>" >&2
  echo "Ejemplo: npm run db:restore-backup -- backups/vos-20260108-120000.dump" >&2
  exit 1
fi

command -v pg_restore >/dev/null || {
  echo "Instala el cliente PostgreSQL (pg_restore)." >&2
  exit 1
}

echo "Restaurando en DATABASE_URL actual (--clean --if-exists) desde:"
echo "  $FILE"
if [[ -z "${SKIP_RESTORE_CONFIRM:-}" ]]; then
  read -r -p "¿Continuar? [y/N] " ans
  case "$ans" in
  y | Y | yes | YES) ;;
  *)
    echo "Cancelado."
    exit 1
    ;;
  esac
fi

pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --jobs="${PG_RESTORE_JOBS:-4}" \
  "$FILE"

echo "OK. Ejecuta npm run db:generate si cambió el esquema y npm run start:dev."
