# Railway & Vercel Upload Guide — Setup & Environment Variables

This guide details how to upload the components of **PlaceMint AI** to Vercel (Next.js web app) and Railway (background services), and how to configure all environment variables.

---

## 1. Directory Structure Overview

Here is the updated layout of your codebase:

```
placement-ai/
├── DEPLOYMENT_GUIDE.md             # Updated general deployment instructions
├── HOW_IT_WORKS.md                 # Original architecture guide
├── RAILWAY_SETUP_GUIDE.md          # [This File] Step-by-step Railway environment configuration
├── package.json                    # Root package scripts
├── vercel.json                     # Vercel Next.js framework configuration
│
├── telegram-worker/                # Main lightweight Telegram client (excl. Playwright)
│   ├── Dockerfile                  # Lightweight Railway worker configuration
│   ├── requirements.txt            # Python dependencies (Telethon, pymongo)
│   └── listener.py                 # Telethon worker script (repaired session logic)
│
├── isolated-fallback-service/      # Isolated Playwright Chromium container
│   ├── Dockerfile                  # Provisioned with Chromium and system libraries
│   ├── requirements.txt            # FastAPI, playwright, pymongo
│   └── main.py                     # FastAPI server exposing POST /fill-form
│
└── web/                            # Next.js Frontend and Backend API routes
    ├── app/
    │   ├── dashboard/
    │   │   ├── forms/page.tsx     # Form Automator Dashboard UI
    │   │   └── settings/page.tsx   # Updated Settings UI with Twilio & Form Profile
    │   └── api/
    │       ├── forms/              # HTML Scraper, Prefill URL, fallback trigger APIs
    │       ├── settings/route.ts   # Updated validation schemas for Form Profiles
    │       └── reminders/
    │           └── process-due/    # Decoupled active reminders & Twilio voice call cron API
    └── lib/
        ├── forms/google-forms.ts   # Scrapes field entries, fuzzy-matches, posts data
        ├── notifications/twilio.ts # Handles Twilio voice alerts & Telegram token expiry DM alert
        └── reminders/auto-setup.ts # Automated AI extraction, de-duplication, and calendar syncs
```

---

## 2. Step 1: Upload the Web App to Vercel

The Next.js application manages the dashboard interface, stores form profiles, and coordinates API endpoints.

1. Create a new project on **Vercel** and connect it to your GitHub repository `harrypeter07/placement-ai`.
2. Configure the **Build Settings**:
   - **Root Directory**: `.` (or `web` if deployed in isolated mode)
   - **Framework Preset**: `Next.js`
3. Add the following **Environment Variables** in Vercel:

| Variable Name | Description | Example / Recommended Value |
|---|---|---|
| `MONGODB_URI` | MongoDB Atlas Connection String | `mongodb+srv://user:pass@cluster.mongodb.net/placemint` |
| `NEXTAUTH_SECRET` | Secret key for session encryption | Run `openssl rand -base64 32` or any long random string |
| `NEXTAUTH_URL` | Your public Vercel application URL | `https://your-app.vercel.app` |
| `GOOGLE_CLIENT_ID` | Google Console OAuth Client ID | `xxxxxxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google Console OAuth Client Secret | From Google Credentials page |
| `GEMINI_API_KEY` | Gemini API Key for parsing | From Google AI Studio |
| `TELEGRAM_API_ID` | Telegram API ID (for connecting client) | Obtain from [my.telegram.org](https://my.telegram.org) |
| `TELEGRAM_API_HASH` | Telegram API Hash (for connecting client) | Obtain from [my.telegram.org](https://my.telegram.org) |
| `TELEGRAM_WORKER_SECRET` | Shared secret to authorize worker requests | A long random secure string (must match Railway) |
| `TELEGRAM_WORKER_PUBLIC_URL`| The public URL of your Railway Telegram Worker | `https://telegram-worker-production.up.railway.app` |
| `PLAYWRIGHT_SERVICE_URL` | The public URL of your Playwright fallback service | `https://isolated-fallback-service.up.railway.app` |
| `TWILIO_ACCOUNT_SID` | Twilio Account String ID | From Twilio Console Dashboard |
| `TWILIO_AUTH_TOKEN` | Twilio API Auth Token | From Twilio Console Dashboard |
| `TWILIO_FROM_PHONE_NUMBER` | Your Twilio Phone number (with country code) | e.g. `+1234567890` |
| `TWILIO_TO_PHONE_NUMBER` | Your verified personal phone number | e.g. `+91xxxxxxxxxx` (only needed for Twilio Free Trial) |

4. Click **Deploy**. Vercel will build and start your frontend web app.

---

## 3. Step 2: Deploy the Telegram Worker on Railway

The Telegram worker listens to messages in your monitored groups and relays them to Vercel. It is extremely light since Playwright has been stripped out of it.

1. Open your **Railway Dashboard**, click **New Project** -> **Deploy from GitHub repo**.
2. Select your repository.
3. In the service settings, set the **Root Directory** to `telegram-worker`. Railway will detect the `Dockerfile` and build it automatically!
4. Configure the following **Environment Variables** in Railway:

| Variable Name | Description | Value |
|---|---|---|
| `TELEGRAM_API_ID` | Telegram API ID | Same as Vercel |
| `TELEGRAM_API_HASH` | Telegram API Hash | Same as Vercel |
| `MONGODB_URI` | MongoDB Atlas Connection String | Same as Vercel |
| `WEB_APP_URL` | Your live Vercel web app URL | e.g. `https://your-app.vercel.app` |
| `TELEGRAM_WORKER_SECRET` | Shared authorization secret | Same as Vercel |
| `TELEGRAM_READ_ONLY` | Log messages only (recommended `true` now) | `true` |
| `PORT` | Local container port | `8080` (Railway will provision a domain for this port) |

5. Under the service settings, click **Generate Domain** so the Vercel backend can send POST requests (e.g. `/send-message`) to it. Copy this domain and save it on Vercel as `TELEGRAM_WORKER_PUBLIC_URL`.

---

## 4. Step 3: Deploy the Playwright Fallback Service on Railway

This isolated container service runs Playwright Chromium on-demand only when Google Form prefilling fails.

1. In the same project on Railway, click **New Service** -> **Github Repo**.
2. Select the same repository.
3. In the service settings, set the **Root Directory** to `isolated-fallback-service`. Railway will automatically build the container (installing Playwright and Chromium dependencies).
4. **Mount a Persistent Volume**:
   - Go to settings, add a **Volume**.
   - Mount path: `/app/screenshots` (this stores screenshots on disk instead of flooding your MongoDB).
5. Configure the **Environment Variables**:

| Variable Name | Description | Value |
|---|---|---|
| `MONGODB_URI` | MongoDB Atlas Connection String | Same as Vercel |
| `PUBLIC_URL` | The public domain of this service | Generate a domain in settings and paste it here |
| `PORT` | Local container port | `8080` |

6. Generate a domain for this service in the settings, copy it, and save it on Vercel as `PLAYWRIGHT_SERVICE_URL`.

---

## 5. Step 4: Configure Reminder cron Job

To make sure your deadlines trigger Twilio voice calls and push notifications every 45 seconds, set up a cron job or scheduled monitor:
- Set it to send a `POST` request to:
  `https://your-vercel-app.vercel.app/api/reminders/process-due?apiKey=YOUR_WORKER_SECRET`
- You can run this easily using a free service like **UptimeRobot**, **Cron-Job.org**, or Railway's built-in cron executor!
