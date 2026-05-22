import asyncio
import json
import os
import struct
from datetime import datetime, timezone

import aiohttp
from aiohttp import web
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from dotenv import load_dotenv

from ai_parser import parse_placement_message, is_duplicate
from database import save_deadline
from session_config import get_session_path

load_dotenv()

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
# Optional legacy fallback — dashboard monitoring prefs are preferred
LEGACY_GROUP_IDS = [
    int(g.strip())
    for g in os.getenv("TELEGRAM_GROUP_IDS", "").split(",")
    if g.strip()
]
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:3000").rstrip("/")
WORKER_SECRET = os.getenv("TELEGRAM_WORKER_SECRET", "")
READ_ONLY = os.getenv("TELEGRAM_READ_ONLY", "true").lower() in ("1", "true", "yes")
HISTORY_LIMIT = int(os.getenv("TELEGRAM_HISTORY_LIMIT", "40"))
DISCOVER_INTERVAL_SEC = int(os.getenv("TELEGRAM_DISCOVER_INTERVAL_SEC", "900"))
SESSION_POLL_SEC = int(os.getenv("TELEGRAM_SESSION_POLL_SEC", "30"))
KEEPALIVE_INTERVAL_SEC = int(os.getenv("KEEPALIVE_INTERVAL_SEC", "240"))

seen_hashes: set[str] = set()
group_titles: dict[int, str] = {}
monitored_ids: set[int] = set()

try:
    asyncio.get_running_loop()
except RuntimeError:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

client: TelegramClient | None = None
_worker_status: dict[str, str | int] = {
    "telegram": "starting",
    "groups": 0,
    "lastKeepaliveAt": "",
    "keepaliveOk": 0,
}


def is_valid_telethon_string_session(session_str: str) -> bool:
    """Reject GramJS sessions (wrong unpack size) before Telethon loads them."""
    s = (session_str or "").strip()
    if not s or len(s) < 40:
        return False
    if not s.startswith("1"):
        return False
    try:
        import base64

        raw = base64.urlsafe_b64decode(s[1:] + "==")
        struct.unpack(">B4sH256s", raw)
        return True
    except Exception:
        return False


async def fetch_session_string(verbose: bool = True) -> str:
    """Load Telethon StringSession from env or dashboard (saved via Settings OTP flow)."""
    env = os.getenv("TELEGRAM_SESSION_STRING", "").strip()
    if env:
        if verbose:
            print("Using TELEGRAM_SESSION_STRING from environment")
        return env
    if not WORKER_SECRET:
        if verbose:
            print("WARNING: TELEGRAM_WORKER_SECRET not set — cannot fetch session from dashboard")
        return ""
    url = f"{WEB_APP_URL}/api/telegram/session"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                params={"apiKey": WORKER_SECRET},
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                body = await resp.text()
                if resp.status == 200:
                    data = json.loads(body) if body else {}
                    telethon = (data.get("telethonSessionString") or "").strip()
                    legacy = (data.get("sessionString") or "").strip()
                    s = telethon if is_valid_telethon_string_session(telethon) else ""
                    if not s and is_valid_telethon_string_session(legacy):
                        s = legacy
                    if s:
                        if verbose:
                            fmt = data.get("sessionFormat") or ("telethon" if telethon else "legacy")
                            print(f"Loaded Telegram session from dashboard ({fmt})")
                        return s
                    if telethon or legacy:
                        if verbose:
                            print(
                                "Dashboard session is GramJS-only — open Settings → Connect Telegram "
                                "and sign in again once to sync the Render worker session"
                            )
                if resp.status == 404:
                    if verbose:
                        print(
                            f"No session at {url} — open your live app → Settings → Connect Telegram "
                            f"(same MONGODB_URI as this worker)"
                        )
                elif resp.status == 401:
                    if verbose:
                        print(
                            "Session API returned 401 — TELEGRAM_WORKER_SECRET must match on "
                            "Render and Vercel exactly"
                        )
                else:
                    if verbose:
                        print(f"Session fetch {resp.status} from {url}: {body[:200]}")
    except Exception as e:
        if verbose:
            print(f"Session fetch failed ({url}): {e}")
    return ""


