# Deployment Guide

## Current Runtime Shape

Zootopia Club is still one backend process from `server.ts`. In production that same Node process serves `dist` and spawns the nested Python extraction worker at `server/documentRuntime/python/extract_document.py`.

The deployment layer is intentionally split into:

- `deployment/runtime-manifest.json`: canonical deployment manifest, including the explicit Python dependency path and the platform contract files
- `server/documentRuntime/python/requirements.txt`: canonical Python extraction dependency source
- `tools/deploymentRuntime.mjs`: shared bootstrap and verification helper
- `render.yaml`: native Render service contract
- `Dockerfile`: portable backend runtime for container-based hosts

## Strategy

The repository now uses a hybrid deployment strategy:

- shared manifest plus shared helper for validation and bootstrap
- native Render backend configuration
- shared Docker backend for container-based managed hosts
- explicit frontend-only configs for static hosts

That means:

- local development and generic Linux/VPS use the shared helper plus shell scripts
- Render uses the native `render.yaml` plus the shared deployment helper
- Railway, Fly.io, Google Cloud Run, and generic container hosts use the shared `Dockerfile`
- Netlify and Vercel build only the frontend and do not claim to host the backend Python extractor

## Cross-Platform Node Dependencies

Do not add OS-specific native binary packages directly to `package.json`.

Examples that must remain out of root dependencies:

- `@tailwindcss/oxide-win32-x64-msvc`
- `lightningcss-win32-x64-msvc`

Keep only the generic packages such as `@tailwindcss/vite`, `tailwindcss`, `lightningcss`, and `vite`. Their upstream optional-dependency graph is what selects the correct host binary on Windows or Linux.

## Canonical Python Extraction Contract

The Python extraction stack is intentionally anchored to:

- `server/documentRuntime/python/requirements.txt`
- `server/documentRuntime/python/extract_document.py`

`tools/deploymentRuntime.mjs` fails fast if either file is missing. It also checks that the manifest package list stays aligned with the pinned requirements file.

## Deployment Manifest Visibility

`deployment/runtime-manifest.json` now explicitly records the deployment contract for:

- local development
- generic Linux server
- Render
- Netlify
- Vercel
- Railway
- Fly.io
- Google Cloud Run
- Docker

Each target lists its contract files so `node tools/deploymentRuntime.mjs verify` can fail fast if a platform adapter disappears or drifts.

## Runtime Version Contract

The deployment manifest now declares the preferred raw-host/runtime contract as:

- Node `22.x`
- Python `3.11`

Repo-root visibility files:

- `.nvmrc`
- `.node-version`
- `.python-version`

`tools/deploymentRuntime.mjs` verifies those files stay aligned with `deployment/runtime-manifest.json`, so runtime-version intent is discoverable and fail-fast instead of tribal knowledge.

## Verification Commands

- `npm run verify:deployment-contract`
- `npm run verify:python-runtime`
- `npm run verify:python-runtime:deep`
- `npm run verify:local`

What they do:

- `verify:deployment-contract` checks the manifest, backend entrypoint, canonical Python paths, and every declared platform contract file.
- `verify:python-runtime` runs the real Python detector from `extract_document.py` and fails if required extraction packages are missing.
- `verify:local` verifies the repo-local `.venv` or an explicitly supplied `DOCUMENT_RUNTIME_PYTHON_EXECUTABLE`.

## Local Development

Recommended workflow:

1. `npm run setup:local`
2. Copy `.env.example` to `.env` and fill the required secrets.
3. `npm run verify:local`
4. `npm run dev`

`npm run setup:local` creates `.venv`, installs `server/documentRuntime/python/requirements.txt`, and validates the extractor with the real detector. The backend then auto-detects `.venv` through `server/documentRuntime/config.ts` without requiring manual activation.

When multiple Python interpreters are available, the helper now looks for Python `3.11` first before falling back to another interpreter on PATH.

## Generic Linux Server / VPS

Raw-host path:

1. `./tools/setup-linux-server.sh`
2. Configure `.env`
3. `./tools/start-linux-server.sh`

The setup script installs Node dependencies, creates `.venv`, installs the canonical Python requirements, runs the detector, and builds the frontend assets. The start script refuses to run if `node_modules` or the repo-local Python runtime are missing, then re-runs the Python detector before starting the backend.

## Render

Render now uses a native Node service contract via `render.yaml`.

This keeps Render explicit without Docker:

- build command: `npm run deploy:render:build`
- start command: `npm run start`
- runtime Python executable: `.venv/bin/python`
- health path: `/api/health`

The shared render build helper still:

- verifies `deployment/runtime-manifest.json`
- verifies `server/documentRuntime/python/requirements.txt`
- installs Node dependencies with devDependencies preserved
- creates `.venv`
- installs the Python extraction requirements
- verifies the Python worker
- builds the frontend assets

## Netlify

Netlify remains frontend-only.

`netlify.toml` runs `npm run deploy:netlify:build`, pins Netlify build Node to `22`, verifies the canonical deployment contract, and then builds `dist`. It does not claim to run the Express backend or the Python extraction worker.

## Vercel

Vercel also remains frontend-only.

`vercel.json` installs Node dependencies, runs `npm run deploy:vercel:build`, and publishes `dist`. Like Netlify, it keeps the Python dependency path visible during build without pretending the backend runtime lives there. The repo-root Node version files make the intended Vercel build runtime explicit.

## Railway

Railway uses `railway.toml` with `builder = "DOCKERFILE"`.

That keeps dependency installation explicit inside the shared container:

- `npm ci --include=dev`
- `.venv` creation
- `pip install -r server/documentRuntime/python/requirements.txt`
- manifest verification
- Python capability verification

## Fly.io

Fly.io uses `fly.toml` plus the shared `Dockerfile`.

`fly.toml` keeps the internal port and `DOCUMENT_RUNTIME_PYTHON_EXECUTABLE=/app/.venv/bin/python` explicit, while the container owns installation of both Node and Python dependencies.

## Google Cloud Run

Cloud Run uses `cloudbuild.yaml` to build and deploy the shared Docker image.

That gives Cloud Run the same backend runtime contract as Railway and Fly.io instead of a separate platform-specific install path.

## Docker Fallback

The `Dockerfile` is the portable backend contract for:

- Railway
- Fly.io
- Google Cloud Run
- generic container hosts

Build locally with:

- `docker build -t zootopia-club-ai .`
- `docker run --rm -p 3000:3000 --env-file .env zootopia-club-ai`

## Runtime Version Consistency

Runtime visibility now exists in both the manifest and repo-root version files:

- `deployment/runtime-manifest.json`
- `.nvmrc`
- `.node-version`
- `.python-version`
- `package.json` `engines.node`

The shared backend container also stays explicit:

- `Dockerfile` pins the backend base image to the Node 22 line
- `Dockerfile` provisions Python `3.11`, `venv`, and system libraries before installing the canonical requirements file

For raw-host installs, the helper still validates real Python capability after installation rather than assuming that version declarations alone guarantee a working extraction runtime.

## Important Limitations

- The backend still starts through `tsx server.ts`, so backend-capable installs intentionally retain devDependencies for now.
- Netlify and Vercel are frontend-only in the current architecture.
- Local and raw Linux setups require a Python runtime with `venv` support available on PATH.
- Deep Python verification still depends on an environment that allows the Node process to spawn the Python worker directly.
