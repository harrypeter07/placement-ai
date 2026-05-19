import asyncio
import os
import aiohttp
from datetime import datetime
from dotenv import load_dotenv

from database import get_pending_reminders, mark_reminder_sent

load_dotenv()

WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:3000")


async def send_reminder_notification(reminder: dict):
    """Notify web app / trigger email or telegram reminder."""
    async with aiohttp.ClientSession() as session:
        try:
            await session.post(
                f"{WEB_APP_URL}/api/notifications",
                json={
                    "userId": str(reminder.get("userId")),
                    "title": "Placement Reminder",
                    "message": f"Deadline approaching for reminder {reminder.get('_id')}",
                    "type": "reminder",
                },
                timeout=aiohttp.ClientTimeout(total=10),
            )
        except Exception as e:
            print(f"Failed to send reminder notification: {e}")


async def process_reminders():
    reminders = get_pending_reminders()
    for reminder in reminders:
        await send_reminder_notification(reminder)
        mark_reminder_sent(reminder["_id"])
        print(f"Sent reminder {reminder['_id']} at {datetime.utcnow().isoformat()}")


async def scheduler_loop(interval_seconds: int = 60):
    while True:
        await process_reminders()
        await asyncio.sleep(interval_seconds)


if __name__ == "__main__":
    asyncio.run(scheduler_loop())
