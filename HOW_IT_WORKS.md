# How PlaceMint AI Works

This guide explains the full system: Telegram groups, automation, AI analysis, reminders, and mobile/PWA notifications.

---

## Architecture (3 parts)

| Part | Host | Role |
|------|------|------|
| **Web app** | Vercel (`plarm.vercel.app`) | Login, settings, group list, analyze messages, deadlines, calendar |
| **Database** | MongoDB Atlas | Users, groups, messages, sessions, insights, deadlines |
| **Telegram worker** | Render (Python + Telethon) | Listens to Telegram, stores messages, optional auto-ingest |

All three must share the **same `MONGODB_URI`** and **`TELEGRAM_WORKER_SECRET`**.

---

## Telegram groups (dynamic — not limited to 2)

### Old way (deprecated)

`TELEGRAM_GROUP_IDS` in Render env was a fixed list of 1–2 group IDs.

### Current way (unlimited)

1. **Connect Telegram** in Settings (phone + OTP).
2. **Notifications → Sync all groups** — worker discovers every group/channel on your account and saves them to MongoDB.
3. Turn **Monitor ON** on any group (green switch on the right of each row).
4. Monitored IDs are stored per user in `StudentPreferences.telegram.monitoredGroupIds`.
5. Render worker calls `GET /api/telegram/groups/monitored` and listens to the **union** of all users’ monitored groups.

There is **no hard limit** on how many groups you can monitor.

### Group list order

Groups are sorted by **most recent message first** (`lastMessageAt`), then name.

---

## Typical workflow

```
Connect Telegram → Sync all groups → Monitor ON (per group)
       → Select group → Analyze (loads N messages + AI)
       → Review insights → Set deadline (only items with real dates)
```

**Analyze** automatically:

- Fetches up to **N messages** from Telegram (N = Settings → Messages per group, default 25).
- Runs AI or smart rules on those messages.
- Saves draft insights to MongoDB.

---

## AI analysis

| Engine | When |
|--------|------|
| **Gemini** | `GEMINI_API_KEY` set on Vercel (Production + Preview) |
| **Smart rules** | Built-in placement parser (dates, TCS/Infosys, urgency) if Gemini is off or fails |

You will **not** see a blocking “Gemini not configured” toast. Analysis still runs with smart rules. For richer results, add `GEMINI_API_KEY` in Vercel and redeploy.

---

## Automation

| Setting | Effect |
|---------|--------|
| **Monitor ON** | Worker listens for new messages in that group |
| **Auto-run insights** | Periodically analyze monitored groups (if enabled) |
| **Auto-create deadlines** | When applying insights (if enabled) |
| **Reminders** | Created from deadlines with offsets (24h, 6h, 1h, etc.) |
| **Escalation** | Overdue reminders increase priority |

Worker also **discovers groups** periodically and **backfills** message history when monitoring is enabled.

---

## Notifications on phone / PWA

### Browser notifications

1. Open the app while signed in (ideally **installed to home screen** on mobile).
2. After ~1.5s a banner asks **Allow notifications** — tap it (required on iOS/Android).
3. Reminder due checks can show system notifications via the service worker.

### Push (optional, Firebase)

If these are set on Vercel:

- `NEXT_PUBLIC_FIREBASE_*` variables
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

…then FCM can deliver push when the app is closed. Without Firebase, **in-app + browser notifications** still work when the app is open or installed as PWA.

### iOS notes

- Add to Home Screen from Safari/Chrome.
- Allow notifications when prompted.
- iOS may not show the prompt until the PWA is opened from the home screen icon.

---

## Render worker session

The worker needs a **Telethon** session string (different encoding from the website GramJS login).

1. Connect Telegram on the website.
2. Click **Sync Render worker session** in Settings (once after deploy).
3. Worker polls `/api/telegram/session` every 30s.

If logs say “GramJS copy”, redeploy Vercel + Render and sync again — the API can auto-convert the session.

---

## Environment variables (cheat sheet)

### Vercel (web)

- `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`
- `TELEGRAM_WORKER_SECRET`
- `GEMINI_API_KEY` (recommended)
- Firebase `NEXT_PUBLIC_*` (optional push)

### Render (worker)

- Same `MONGODB_URI`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_WORKER_SECRET`
- `WEB_APP_URL` = your Vercel URL
- `TELEGRAM_GROUP_IDS` = optional legacy only (leave empty)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Only 2 groups / worker ignores groups | Remove reliance on `TELEGRAM_GROUP_IDS`; use Monitor ON + Sync all groups |
| No notification prompt | Sign in, open dashboard, wait for banner; install PWA on mobile |
| Worker “waiting” | Sync Render worker session; match secrets |
| Weak analysis | Add `GEMINI_API_KEY` on Vercel; increase message count in Settings |
| Groups not sorted | Redeploy latest Vercel (sorts by last message date) |

---

## More detail

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for Vercel/Render setup and [README.md](./README.md) for development commands.
