# Deployment Guide (Vercel + Render)

This project has two deploy targets:

- `web/` (Next.js app) -> deploy on **Vercel**
- `telegram-worker/` (Python listener) -> deploy on **Render** (worker service)

---

## 1) Fix your current Vercel error

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

## 3) Environment variables

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

## 4) Google Cloud changes required

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

---

## 5) Deploy worker on Render

This repo already includes `render.yaml`.

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

## 6) Post-deploy verification checklist

1. Visit `<vercel-url>/api/health` and confirm web app responds.
2. Login with Google once.
3. Open calendar page and confirm connected status and event loading.
4. **Settings → Connect Telegram** (phone + OTP).
5. Restart Render worker; verify `/api/telegram/status` shows worker online.
6. Groups appear in Notifications — toggle monitoring ON and run AI insights.
6. Confirm deadlines/reminders auto-created and visible in Placements.

---

## Useful links

- Vercel project settings: `https://vercel.com/<team>/<project>/settings`
- Render dashboard: `https://dashboard.render.com/`
- Google Cloud Credentials: `https://console.cloud.google.com/apis/credentials`
- OAuth Consent Screen: `https://console.cloud.google.com/apis/credentials/consent`
