#!/usr/bin/env bash
# Restaura Google OAuth en el VPS de vos-ia.com.
# - No imprime secretos
# - No toca arandano-app ni .env del café
# - Copia ID/secret desde .env.local.bak-* si faltan en .env
# - Fuerza callback y front a https://vos-ia.com
#
#   bash ~/projects/vos-ai/vos-api/scripts/fix-vos-ia-google-oauth.sh
set -euo pipefail

API_DIR="${API_DIR:-$HOME/projects/vos-ai/vos-api}"
ENV_FILE="$API_DIR/.env"
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Falta $ENV_FILE"

log "Backup de .env"
cp -a "$ENV_FILE" "${ENV_FILE}.bak-google-${STAMP}"

python3 - "$ENV_FILE" "$API_DIR" <<'PY'
import re
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
api_dir = Path(sys.argv[2])
text = env_path.read_text()

def get(key: str, source: str) -> str:
    m = re.search(rf"^{re.escape(key)}=(.*)$", source, re.M)
    if not m:
        return ""
    return m.group(1).strip().strip("'").strip('"')

def upsert(src: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    if re.search(rf"^{re.escape(key)}=", src, re.M):
        return re.sub(rf"^{re.escape(key)}=.*$", line, src, count=1, flags=re.M)
    return src.rstrip() + "\n" + line + "\n"

pool = text
for bak in sorted(
    list(api_dir.glob(".env.local.bak-*")) + list(api_dir.glob(".env.bak-*")),
    key=lambda p: p.stat().st_mtime,
    reverse=True,
):
    try:
        pool += "\n" + bak.read_text()
    except OSError:
        continue

client_id = get("GOOGLE_CLIENT_ID", text) or get("GOOGLE_CLIENT_ID", pool)
secret = get("GOOGLE_CLIENT_SECRET", text) or get("GOOGLE_CLIENT_SECRET", pool)
if not client_id or not secret:
    sys.stderr.write(
        "No hay GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en .env ni en .env.local.bak-*\n"
    )
    sys.exit(2)

text = upsert(text, "GOOGLE_CLIENT_ID", client_id)
text = upsert(text, "GOOGLE_CLIENT_SECRET", secret)
text = upsert(text, "GOOGLE_REDIRECT_URI", "https://vos-ia.com/auth/google/callback")
text = upsert(text, "GOOGLE_FRONT_URL", "https://vos-ia.com")
env_path.write_text(text)
print("Google OAuth quedó en .env con callback https://vos-ia.com/auth/google/callback")
PY

if [[ "${MERGE_ONLY:-0}" == "1" ]]; then
  log "MERGE_ONLY=1: no se reinicia PM2"
  exit 0
fi

log "Reiniciar vos-api"
cd "$API_DIR"
if command -v pm2 >/dev/null 2>&1 && pm2 describe vos-api &>/dev/null; then
  pm2 restart vos-api --update-env
else
  die "PM2 vos-api no está. Reinicie el API a mano."
fi

sleep 2
code="$(curl -sI --max-time 8 "http://127.0.0.1:3001/auth/google?returnTo=login" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2; exit}')"
if echo "$code" | grep -q 'accounts.google.com'; then
  log "Listo: /auth/google redirige a Google."
else
  echo "WARN: Location inesperada: ${code:-<vacía>}" >&2
  echo "El login puede seguir en not_configured. Revise Google Console:" >&2
  echo "  https://vos-ia.com/auth/google/callback" >&2
fi
