import asyncio
import os
from datetime import datetime, timezone

import aiohttp
from telethon import TelegramClient, events
from dotenv import load_dotenv

from ai_parser import parse_placement_message, is_duplicate
from database import save_deadline
from session_config import get_session_path

load_dotenv()

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
PHONE = os.getenv("TELEGRAM_PHONE", "")
GROUP_IDS = [int(g.strip()) for g in os.getenv("TELEGRAM_GROUP_IDS", "").split(",") if g.strip()]
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:3000").rstrip("/")
WORKER_SECRET = os.getenv("TELEGRAM_WORKER_SECRET", "")
READ_ONLY = os.getenv("TELEGRAM_READ_ONLY", "true").lower() in ("1", "true", "yes")
HISTORY_LIMIT = int(os.getenv("TELEGRAM_HISTORY_LIMIT", "40"))

seen_hashes: set[str] = set()
group_titles: dict[int, str] = {}
client = TelegramClient(get_session_path(), API_ID, API_HASH)


async def send_heartbeat(groups: int = 0, last_message_at: str | None = None, error: str | None = None):
    if not WORKER_SECRET:
        print("WARNING: TELEGRAM_WORKER_SECRET not set — dashboard will show worker offline")
        return
    try:
        payload = {
            "apiKey": WORKER_SECRET,
            "status": "online",
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
                    print(f"  → Is npm run dev running? WEB_APP_URL must match (e.g. http://localhost:3001)")
    except Exception as e:
        print(f"Heartbeat failed (check WEB_APP_URL={WEB_APP_URL}): {e}")


async def sync_groups_to_api():
    if not WORKER_SECRET or not GROUP_IDS:
        return
    groups = []
    for gid in GROUP_IDS:
        try:
            entity = await client.get_entity(gid)
            title = getattr(entity, "title", None) or getattr(entity, "name", None) or str(gid)
            group_titles[gid] = title
            groups.append({"groupId": str(gid), "title": title})
        except Exception as e:
            print(f"  Could not resolve group {gid}: {e}")
    if not groups:
        return
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{WEB_APP_URL}/api/telegram/groups",
                json={"apiKey": WORKER_SECRET, "groups": groups},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 200:
                    print(f"Synced {len(groups)} group(s) to dashboard")
                else:
                    print(f"Group sync failed {resp.status}: {(await resp.text())[:120]}")
    except Exception as e:
        print(f"Group sync failed: {e}")


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
    while True:
        await send_heartbeat(groups=len(GROUP_IDS))
        await asyncio.sleep(45)


@client.on(events.NewMessage(chats=GROUP_IDS if GROUP_IDS else None))
async def handler(event):
    text = event.message.message or ""
    if not text.strip():
        return

    chat_id = event.chat_id
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
        print("  [READ-ONLY] Logged to Notifications — placement ingest disabled")
        await send_heartbeat(groups=len(GROUP_IDS), last_message_at=datetime.now(timezone.utc).isoformat())
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
        await send_heartbeat(groups=len(GROUP_IDS), last_message_at=datetime.utcnow().isoformat())
    else:
        print(f"  DB duplicate: {company}")


async def main():
    if not API_ID or not API_HASH:
        print("ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH in telegram-worker/.env")
        return
    if not GROUP_IDS:
        print("WARNING: TELEGRAM_GROUP_IDS is empty. Run: python list_groups.py")
    print(f"Connecting to Telegram as {PHONE}...")
    await client.start(phone=PHONE)
    me = await client.get_me()
    print(f"Logged in as {me.first_name} (@{me.username})")
    print(f"Listening to {len(GROUP_IDS)} group(s): {GROUP_IDS}")
    print(f"WEB_APP_URL={WEB_APP_URL}")
    if READ_ONLY:
        print("READ-ONLY: messages appear in Notifications; placement ingest is off")
    else:
        print(f"Will forward placements to {WEB_APP_URL}/api/telegram/ingest")

    await sync_groups_to_api()
    for gid in GROUP_IDS:
        title = group_titles.get(gid, str(gid))
        await backfill_group_history(gid, title)

    print("Waiting for new messages...\n")

    asyncio.create_task(heartbeat_loop())
    await send_heartbeat(groups=len(GROUP_IDS))
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
