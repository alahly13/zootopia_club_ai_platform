<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0881a34b-a784-43a9-bb78-0ee37da934d9

## Run Locally

**Preferred runtime contract:** Node 22.x and Python 3.11

The repo now includes `.nvmrc`, `.node-version`, and `.python-version` so the
runtime contract is discoverable before bootstrap instead of being buried in
platform-specific settings.


1. Bootstrap the local runtime:
   `npm run setup:local`
2. Copy [.env.example](.env.example) to `.env` and set the required secrets.
3. Verify the extraction runtime:
   `npm run verify:local`
4. Run the app:
   `npm run dev`

## Deployment

Multi-platform deployment is driven by:

- `deployment/runtime-manifest.json`: canonical deployment manifest, including the explicit Python extraction dependency path and platform contract files
- `server/documentRuntime/python/requirements.txt`: canonical Python extraction requirements
- `tools/deploymentRuntime.mjs`: shared verification/bootstrap helper
- `Dockerfile`: canonical backend runtime adapter for backend-capable managed hosts

Backend-capable managed hosts now converge on the shared `Dockerfile` contract, while Netlify and Vercel stay explicitly frontend-only.

See [DEPLOYMENT.md](DEPLOYMENT.md) for:

- local development bootstrap
- generic Linux / VPS setup
- Render
- Netlify
- Vercel
- Railway
- Fly.io
- Google Cloud Run
- Docker fallback

## Authorship And Copyright

Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
Developed by Elmahdy Abdallah Youssef, Software Developer.
Class of 2022, Faculty of Science, Cairo University, Zoology Department.

See [NOTICE.md](NOTICE.md) and [AUTHORS.md](AUTHORS.md) for project-level authorship details.
