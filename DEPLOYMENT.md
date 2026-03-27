# Deployment Guide

## Current Runtime Shape

Zootopia Club currently runs as one Node service from `server.ts`. In production that same process serves the built SPA from `dist` and spawns the nested Python extraction worker at `server/documentRuntime/python/extract_document.py`.

The canonical deployment source of truth now lives in:

- `deployment/runtime-manifest.json`
- `server/documentRuntime/python/requirements.txt`
- `tools/deploymentRuntime.mjs`

The helper verifies those paths stay aligned before any platform-specific build path proceeds.

## Canonical Python Extraction Path

The Python extraction stack is intentionally anchored to:

- `server/documentRuntime/python/requirements.txt`
- `server/documentRuntime/python/extract_document.py`

Every deployment helper path verifies those files first. If either path is missing, deployment fails fast.

## Local Development

Recommended workflow:

1. `npm run setup:local`
2. Copy `.env.example` to `.env` and fill the required secrets.
3. `npm run verify:local`
4. `npm run dev`

`npm run setup:local` creates a repo-local `.venv`, installs `server/documentRuntime/python/requirements.txt`, and leaves the runtime in a state that `server/documentRuntime/config.ts` can auto-detect without manual venv activation.

## Generic Linux Server / VPS

Raw-host path:

1. `./tools/setup-linux-server.sh`
2. Configure `.env`
3. `./tools/start-linux-server.sh`

The setup script creates `.venv`, installs the Python extraction requirements from the canonical nested path, verifies the Python worker with the real detector, and builds the frontend assets.

The start script keeps `DOCUMENT_RUNTIME_PYTHON_EXECUTABLE` pointed at `.venv/bin/python`, verifies the extraction runtime again, and starts the existing Node backend entrypoint.

## Render

Render uses the explicit native build contract in `render.yaml`:

- build: `npm run deploy:render:build`
- start: `NODE_ENV=production DOCUMENT_RUNTIME_PYTHON_EXECUTABLE=.venv/bin/python npm run start`

That path uses the shared deployment helper to:

- verify `deployment/runtime-manifest.json`
- verify `server/documentRuntime/python/requirements.txt`
- create `.venv`
- install the Python extraction stack into `.venv`
- verify the extractor with the real `detect` command
- build the frontend assets

## Netlify

Netlify is intentionally frontend-only in the current architecture.

`netlify.toml` runs `npm run deploy:netlify:build`, which verifies the canonical nested Python extraction path for visibility and then builds the frontend. It does **not** pretend that the backend Express server or Python extraction worker run on Netlify.

## Vercel

Vercel is also intentionally frontend-only in the current architecture.

`vercel.json` uses:

- `installCommand`: `npm ci --include=dev`
- `buildCommand`: `npm run deploy:vercel:build`
- `outputDirectory`: `dist`

Like Netlify, it verifies the canonical nested Python extraction path during build, but it does **not** claim to host the backend Python extraction runtime.

## Railway

Railway uses `railway.toml` plus the shared `Dockerfile`.

That keeps the Node backend and the Python extraction worker inside one explicit container instead of relying on automatic buildpack inference.

## Fly.io

Fly.io uses `fly.toml` plus the shared `Dockerfile`.

The Fly config keeps the internal port explicit and sets `DOCUMENT_RUNTIME_PYTHON_EXECUTABLE` to the container’s repo-local `.venv`.

## Google Cloud Run

Cloud Run uses `cloudbuild.yaml` plus the shared `Dockerfile`.

The Docker image is the portability anchor for the current backend architecture, so Cloud Run sees the same Node runtime, the same `.venv`, and the same nested Python requirements path as the other backend-capable targets.

## Docker Fallback

The `Dockerfile` is the universal backend fallback for:

- Railway
- Fly.io
- Google Cloud Run
- generic container hosts
- any future environment that needs one explicit Node + Python runtime

Build locally with:

- `docker build -t zootopia-club-ai .`
- `docker run --rm -p 3000:3000 --env-file .env zootopia-club-ai`

## Verification Commands

- `npm run verify:python-runtime`
- `npm run verify:python-runtime:deep`
- `npm run verify:local`

`verify:python-runtime:deep` uses the real Python detector from `extract_document.py`, not just a file-existence check.

## Important Limitations

- The backend still starts from `server.ts` through `tsx`, so devDependencies remain intentionally present in backend deployment installs for now.
- Netlify and Vercel are frontend-only deployment targets in the current repository architecture.
- No global `.python-version` or `.node-version` file was added in this pass because the repo still lacks a validated cross-platform minor-version contract for every target. The container path is the strongest portable runtime pin for now.
