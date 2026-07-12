# Deployment Guide (Vercel + Render)

This project has two deploy targets:

- `web/` (Next.js app) -> deploy on **Vercel**
- `telegram-worker/` (Python listener) -> deploy on **Render** (worker service)

---

## 0) Pushed to GitHub but the live site does not change?

Your commits **are** on GitHub if `git status` says clean and `main` matches `origin/main`. The live app only updates when **Vercel** (web UI) and **Render** (worker) each complete a **successful** deploy.

| You changed | Must redeploy on |
|-------------|------------------|
| `web/` (dashboard, APIs, settings UI) | **Vercel** |
| `telegram-worker/` (listener.py) | **Render** (`placemint-telegram-worker`) |
| `.github/workflows/` | GitHub Actions only (not the website) |

### Check Vercel (most common)

1. [vercel.com](https://vercel.com) → your project → **Deployments**
2. Open the latest deployment for branch **`main`**
3. If status is **Error** or **Failed** → the site stays on the **old** build (push alone does nothing useful)

**Fix the usual misconfiguration** (build succeeds but deploy fails):

- **Settings → General → Root Directory**: pick **one** mode:
  - **`web`** → uses `web/vercel.json` — **Output Directory must be empty** (not `web/.next`)
  - **`.`** (repo root) → uses root `vercel.json` — **Output Directory must be empty**
- **Settings → Build → Output Directory**: **leave blank** (do not use `web/.next` unless root is repo root and you know what you are doing)
- **Production Branch**: `main`
- **Git**: connected to `harrypeter07/placement-ai`
- After fixing: **Deployments → … → Redeploy** (check **Use existing Build Cache** off once)

Confirm the new build: open your site → hard refresh (`Ctrl+Shift+R`) or incognito. Optional: add `?v=1` to the URL.

### Check Render (worker only)

1. [dashboard.render.com](https://dashboard.render.com) → **placemint-telegram-worker**
2. **Events** / **Logs** — last deploy should match your latest Git commit
3. **Settings → Build & Deploy → Auto-Deploy**: On, branch `main`
4. If no auto-deploy: **Manual Deploy → Deploy latest commit**

---

## 1) Build error: `cd: web: No such file or directory`

Your Vercel **Root Directory** is already **`web`**, but **Build Command** in the dashboard still says `cd web && ...`. Inside `web/`, there is no `web/` folder — the build fails.

### Fix in Vercel → Settings → Build and Development Settings

| Setting | Value (Root Directory = **web**) |
|---------|----------------------------------|
| Root Directory | `web` |
| Build Command | **empty** or `npm run build` only |
| Install Command | **empty** or `npm install` only |
| Output Directory | **empty** |

**Remove** any override like `cd web && npm install && npm run build`.

Redeploy. The repo’s `web/vercel.json` uses `npm install` + `npm run build` (no `cd web`).

---

## 2) Deploy error: `web/web/.next` not found

Your build completed, but deploy failed with:

`The Next.js output directory "web/.next" was not found at "/vercel/path0/web/web/.next"`

That means Vercel project setting **Output Directory** is still set to `web/.next` while your project root is already `web`.

### Fix in Vercel Project Settings

Go to **Project -> Settings -> Build and Development Settings**:

- **Output Directory**: clear it (recommended) OR set `.next`
- **Build Command**: leave empty to use `vercel.json`, or set `npm run build`
- **Install Command**: leave empty to use `vercel.json`, or set `npm install`

Then click **Redeploy**.

---

## 2) Recommended Vercel setup

You can deploy in either mode:

### Option A (recommended): Root = repository root

- Root Directory: `.`
- Uses root `vercel.json` with commands that enter `web/` when needed.

### Option B: Root = `web`

- Root Directory: `web`
- Output Directory: blank (or `.next`)
- Build Command: `npm run build`
- Install Command: `npm install`

---

## 3) Correct deploy order (read this first)

Telegram login happens on **Vercel** (the web app), not on Render. The worker only **reads** that session from MongoDB.

| Step | What | Why |
|------|------|-----|
| **1** | Deploy **Vercel** (web app) with all env vars | APIs for login + session storage live here |
| **2** | Open your **live Vercel URL** → sign in (Google) | Auth for Settings |
| **3** | **Settings → Connect Telegram** (phone + OTP) | Saves session to MongoDB |
| **4** | Deploy **Render background worker** | Polls Vercel for session, then runs Telethon |

You do **not** need Telegram connected before Render deploys — the worker can wait. You **do** need Vercel live **before** Connect Telegram (step 3).

**Same `MONGODB_URI` on Vercel and Render** — otherwise the worker never sees your session.

---

## 4) Environment variables

## A) Vercel (web app)

Set these in **Vercel -> Project -> Settings -> Environment Variables**:

- `MONGODB_URI`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (exact deployed web URL)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `TELEGRAM_WORKER_SECRET` (shared secret, must match worker)
- `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` (from my.telegram.org — required for **Connect Telegram** in Settings)
- `NODE_ENV=production`

Optional:

- `NEXT_PUBLIC_APP_URL` (same as `NEXTAUTH_URL`)

## B) Render (telegram worker)

Set these in **Render Worker service env**:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_PHONE` (optional — login is done in dashboard, not on Render)
- `GEMINI_API_KEY`
- `MONGODB_URI`
- `WEB_APP_URL` (your Vercel app URL)
- `TELEGRAM_WORKER_SECRET` (same value as Vercel)
- `TELEGRAM_DISCOVER_INTERVAL_SEC` (optional, default `900` — re-sync group catalog from Telegram)
- `TELEGRAM_GROUP_IDS` (optional legacy fallback; users enable groups in **Notifications** instead)

---

## 5) Google Cloud changes required

Open **Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client**.

For production, add:

- **Authorized JavaScript origins**
  - `https://<your-vercel-domain>`
- **Authorized redirect URIs**
  - `https://<your-vercel-domain>/api/auth/callback/google`

If using custom domain, add both Vercel default domain and custom domain URIs.

Also ensure on OAuth consent screen that app includes required scopes used by app:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/calendar`

> [!IMPORTANT]
> **Publish OAuth Consent App**: In your Google Cloud Console, navigate to the OAuth Consent Screen and click **Publish App** (move status from "Testing" to "In production"). If left in "Testing", Google will expire your refresh tokens every 7 days, causing automatic calendar syncs to break.

---

## 6) Deploy worker on Render

This repo already includes `render.yaml`.

### Web Service (paid) — keep it always active

Your worker is designed to run as a **Render Web Service** with three layers so it does not go inactive:

1. **Instant `/health` on `PORT`** — deploy passes port scan immediately  
2. **Self keepalive every 4 min** — worker pings its own public URL (`RENDER_EXTERNAL_URL` + `/health`)  
3. **Vercel Cron every 5 min** — `GET /api/cron/worker-ping` on your Vercel app pings the worker from outside  

#### Render Web Service settings

| Setting | Value |
|--------|--------|
| **Start command** | `cd telegram-worker && python -u listener.py` |
| **Health Check Path** | `/health` |
| **PYTHON_VERSION** | `3.11.9` |
| **KEEPALIVE_INTERVAL_SEC** | `240` (optional) |

Render auto-sets `RENDER_EXTERNAL_URL` (e.g. `https://placemint-telegram-worker.onrender.com`). No need to copy it unless you use Vercel cron (below).

#### Vercel env (second keepalive — recommended)

Add on **Vercel**:

- `TELEGRAM_WORKER_PUBLIC_URL` = your Render worker URL (no trailing slash), e.g. `https://placemint-telegram-worker.onrender.com`
- `CRON_SECRET` or reuse `TELEGRAM_WORKER_SECRET` (cron auth)

`vercel.json` already schedules `/api/cron/worker-ping` every **5 minutes**.

Manual test: open `https://<render-worker>/health` — should return `"ok": true` and `"mode": "web"`.

#### GitHub Actions keep-alive (free, every 2 minutes)

Repo includes `.github/workflows/keep-worker-alive.yml`.

1. GitHub → your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add secret **`WORKER_URL`** = `https://placement-ai-2lhp.onrender.com` (your Render URL, no trailing slash)
3. Optional: **`VERCEL_APP_URL`** = your Vercel URL, **`CRON_SECRET`** = `TELEGRAM_WORKER_SECRET`
4. Push to `main` — **Actions** tab shows runs; each run prints `waitReason` if still waiting

Note: GitHub may not run exactly every 2 minutes (platform scheduling), but it still pings regularly at no cost.

#### Verify logs after deploy

```
Health server listening on 0.0.0.0:XXXX (Render Web Service)
Keepalive every 240s → https://....onrender.com, http://127.0.0.1:XXXX
Web Service mode: HTTP + Telegram + keepalive in parallel
```

**Background Worker** is still supported (no `PORT`, no HTTP) if you switch later.

### Python version (important)

Render may default to a very new Python (e.g. 3.14). Telethon can fail with **“no running event loop”** during `TelegramClient(...)` init.

- **Blueprint:** `render.yaml` sets `PYTHON_VERSION=3.11.9` for the worker.
- **Manual worker service:** In Render → Environment, add `PYTHON_VERSION` = `3.11.9` (or `3.12.x`).

The worker also sets a default asyncio loop at import time in `telegram-worker/listener.py` for compatibility.

### Blueprint deploy

1. Render Dashboard -> **New** -> **Blueprint**
2. Select this repo
3. Render will create:
   - `placemint-web` (optional web service)
   - `placemint-telegram-worker` (worker)
4. Fill env vars listed above
5. Deploy

If web is already on Vercel, keep only worker active on Render.

### Connect Telegram (no terminal OTP on Render)

Render cannot run interactive `input()` for login codes. Use the dashboard instead:

1. Add `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` to **Vercel** and **Render** worker env.
2. Deploy web app, sign in, open **Settings**.
3. Use **Connect Telegram** → enter phone → OTP (and 2FA password if enabled).
4. The Render worker polls for the session every 30s — no redeploy needed after connecting.

### Dynamic Telegram groups (no manual env IDs)

1. Worker logs into your Telegram account and syncs **all** groups/channels to the app (`POST /api/telegram/groups`).
2. Users open **Notifications → Chats** and turn **Monitor** ON for placement groups they care about.
3. Worker polls `GET /api/telegram/groups/monitored` for the union of enabled IDs and only logs/backfills those chats.
4. Re-discovery runs every ~15 minutes (`TELEGRAM_DISCOVER_INTERVAL_SEC`); use **Refresh** in the UI to reload the catalog after sync.

You no longer need `TELEGRAM_GROUP_IDS` unless you want a legacy fallback before any user toggles monitoring.

---

## 7) Deploying on Railway (Recommended 24/7 Hosting)

Railway is excellent for running the background services because it runs 24/7 without sleep constraints. You will deploy two services on Railway:

### A) The Telegram Listener Worker
1. Create a new service on Railway connected to this repository.
2. Set the **Root Directory** of this service to `telegram-worker`. Railway will automatically build it using `telegram-worker/Dockerfile`!
3. Add the following Environment Variables:
   - `TELEGRAM_API_ID` & `TELEGRAM_API_HASH`
   - `MONGODB_URI`
   - `WEB_APP_URL` (your deployed Vercel URL, e.g. `https://your-app.vercel.app`)
   - `TELEGRAM_WORKER_SECRET` (same as Vercel)
   - `TELEGRAM_READ_ONLY=true` (highly recommended; Vercel now parses messages automatically)

### B) The Playwright Fallback Service (On-Demand Only)
1. Create another service on Railway connected to the same repository.
2. Set the **Root Directory** of this service to `isolated-fallback-service`. Railway will build it using the Playwright/Chromium Dockerfile!
3. Add a **Railway Volume** mounted at `/app/screenshots` so screenshots are persistent.
4. Add the following Environment Variables:
   - `MONGODB_URI`
   - `PUBLIC_URL` (Generate a Railway domain/static URL for this service)
5. On **Vercel**, add `PLAYWRIGHT_SERVICE_URL` pointing to this service's public domain.

### C) Reminder Cron Job
1. Set up a Railway cron service (or use a cron scheduling tool like UptimeRobot/Vercel Cron) to hit `POST https://your-app.vercel.app/api/reminders/process-due?apiKey=YOUR_SECRET` every 45 seconds. This processes and fires due pushes and Twilio voice calls independently of the Telegram listener state.

---

## 8) Twilio Calling Alert setup & constraints

To receive phone call alerts for approaching deadlines, set up a **Twilio Free Trial** account:
1. Obtain a free Twilio phone number.
2. **Verify your destination number**: In the Twilio Console under Verified Caller IDs, add and verify your personal phone number.
3. Configure the following environment variables on Vercel:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_PHONE_NUMBER` (your Twilio trial number)
   - `TWILIO_TO_PHONE_NUMBER` (your verified personal number)

> [!WARNING]
> **Twilio Trial Account Constraints**:
> 1. Trial accounts expire after **30 days** unless upgraded with standard billing details. Keep track of day 30 or upgrade early.
> 2. Every trial call plays a short introductory Twilio message ("You are using a trial account...") before reading out your custom placement deadline details. Upgrading your Twilio account removes this message.

---

## 9) Post-deploy verification checklist

1. Visit `<vercel-url>/api/health` and confirm web app responds.
2. Login with Google once.
3. Open calendar page and confirm connected status and event loading.
4. **Settings → Connect Telegram** (phone + OTP).
5. Restart Railway worker; verify `/api/telegram/status` shows worker online.
6. Verify reconnect logs match Railway console events to confirm root cause connection stability.
7. Groups appear in Notifications — toggle monitoring ON and run AI insights.
8. Confirm deadlines/reminders auto-created and visible in Placements.

---

## Useful links

- Vercel project settings: `https://vercel.com/<team>/<project>/settings`
- Railway dashboard: `https://railway.app/`
- Google Cloud Credentials: `https://console.cloud.google.com/apis/credentials`
- OAuth Consent Screen: `https://console.cloud.google.com/apis/credentials/consent`
