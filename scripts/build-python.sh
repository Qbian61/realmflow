#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/python-service"
OUTPUT_DIR="$ROOT_DIR/resources/sidecar"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
PYTHON_BIN="${REALMFLOW_PYTHON:-$ROOT_DIR/.venv/bin/python}"
export PYINSTALLER_CONFIG_DIR="$ROOT_DIR/.build/pyinstaller-cache"

if [[ "$ARCH" == "x86_64" ]]; then
  ARCH="x64"
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="python3"
fi

mkdir -p "$OUTPUT_DIR"
"$PYTHON_BIN" -m PyInstaller \
  --clean \
  --noconfirm \
  --onefile \
  --name "realmflow-agent-$PLATFORM-$ARCH" \
  --distpath "$OUTPUT_DIR" \
  --workpath "$ROOT_DIR/.build/python" \
  --specpath "$ROOT_DIR/.build/python" \
  "$SERVICE_DIR/main.py"
