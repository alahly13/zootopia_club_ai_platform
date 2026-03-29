# Zootopia Club Deployment Guide — Firebase Hosting + Cloud Run
## Project: `zootopia2026`
## Domain: `zootopiaclub.studio`

> This guide is for the practical deployment path below:
>
> - **Frontend** on **Firebase Hosting**
> - **Backend / API** on **Google Cloud Run**
> - **Firebase Hosting rewrites** to forward `/api/**` to Cloud Run
> - **Custom domain** from **Name.com** to Firebase Hosting

---

## 1) Why this is the best path

This setup is a strong fit for **Zootopia Club** because:

- **Firebase Hosting** is excellent for static frontend delivery
- **Cloud Run** is a strong choice for Node/Express backend workloads
- **Firebase Hosting rewrites** make the platform feel like one unified app
- It works well with:
  - Firebase Auth
  - Firestore
  - Firebase Storage
  - a custom domain
- It keeps the architecture clean and scalable

This path is especially suitable for Zootopia Club because the platform needs:

- a fast React/Vite frontend
- a separate structured backend
- support for file handling and AI-related backend logic
- room for future expansion

---

## 2) Final recommended architecture

```text
User Browser
   |
   v
zootopiaclub.studio  --> Firebase Hosting (Frontend)
   |
   +--> /api/** --> Cloud Run service: zootopia-api
```

---

## 3) Requirements before you start

Make sure you have:

- a Firebase / Google Cloud project named: `zootopia2026`
- **Blaze plan** enabled
- a Google account with proper permissions on the project
- the domain `zootopiaclub.studio` registered at Name.com
- Node.js installed
- npm installed
- VS Code installed
- Git installed optionally, but recommended

---

## 4) Install the required tools

### 4.1 Install Firebase CLI

```bash
npm install -g firebase-tools
```

Check installation:

```bash
firebase --version
```

### 4.2 Install Google Cloud CLI on Windows

#### Official method
1. Open the official Google Cloud CLI website
2. Download the Windows installer
3. Run the installer
4. Complete the default setup
5. Open a new terminal

Check installation:

```bash
gcloud --version
```

If the command does not work:
- close and reopen the terminal
- or restart the computer
- or verify that `gcloud` was added to `PATH`

---

## 5) Log in and connect the tools to the project

### 5.1 Log in to Firebase

```bash
firebase login
```

### 5.2 Log in to Google Cloud

```bash
gcloud auth login
```

### 5.3 Set the active project

```bash
gcloud config set project zootopia2026
```

### 5.4 Verify the active project

```bash
gcloud config get-value project
```

It should return:

```bash
zootopia2026
```

### 5.5 Create Application Default Credentials

This is useful for some Google libraries and tools:

```bash
gcloud auth application-default login
```

---

## 6) Enable the required services

Enable these services in Google Cloud Console / Firebase Console:

- Firebase Hosting
- Cloud Run
- Cloud Build
- Artifact Registry
- Firestore
- Cloud Storage
- Secret Manager
- Firebase Authentication

---

## 7) Prepare the project locally

Open the project root in VS Code.

A typical structure may look like:

```text
project-root/
  src/
  server/
  public/
  package.json
  firebase.json
  .firebaserc
```

The exact structure can differ, but you must clearly know:

- where the frontend lives
- where the backend lives
- what the build command is
- what the frontend build output folder is

---

## 8) Initialize Firebase Hosting

From the project root:

```bash
firebase init hosting
```

### When prompted:
- choose project: `zootopia2026`
- set public root to:
  - usually `dist` for Vite
- Is this a single-page app?
  - **Yes**
- Overwrite existing files?
  - usually **No**

---

## 9) Build the frontend

For React/Vite:

```bash
npm run build
```

Then confirm that `dist` was generated successfully.

---

## 10) Configure `firebase.json`

Use a structure close to this:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "zootopia-api",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

### What this means
- `"public": "dist"` tells Firebase Hosting to serve the frontend from `dist`
- the first rewrite sends `/api/**` requests to Cloud Run
- the second rewrite sends all other routes to `index.html` for SPA routing

---

## 11) Configure `package.json`

Make sure your scripts are clear.

### Frontend scripts
For a Vite-based frontend, you typically want:

```json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### Backend start script
Cloud Run needs a clear backend entry command, for example:

```json
{
  "scripts": {
    "start": "tsx server.ts"
  }
}
```

The important part is that the backend can start reliably from a clear command.

---

## 12) Prepare the backend for Cloud Run

### 12.1 Use `PORT`
The backend must listen on `process.env.PORT`.

Example:

```js
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
```

Do not rely only on a fixed local port inside Cloud Run.

### 12.2 Add a health endpoint
Recommended:

```js
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});
```

---

## 13) First frontend deployment

```bash
firebase deploy --only hosting
```

After deployment, Firebase gives you a URL like:

- `https://zootopia2026.web.app`
- or `https://zootopia2026.firebaseapp.com`

