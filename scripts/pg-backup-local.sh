#!/usr/bin/env bash
# Volcado completo de la base apuntada por DATABASE_URL (formato custom de pg_dump).
# Los archivos van a backups/ (ignorados por git). Copia el .dump a disco externo o S3 antes de borrar el volumen Docker.
#
# Uso: npm run db:backup
#      bash scripts/pg-backup-local.sh [ruta-opcional.dump]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL no está definida (.env en la raíz del repo)." >&2
  exit 1
fi

command -v pg_dump >/dev/null || {
  echo "Instala el cliente PostgreSQL (pg_dump)." >&2
  exit 1
}

BACKUP_DIR="$REPO_ROOT/backups"
mkdir -p "$BACKUP_DIR"

if [[ -n "${1:-}" ]]; then
  OUT="$1"
else
  STAMP="$(date +%Y%m%d-%H%M%S)"
  OUT="$BACKUP_DIR/vos-${STAMP}.dump"
fi

echo "Volcando → $OUT"
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  -f "$OUT"

echo "OK. Tamaño: $(du -h "$OUT" | cut -f1)"
echo "Copia este archivo a un lugar seguro antes de docker compose down -v o de cambiar de máquina."
