#!/usr/bin/env bash
# macOS: abre Terminal.app en una ventana nueva y ejecuta docker compose up -d.
# Uso: npm run db:local:up:terminal  (Docker Desktop debe estar en ejecución.)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker no está en PATH. Instala Docker Desktop." >&2
  exit 1
fi

case "$(uname -s)" in
Darwin)
  osascript -e 'on run argv
    tell application "Terminal"
      activate
      set dir to quoted form of item 1 of argv
      do script "cd " & dir & " && docker compose up -d && echo \"\" && echo \"Postgres listo (Docker en 127.0.0.1:5433). Migrar: npm run db:migrate && npm run db:seed\""
    end tell
  end run' "$ROOT"
  echo "Se abrió una ventana de Terminal con Docker Compose."
  ;;
Linux)
  echo "Abre otra terminal y ejecuta:"
  echo "  cd $(printf %q "$ROOT") && docker compose up -d"
  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal -- bash -lc "cd $(printf %q "$ROOT") && docker compose up -d; exec bash" &
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -e bash -lc "cd $(printf %q "$ROOT") && docker compose up -d; exec bash" &
  fi
  ;;
*)
  echo "Ejecuta en otra consola:"
  echo "  cd $(printf %q "$ROOT") && docker compose up -d"
  ;;
esac
