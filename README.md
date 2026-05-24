# PlaceMint AI

AI-powered placement management and reminder platform. Monitors Telegram placement groups, extracts deadlines with Gemini AI, syncs calendars, and helps students track applications.

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Zustand, Recharts
- **Backend:** Next.js API Routes, Mongoose, NextAuth
- **AI:** Google Gemini API
- **Database:** MongoDB Atlas
- **Worker:** Telethon (Python)

## Project Structure

```
placement-ai/
├── web/                # Next.js application (canonical)
├── telegram-worker/    # Telethon Python worker
├── package.json        # Root workspace scripts
├── vercel.json
└── render.yaml
```

## Quick Start

### 1. Install

```bash
cd placement-ai
npm install
```

### 2. Environment Variables

Copy `web/.env.example` to `web/.env.local` and fill in:

- `MONGODB_URI` — MongoDB Atlas connection string
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud Console OAuth
- `GEMINI_API_KEY` — Google AI Studio

### 3. Run Web App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Telegram Worker (Optional)

```bash
cd telegram-worker
pip install -r requirements.txt
cp .env.example .env
python listener.py
```

Set `WEB_APP_URL=http://localhost:3000` in the worker `.env`.

## How it works

See **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** for Telegram groups (unlimited, dynamic), automation, AI analysis, PWA notifications, and worker setup.

## Features

- Google & credentials authentication (student/admin roles)
- AI extraction of placement posts from Telegram
- Deadline management, calendar sync, reminders
- Eligibility checker and resume analyzer
- Admin broadcasts and analytics
- Command palette (⌘K), dark/light theme

## Deployment

### Vercel

Deploy with root `vercel.json` (builds `web/`).

### Render

Use `render.yaml` for web + worker services.

## Create Admin User

After registering, update role in MongoDB:

```js
db.users.updateOne({ email: "admin@college.edu" }, { $set: { role: "admin" } })
```

## License

MIT