Test the frontend there first.

---

## 14) Deploy the backend to Cloud Run

From the project root:

```bash
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
```

### Optional version with more resources

```bash
gcloud run deploy zootopia-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --timeout 1800
```

### Meaning of the key options
- `zootopia-api` = Cloud Run service name
- `--source .` = deploy from the current folder
- `--region us-central1` = deployment region
- `--allow-unauthenticated` = allow public web access
- `--memory 2Gi` = increase memory
- `--timeout 1800` = set timeout to 30 minutes

Start simple, then increase memory and timeout only when needed.

---

## 15) Test Cloud Run directly

After deployment, Google gives you a URL similar to:

```text
https://zootopia-api-xxxxx-uc.a.run.app
```

Test:

- `/health`
- any known API endpoint

Example:

```bash
curl https://YOUR_RUN_URL/health
```

---

## 16) Deploy Hosting again after Cloud Run is ready

Once the Cloud Run service name and region match `firebase.json`, deploy Hosting again:

```bash
firebase deploy --only hosting
```

Now:

- the frontend runs from Firebase Hosting
- `/api/**` is forwarded to Cloud Run

---

## 17) Use `/api` from the frontend

Instead of hardcoding the Cloud Run URL in the frontend, prefer:

```ts
const API_BASE = "/api";
```

or in `.env`:

```env
VITE_API_BASE_URL=/api
```

This is better because it:

- reduces CORS issues
- keeps the app looking unified
- makes the custom domain setup cleaner

---

## 18) Connect the custom domain `zootopiaclub.studio`

### 18.1 In Firebase Console
1. Open project `zootopia2026`
2. Go to **Hosting**
3. Click **Add custom domain**
4. Add:
   - `zootopiaclub.studio`
   - `www.zootopiaclub.studio`

### 18.2 In Name.com
1. Log in
2. Open **My Domains**
3. Select `zootopiaclub.studio`
4. Open **Manage DNS Records**
5. Add the DNS records exactly as Firebase gives them to you

Do not guess the records. Copy them exactly from Firebase.

### 18.3 Wait for verification
- return to Firebase Hosting
- wait until the domain becomes connected / verified
- SSL will usually be provisioned automatically

---

## 19) Update Firebase Auth after the domain is connected

If you use Firebase Auth:

1. Open Firebase Console
2. Go to **Authentication**
3. Open **Settings**
4. Add these domains to **Authorized domains**:
   - `zootopiaclub.studio`
   - `www.zootopiaclub.studio`

This is very important. Without it, login may fail after the custom domain goes live.

---

## 20) Environment variables

### 20.1 Frontend environment variables
Example:

```env
VITE_API_BASE_URL=/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=zootopia2026
```

### 20.2 Cloud Run environment variables
Use Cloud Run Console or CLI.

Example:

```bash
gcloud run services update zootopia-api \
  --region us-central1 \
  --update-env-vars NODE_ENV=production
```

For sensitive values, Secret Manager is recommended.

---

## 21) Daily deployment commands

### If you changed the frontend

```bash
npm run build
firebase deploy --only hosting
```

### If you changed the backend

```bash
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
```

### If you changed both

```bash
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
npm run build
firebase deploy --only hosting
```

---

## 22) Full update / redeploy commands using `cloudrun.env`

### 22.1 Update backend + environment variables together
If you changed backend code and also want to apply environment variables from `cloudrun.env`:

```bash
gcloud config set project zootopia2026
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated --env-vars-file=cloudrun.env
```

This:
- rebuilds the backend
- deploys the latest backend code
- updates Cloud Run environment variables from `cloudrun.env`

### 22.2 Update Cloud Run environment variables only
If you changed only `cloudrun.env` and do not want a full rebuild:

```bash
gcloud run services update zootopia-api --region us-central1 --env-vars-file=cloudrun.env
```

### 22.3 Full project update
If you changed:
- backend code
- frontend code
- and `cloudrun.env`

Use this order:

```bash
gcloud config set project zootopia2026
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated --env-vars-file=cloudrun.env
npm run build
firebase deploy --only hosting
```

### 22.4 Frontend-only update
```bash
npm run build
firebase deploy --only hosting
```

### 22.5 Backend-only update
```bash
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated --env-vars-file=cloudrun.env
```

