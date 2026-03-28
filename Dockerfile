# syntax=docker/dockerfile:1.7

# Universal backend container for the current architecture:
# one Node service, one repo-local Python virtual environment, and the nested
# extraction worker installed from server/documentRuntime/python/requirements.txt.
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DOCUMENT_RUNTIME_PYTHON_EXECUTABLE=/app/.venv/bin/python \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Keep the OS layer explicit because the current runtime needs Node, Python,
# and native build support for dependencies like better-sqlite3. On the
# bookworm base image, Debian's stable python3 packages resolve to the repo's
# existing Python 3.11 contract without relying on build-stage ARG expansion.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libgomp1 \
    libglib2.0-0 \
    libgl1 \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY deployment/runtime-manifest.json ./deployment/runtime-manifest.json
COPY server/documentRuntime/python/requirements.txt ./server/documentRuntime/python/requirements.txt

# Dev dependencies are intentionally preserved because the backend still starts
# from server.ts through tsx and the frontend still builds through Vite.
RUN npm ci --include=dev

RUN python3 -m venv .venv \
  && .venv/bin/python -m pip install --upgrade pip \
  && .venv/bin/python -m pip install -r server/documentRuntime/python/requirements.txt

# Temporary security-sensitive convenience path:
# when serviceAccountKey.json is intentionally present in the source/build
# context, COPY . . places it at /app/serviceAccountKey.json for the current
# Firebase Admin bootstrap path in server.ts. Replace this with Secret Manager
# or an attached Cloud Run service identity when the temporary file path is no
# longer needed.
COPY . .

RUN node tools/deploymentRuntime.mjs verify \
  && node tools/deploymentRuntime.mjs python-detect \
  && npm run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
