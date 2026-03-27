#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Generic Linux/VPS bootstrap path: install Node deps, create the repo-local
# Python virtual environment, install extraction requirements, verify them, and
# build the frontend assets that server.ts serves in production.
cd "$ROOT_DIR"
node tools/deploymentRuntime.mjs linux-server-bootstrap
