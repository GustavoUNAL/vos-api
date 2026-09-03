#!/usr/bin/env bash
# Genera VAPID en vos-api/.env si faltan (avisos nativos de citas).
# No imprime las claves. No toca arandano-app.
set -euo pipefail

API_DIR="${API_DIR:-$HOME/projects/vos-ai/vos-api}"
ENV_FILE="$API_DIR/.env"
[[ -f "$ENV_FILE" ]] || { echo "ERROR: Falta $ENV_FILE" >&2; exit 1; }

cd "$API_DIR"
if [[ ! -d node_modules/web-push ]]; then
  echo "==> web-push aún no está instalado; se omite VAPID hasta npm ci"
  exit 0
fi

python3 - "$ENV_FILE" "$API_DIR" <<'PY'
import re
import subprocess
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
api_dir = Path(sys.argv[2])
text = env_path.read_text()

def get(key: str) -> str:
    m = re.search(rf"^{re.escape(key)}=(.*)$", text, re.M)
    if not m:
        return ""
    return m.group(1).strip().strip("'").strip('"')

def upsert(src: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    if re.search(rf"^{re.escape(key)}=", src, re.M):
        return re.sub(rf"^{re.escape(key)}=.*$", line, src, count=1, flags=re.M)
    return src.rstrip() + "\n" + line + "\n"

if get("VAPID_PUBLIC_KEY") and get("VAPID_PRIVATE_KEY"):
    print("VAPID ya estaba en .env")
    sys.exit(0)

raw = subprocess.check_output(
    ["node", "-e", "const w=require('web-push'); process.stdout.write(JSON.stringify(w.generateVAPIDKeys()))"],
    cwd=str(api_dir),
    text=True,
)
import json
keys = json.loads(raw)
text = upsert(text, "VAPID_SUBJECT", get("VAPID_SUBJECT") or "mailto:arteagaestacio@gmail.com")
text = upsert(text, "VAPID_PUBLIC_KEY", keys["publicKey"])
text = upsert(text, "VAPID_PRIVATE_KEY", keys["privateKey"])
env_path.write_text(text)
print("VAPID generado y guardado en .env (no se muestran las claves)")
PY