### 22.6 Environment-only Cloud Run update
```bash
gcloud run services update zootopia-api --region us-central1 --env-vars-file=cloudrun.env
```

### 22.7 Describe the current Cloud Run service
```bash
gcloud run services describe zootopia-api --region us-central1
```

### 22.8 Read Cloud Run logs
```bash
gcloud run services logs read zootopia-api --region us-central1
```

---

## 23) Very useful commands

### Firebase
```bash
firebase login
firebase logout
firebase use --add
firebase projects:list
firebase init hosting
firebase deploy --only hosting
firebase deploy
firebase hosting:channel:list
firebase hosting:channel:deploy preview
firebase emulators:start
firebase serve
```

### Google Cloud CLI
```bash
gcloud --version
gcloud auth login
gcloud auth list
gcloud auth application-default login
gcloud config set project zootopia2026
gcloud config get-value project
gcloud config list
gcloud projects describe zootopia2026
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
gcloud run services list
gcloud run services describe zootopia-api --region us-central1
gcloud run services update zootopia-api --region us-central1 --memory 2Gi
gcloud run services update zootopia-api --region us-central1 --timeout 1800
gcloud logging read
```

---

## 24) Troubleshooting commands

### List Cloud Run services
```bash
gcloud run services list
```

### Describe the service
```bash
gcloud run services describe zootopia-api --region us-central1
```

### Read recent logs
```bash
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

### Run locally
```bash
npm run dev
```

### Run Firebase locally
```bash
firebase emulators:start
```

---

## 25) Most common issues

### 25.1 Frontend works but API does not
Check:
- Cloud Run service name in `firebase.json`
- region
- `/api/**` rewrite
- whether the backend is actually running on Cloud Run

### 25.2 White screen after deployment
Check:
- did `npm run build` succeed?
- is `public` in `firebase.json` really `dist`?
- did the build output valid files?

### 25.3 Login fails after connecting the domain
Check:
- Firebase Auth authorized domains
- API base URL
- CORS
- whether you still use the old `web.app` domain in some settings

### 25.4 Cloud Run startup fails
Check:
- start command
- `process.env.PORT`
- logs
- environment variables
- dependencies
- whether you need a custom Dockerfile

---

## 26) Important recommendations for Zootopia Club

- use `/api` as the main API path from the frontend
- do not hardcode the `run.app` URL in the frontend unless it is a temporary fallback
- keep frontend and backend separated internally, but unified for the end user
- add `/health`
- add clear startup logs
- test on `web.app` before connecting the custom domain
- do not touch DNS until the base deployment works

---

## 27) Ideal execution order

1. Install Firebase CLI
2. Install Google Cloud CLI
3. `firebase login`
4. `gcloud auth login`
5. `gcloud config set project zootopia2026`
6. Enable Hosting and Cloud Run
7. `firebase init hosting`
8. configure `firebase.json`
9. `npm run build`
10. `firebase deploy --only hosting`
11. `gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated`
12. test `web.app`
13. add custom domain from Firebase
14. copy DNS records into Name.com
15. wait for activation
16. add the domain to Firebase Auth
17. test the final site

---

## 28) Final short command set

```bash
firebase login
gcloud auth login
gcloud config set project zootopia2026
firebase init hosting
npm run build
firebase deploy --only hosting
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
firebase deploy --only hosting
```

### Recommended full redeploy set with `cloudrun.env`

```bash
gcloud config set project zootopia2026
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated --env-vars-file=cloudrun.env
npm run build
firebase deploy --only hosting
```

---

## 29) Notes for larger files

Since your current chosen maximum file size is **32MB**:
- you can upload files through the normal interface
- process them through the backend as currently designed

If you later return to larger file sizes, the better long-term architecture is:
- upload to Cloud Storage
- then process through Cloud Run

---

## 30) Recommended official references

- Firebase Hosting Quickstart
- Firebase Hosting Overview
- Firebase Hosting + Cloud Run
- Firebase Custom Domain
- Firebase CLI Reference
- Cloud Run Docs
- Google Cloud CLI Docs
- Name.com DNS Help

---

## 31) First real deployment checklist

- [ ] Firebase CLI installed
- [ ] Google Cloud CLI installed
- [ ] Logged in to Firebase
- [ ] Logged in to Google Cloud
- [ ] Correct project: `zootopia2026`
- [ ] `firebase.json` configured
- [ ] `npm run build` works
- [ ] backend listens on `PORT`
- [ ] Cloud Run service deployed
- [ ] `/api/**` routed to Cloud Run
- [ ] `web.app` works
- [ ] custom domain added in Firebase
- [ ] DNS added in Name.com
- [ ] authorized domains added in Firebase Auth