async def try_connect_telegram() -> TelegramClient | None:
    """Return connected client or None if session not available yet."""
    global client
    session_str = await fetch_session_string()
    if session_str:
        if not is_valid_telethon_string_session(session_str):
            print(
                "WARNING: Invalid Telethon session string — reconnect in Settings → Connect Telegram"
            )
            return None
        try:
            c = TelegramClient(StringSession(session_str), API_ID, API_HASH)
            await c.connect()
            if await c.is_user_authorized():
                client = c
                return c
            print("WARNING: Dashboard session invalid — reconnect in Settings → Connect Telegram")
        except struct.error as e:
            print(f"WARNING: Could not load Telegram session ({e}) — reconnect in Settings")
        except Exception as e:
            print(f"WARNING: Telegram connect failed ({e})")

    session_path = get_session_path()
    if os.path.exists(f"{session_path}.session"):
        c = TelegramClient(session_path, API_ID, API_HASH)
        await c.connect()
        if await c.is_user_authorized():
            print("Using legacy file session from telegram-worker/sessions/")
            client = c
            return c

    return None


async def wait_for_telegram() -> TelegramClient:
    """Poll until user connects Telegram in dashboard (keeps Render worker alive)."""
    attempt = 0
    while True:
        attempt += 1
        c = await try_connect_telegram()
        if c:
            return c

        msg = (
            "Waiting for Telegram login in dashboard "
            f"(attempt {attempt}, retry in {SESSION_POLL_SEC}s)…"
        )
        print(msg)
        await send_heartbeat(
            groups=0,
            error="Connect Telegram in Settings (phone + OTP), then worker will auto-connect",
            status="waiting",
        )
        await asyncio.sleep(SESSION_POLL_SEC)


async def send_heartbeat(
    groups: int = 0,
    last_message_at: str | None = None,
    error: str | None = None,
    status: str = "online",
):
    if not WORKER_SECRET:
        print("WARNING: TELEGRAM_WORKER_SECRET not set — dashboard will show worker offline")
        return
    try:
        payload = {
            "apiKey": WORKER_SECRET,
            "status": status,
            "groupsMonitored": groups,
        }
        if last_message_at:
            payload["lastMessageAt"] = last_message_at
        if error:
            payload["lastError"] = error
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{WEB_APP_URL}/api/telegram/heartbeat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    print(f"Heartbeat OK → {WEB_APP_URL}")
                else:
                    text = await resp.text()
                    print(f"Heartbeat failed {resp.status}: {text[:200]}")
    except Exception as e:
        print(f"Heartbeat failed (check WEB_APP_URL={WEB_APP_URL}): {e}")


async def discover_and_sync_all_groups():
    """Fetch every group/channel from Telegram and sync to the web app catalog."""
    if not WORKER_SECRET:
        return 0
    groups = []
    async for dialog in client.iter_dialogs():
        if not (dialog.is_group or dialog.is_channel):
            continue
        gid = dialog.id
        title = dialog.name or str(gid)
        group_titles[gid] = title
        kind = "channel" if dialog.is_channel else "group"
        username = getattr(dialog.entity, "username", None) if dialog.entity else None
        groups.append(
            {
                "groupId": str(gid),
                "title": title,
                "kind": kind,
                "username": username or "",
            }
        )
    if not groups:
        print("No groups/channels found on this Telegram account")
        return 0
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{WEB_APP_URL}/api/telegram/groups",
                json={"apiKey": WORKER_SECRET, "groups": groups},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status == 200:
                    print(f"Discovered & synced {len(groups)} group(s)/channel(s) to dashboard")
                else:
                    print(f"Group catalog sync failed {resp.status}: {(await resp.text())[:120]}")
    except Exception as e:
        print(f"Group catalog sync failed: {e}")
    return len(groups)


async def refresh_monitored_ids() -> set[int]:
    """Load monitored group IDs from all users' dashboard preferences."""
    global monitored_ids
    ids: set[int] = set(LEGACY_GROUP_IDS)

    if WORKER_SECRET:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{WEB_APP_URL}/api/telegram/groups/monitored",
                    params={"apiKey": WORKER_SECRET},
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for raw in data.get("groupIds", []):
                            try:
                                ids.add(int(raw))
                            except (TypeError, ValueError):
                                pass
                    else:
                        print(f"Monitored list fetch failed {resp.status}")
        except Exception as e:
            print(f"Monitored list fetch failed: {e}")

    monitored_ids = ids
    _worker_status["groups"] = len(ids)
    if ids:
        print(f"Monitoring {len(ids)} group(s) from dashboard: {sorted(ids)}", flush=True)
    else:
        print("No groups enabled for monitoring yet — users can toggle ON in Notifications", flush=True)
    return ids


