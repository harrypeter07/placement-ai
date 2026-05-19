"""List Telegram groups/channels your account can access. Use IDs in TELEGRAM_GROUP_IDS."""
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
    print("\nYour groups & channels (use the ID in TELEGRAM_GROUP_IDS):\n")
    async for dialog in client.iter_dialogs():
        if dialog.is_group or dialog.is_channel:
            print(f"  {dialog.id}  |  {dialog.name}")
    print("\nExample .env:\n  TELEGRAM_GROUP_IDS=-1001234567890,-1009876543210\n")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
