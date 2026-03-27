#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_PYTHON="$ROOT_DIR/.venv/bin/python"

cd "$ROOT_DIR"

# Generic Linux/VPS runtime path. Keep the Python worker explicit and fail
# early if the repo-local virtual environment has not been bootstrapped yet.
export NODE_ENV="${NODE_ENV:-production}"
export DOCUMENT_RUNTIME_PYTHON_EXECUTABLE="${DOCUMENT_RUNTIME_PYTHON_EXECUTABLE:-$DEFAULT_PYTHON}"

if [[ ! -x "$DOCUMENT_RUNTIME_PYTHON_EXECUTABLE" ]]; then
  echo "[deploy] Missing Python virtual environment at $DOCUMENT_RUNTIME_PYTHON_EXECUTABLE" >&2
  echo "[deploy] Run ./tools/setup-linux-server.sh first." >&2
  exit 1
fi

node tools/deploymentRuntime.mjs python-detect

if [[ ! -d "dist" ]]; then
  npm run build
fi

exec npm run start
