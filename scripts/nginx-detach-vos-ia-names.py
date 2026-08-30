#!/usr/bin/env python3
"""Quita vos-ia.com / www.vos-ia.com de vhosts ajenos (p. ej. arandanocafe.com).

Certbot --nginx suele agregar esos nombres al site SSL por defecto del VPS.
Entonces https://vos-ia.com cae en Next.js :3000 (Arándano Café).
"""
from __future__ import annotations

import pathlib
import re
import sys

DROP = frozenset({"vos-ia.com", "www.vos-ia.com"})
KEEP_BASENAME = "vos-ia.com"
SCAN_DIRS = [
    pathlib.Path("/etc/nginx/sites-available"),
    pathlib.Path("/etc/nginx/sites-enabled"),
    pathlib.Path("/etc/nginx/conf.d"),
]
SERVER_NAME_RE = re.compile(r"(server_name\s+)([^;]+)(;)", re.IGNORECASE)


def strip_names(raw: str) -> str | None:
    names = raw.split()
    kept = [n for n in names if n.strip("'\"") not in DROP]
    if kept == names:
        return None
    if not kept:
        return ""
    return " ".join(kept)


CERTBOT_IF_HOST_RE = re.compile(
    r"\n?\s*if\s*\(\s*\$host\s*=\s*'?(?:www\.)?vos-ia\.com'?\s*\)\s*\{[^{}]*\}\s*(?:#.*)?",
    re.IGNORECASE,
)


def process_text(text: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    cleaned, n = CERTBOT_IF_HOST_RE.subn("", text)
    if n:
        notes.append(f"eliminados {n} if ($host = vos-ia.com) de Certbot")
        text = cleaned

    def repl(match: re.Match[str]) -> str:
        stripped = strip_names(match.group(2))
        if stripped is None:
            return match.group(0)
        if stripped == "":
            notes.append("server_name solo tenía vos-ia.*; se deja el bloque intacto")
            return match.group(0)
        notes.append(f"{match.group(2).strip()} → {stripped}")
        return f"{match.group(1)}{stripped}{match.group(3)}"

    return SERVER_NAME_RE.sub(repl, text), notes


def iter_targets() -> list[pathlib.Path]:
    seen: set[pathlib.Path] = set()
    out: list[pathlib.Path] = []
    for folder in SCAN_DIRS:
        if not folder.is_dir():
            continue
        for path in sorted(folder.iterdir()):
            if not path.is_file() and not path.is_symlink():
                continue
            try:
                real = path.resolve()
            except OSError:
                continue
            if real in seen:
                continue
            if real.name == KEEP_BASENAME:
                continue
            if real.suffix in {".bak", ".disabled"} or ".bak-" in real.name:
                continue
            seen.add(real)
            out.append(real)
    return out


def main() -> int:
    changed: list[str] = []
    for path in iter_targets():
        try:
            original = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            print(f"SKIP {path}: {exc}", file=sys.stderr)
            continue
        updated, notes = process_text(original)
        if updated == original:
            continue
        path.write_text(updated, encoding="utf-8")
        changed.append(str(path))
        for note in notes:
            print(f"FIX {path}: {note}")
    if not changed:
        print("OK: ningún vhost ajeno listaba vos-ia.com")
    else:
        print("CHANGED " + " ".join(changed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
