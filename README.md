<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0881a34b-a784-43a9-bb78-0ee37da934d9

## Run Locally

**Prerequisites:** Node.js and Python


1. Bootstrap the local runtime:
   `npm run setup:local`
2. Copy [.env.example](.env.example) to `.env` and set the required secrets.
3. Verify the extraction runtime:
   `npm run verify:local`
4. Run the app:
   `npm run dev`

## Deployment

Multi-platform deployment is now driven by the shared runtime manifest in `deployment/runtime-manifest.json` and the shared helper in `tools/deploymentRuntime.mjs`.

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
