# syntax=docker/dockerfile:1.7

# Universal backend container for the current architecture:
# one Node service, one repo-local Python virtual environment, and the nested
# extraction worker installed from server/documentRuntime/python/requirements.txt.
ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.11
FROM node:${NODE_VERSION}-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DOCUMENT_RUNTIME_PYTHON_EXECUTABLE=/app/.venv/bin/python \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Keep the OS layer explicit because the current runtime needs Node, Python,
# and native build support for dependencies like better-sqlite3. Python 3.11
# is declared intentionally so the shared backend contract does not depend on
# a distro-default interpreter changing underneath managed hosts.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python${PYTHON_VERSION} \
    python3-pip \
    python${PYTHON_VERSION}-venv \
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

RUN python${PYTHON_VERSION} -m venv .venv \
  && .venv/bin/python -m pip install --upgrade pip \
  && .venv/bin/python -m pip install -r server/documentRuntime/python/requirements.txt

COPY . .

RUN node tools/deploymentRuntime.mjs verify \
  && node tools/deploymentRuntime.mjs python-detect \
  && npm run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
