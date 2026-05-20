"""List Telegram groups/channels your account can access (debug helper)."""
import asyncio
import os
from telethon import TelegramClient
from dotenv import load_dotenv
from session_config import get_session_path

load_dotenv()

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
PHONE = os.getenv("TELEGRAM_PHONE", "")


async def main():
    client = TelegramClient(get_session_path(), API_ID, API_HASH)
    await client.start(phone=PHONE)
    print("\nYour groups & channels (enable Monitor in dashboard Notifications):\n")
    async for dialog in client.iter_dialogs():
        if dialog.is_group or dialog.is_channel:
            print(f"  {dialog.id}  |  {dialog.name}")
    print("\nNormally you do not need this script — listener.py syncs all groups to the app.\n")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