async def log_message_via_api(
    message_text: str,
    message_id: str,
    group_id: str,
    group_title: str,
    sent_at: datetime,
    sender_name: str | None = None,
):
    if not WORKER_SECRET or not message_text.strip():
        return
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{WEB_APP_URL}/api/telegram/messages",
                json={
                    "apiKey": WORKER_SECRET,
                    "groupId": group_id,
                    "groupTitle": group_title,
                    "messageId": message_id,
                    "text": message_text,
                    "senderName": sender_name,
                    "sentAt": sent_at.isoformat(),
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status >= 400:
                    data = await resp.json()
                    print(f"  Message log error {resp.status}: {data}")
    except Exception as e:
        print(f"  Message log failed: {e}")


async def backfill_group_history(chat_id: int, title: str):
    if not WORKER_SECRET:
        return
    print(f"  Backfilling last {HISTORY_LIMIT} messages for {title}...")
    count = 0
    async for msg in client.iter_messages(chat_id, limit=HISTORY_LIMIT):
        text = msg.message or ""
        if not text.strip():
            continue
        sender = await msg.get_sender()
        sender_name = None
        if sender:
            sender_name = getattr(sender, "first_name", None) or getattr(sender, "title", None)
        sent = msg.date or datetime.now(timezone.utc)
        if sent.tzinfo is None:
            sent = sent.replace(tzinfo=timezone.utc)
        await log_message_via_api(text, str(msg.id), str(chat_id), title, sent, sender_name)
        count += 1
    print(f"  Backfilled {count} message(s) for {title}")


async def ingest_via_api(message_text: str, message_id: str, group_id: str):
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{WEB_APP_URL}/api/telegram/ingest",
            json={
                "message": message_text,
                "messageId": message_id,
                "groupId": group_id,
                "apiKey": WORKER_SECRET,
            },
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            data = await resp.json()
            if resp.status >= 400:
                print(f"Ingest API error {resp.status}: {data}")
            else:
                print(f"Ingest API OK: {data.get('created', data)}")


async def heartbeat_loop():
    tick = 0
    while True:
        await refresh_monitored_ids()
        await send_heartbeat(groups=len(monitored_ids))
        tick += 1
        if tick % max(1, DISCOVER_INTERVAL_SEC // 45) == 0:
            await discover_and_sync_all_groups()
        await asyncio.sleep(45)


async def on_new_message(event):
    chat_id = event.chat_id
    if not monitored_ids or chat_id not in monitored_ids:
        return

    text = event.message.message or ""
    if not text.strip():
        return

    title = group_titles.get(chat_id)
    if not title:
        try:
            entity = await client.get_entity(chat_id)
            title = getattr(entity, "title", None) or getattr(entity, "name", None) or str(chat_id)
            group_titles[chat_id] = title
        except Exception:
            title = str(chat_id)

    sent = event.message.date or datetime.now(timezone.utc)
    if sent.tzinfo is None:
        sent = sent.replace(tzinfo=timezone.utc)

    sender_name = None
    try:
        sender = await event.get_sender()
        if sender:
            sender_name = getattr(sender, "first_name", None) or getattr(sender, "title", None)
    except Exception:
        pass

    print(f"New message in {title}: {text[:80]}...")
    await log_message_via_api(text, str(event.message.id), str(chat_id), title, sent, sender_name)

    if READ_ONLY:
        print("  [READ-ONLY] Logged to Notifications")
        await send_heartbeat(groups=len(monitored_ids), last_message_at=datetime.now(timezone.utc).isoformat())
        return

    if len(text) < 20:
        return

    extracted = parse_placement_message(text)
    if extracted.get("confidence", 0) < 0.3 or not extracted.get("company"):
        print("  Skipped (not a placement post)")
        return

    company = extracted["company"]
    role = extracted.get("role") or "Role TBD"

    if is_duplicate(company, role, seen_hashes):
        print(f"  Duplicate skipped: {company} - {role}")
        return

    deadline_str = extracted.get("deadline")
    try:
        deadline = datetime.fromisoformat(deadline_str.replace("Z", "+00:00")) if deadline_str else datetime.utcnow()
    except ValueError:
        deadline = datetime.utcnow()

    doc = {
        **extracted,
        "deadline": deadline,
        "sourceMessageId": str(event.message.id),
        "telegramGroupId": str(event.chat_id),
    }

    doc_id = save_deadline(doc)
    if doc_id:
        print(f"  Saved: {company} - {role} (confidence: {extracted.get('confidence')})")
        await ingest_via_api(text, str(event.message.id), str(event.chat_id))
        await send_heartbeat(groups=len(monitored_ids), last_message_at=datetime.utcnow().isoformat())
    else:
        print(f"  DB duplicate: {company}")


def _public_worker_urls() -> list[str]:
    """URLs to ping so Render Web Service stays warm (external inbound traffic)."""
    urls: list[str] = []
    for key in ("RENDER_EXTERNAL_URL", "WORKER_PUBLIC_URL", "PUBLIC_URL"):
        raw = (os.getenv(key) or "").strip().rstrip("/")
        if raw and raw not in urls:
            urls.append(raw)
    port = int(os.getenv("PORT", "0") or "0")
    if port > 0:
        local = f"http://127.0.0.1:{port}"
        if local not in urls:
            urls.append(local)
    return urls


async def keepalive_loop() -> None:
    """Ping /health on a schedule — prevents Render free/paid idle spin-down."""
    urls = _public_worker_urls()
    if not urls:
        return
    print(
        f"Keepalive every {KEEPALIVE_INTERVAL_SEC}s → {', '.join(urls)}",
        flush=True,
    )
    while True:
        for base in urls:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{base}/health",
                        timeout=aiohttp.ClientTimeout(total=25),
                    ) as resp:
                        if resp.status == 200:
                            _worker_status["keepaliveOk"] = int(_worker_status.get("keepaliveOk", 0)) + 1
                            _worker_status["lastKeepaliveAt"] = datetime.now(timezone.utc).isoformat()
            except Exception as e:
                print(f"Keepalive ping failed ({base}): {e}", flush=True)
        await asyncio.sleep(KEEPALIVE_INTERVAL_SEC)


async def start_render_health_server() -> web.AppRunner | None:
    """
    Render Web Services require a bound PORT before deploy health checks pass.
    Background Workers omit PORT — then we skip HTTP entirely.
    """
    port = int(os.getenv("PORT", "0") or "0")
    if port <= 0:
        print("No PORT set — Background Worker mode (no HTTP server)", flush=True)
        return None

    async def health(_request: web.Request) -> web.Response:
        return web.json_response(
            {
                "ok": True,
                "service": "placemint-telegram-worker",
                "mode": "web",
                "telegram": _worker_status.get("telegram"),
                "monitoredGroups": _worker_status.get("groups", 0),
                "lastKeepaliveAt": _worker_status.get("lastKeepaliveAt"),
                "keepalivePings": _worker_status.get("keepaliveOk", 0),
            }
        )

    app = web.Application()
    app.router.add_get("/", health)
    app.router.add_get("/health", health)

    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", port).start()
    print(f"Health server listening on 0.0.0.0:{port} (Render Web Service)", flush=True)
    return runner


async def run_telegram_worker() -> None:
    """Telegram loop — runs in parallel when deployed as a Web Service."""
    global client
    _worker_status["telegram"] = "waiting_for_session"
    print("Connecting to Telegram (waits until Settings → Connect Telegram is done)…", flush=True)
    await wait_for_telegram()
    assert client is not None
    client.add_event_handler(on_new_message, events.NewMessage())
    me = await client.get_me()
    _worker_status["telegram"] = "connected"
    print(f"Logged in as {me.first_name} (@{me.username})", flush=True)
    print("Dynamic groups: catalog synced from Telegram; monitoring from dashboard toggles", flush=True)

    await discover_and_sync_all_groups()
    await refresh_monitored_ids()
    _worker_status["groups"] = len(monitored_ids)

    for gid in monitored_ids:
        title = group_titles.get(gid)
        if not title:
            try:
                entity = await client.get_entity(gid)
                title = getattr(entity, "title", None) or getattr(entity, "name", None) or str(gid)
                group_titles[gid] = title
            except Exception:
                title = str(gid)
        await backfill_group_history(gid, title)

    print("Waiting for new messages...\n", flush=True)

    asyncio.create_task(heartbeat_loop())
    await send_heartbeat(groups=len(monitored_ids))
    await client.run_until_disconnected()


async def run_telegram_worker_loop() -> None:
    """Restart Telegram after disconnect/crash so Web Service process stays up."""
    while True:
        try:
            await run_telegram_worker()
            _worker_status["telegram"] = "disconnected"
            print("Telegram disconnected — reconnecting in 30s…", flush=True)
        except Exception as e:
            _worker_status["telegram"] = "error"
            print(f"Telegram worker error: {e} — retry in 60s", flush=True)
            await asyncio.sleep(60)
            continue
        await asyncio.sleep(30)


async def main() -> None:
    if not API_ID or not API_HASH:
        print("ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH", flush=True)
        return

    print("placemint telegram-worker starting…", flush=True)
    print(f"WEB_APP_URL={WEB_APP_URL}", flush=True)
    print(f"WORKER_SECRET={'set' if WORKER_SECRET else 'MISSING'}", flush=True)

    # Bind PORT first so Render Web Service deploy does not time out
    http_runner = await start_render_health_server()

    try:
        if http_runner:
            print("Web Service mode: HTTP + Telegram + keepalive in parallel", flush=True)
            asyncio.create_task(keepalive_loop())
            asyncio.create_task(run_telegram_worker_loop())
            stop = asyncio.Event()
            await stop.wait()
        else:
            await run_telegram_worker_loop()
    finally:
        if http_runner:
            await http_runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
